"""Monitoring — 12 live metrics computed from real data, configurable alert thresholds."""

import math
from datetime import timedelta
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException

from lib.aggregations import source_status_counts
from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.pipeline import utcnow
from models.dto import ThresholdUpdate
from models.integration import AlertItem, MonitoringMetric

router = APIRouter(prefix="/monitoring", tags=["monitoring"])

METRIC_DEFS: list[dict] = [
    {"key": "p95_latency_ms", "name": "P95 API Latency", "unit": "ms", "category": "Performance", "direction": "above", "warn": 400, "crit": 700, "description": "95th-percentile latency across API tests in the last hour"},
    {"key": "p99_latency_ms", "name": "P99 API Latency", "unit": "ms", "category": "Performance", "direction": "above", "warn": 600, "crit": 900, "description": "99th-percentile latency across API tests in the last hour"},
    {"key": "api_error_rate_pct", "name": "API Error Rate", "unit": "%", "category": "Reliability", "direction": "above", "warn": 5, "crit": 10, "description": "Failed share of API tests in the last hour"},
    {"key": "throughput_records_per_min", "name": "ETL Throughput", "unit": "records/min", "category": "Performance", "direction": "below", "warn": 5, "crit": 1, "description": "Records loaded to FinSight per minute (last hour)"},
    {"key": "memory_consumption_pct", "name": "Memory Consumption", "unit": "%", "category": "Platform", "direction": "above", "warn": 85, "crit": 95, "description": "Host memory utilisation"},
    {"key": "worker_availability_pct", "name": "Worker Pool Health", "unit": "%", "category": "Platform", "direction": "below", "warn": 95, "crit": 80, "description": "Share of the 12 domain pipelines not blocked by an open circuit breaker"},
    {"key": "ingestion_backlog_records", "name": "Ingestion Backlog", "unit": "records", "category": "Pipeline", "direction": "above", "warn": 200, "crit": 500, "description": "SAP records pending extraction"},
    {"key": "retry_queue_depth", "name": "Retry Queue Depth", "unit": "records", "category": "Errors", "direction": "above", "warn": 30, "crit": 80, "description": "Errors open or in backoff (not yet dead-lettered)"},
    {"key": "db_pool_utilization_pct", "name": "DB Connection Pool", "unit": "%", "category": "Platform", "direction": "above", "warn": 60, "crit": 85, "description": "MongoDB connections in use vs available"},
    {"key": "gst_validation_pass_rate_pct", "name": "GST Validation Pass Rate", "unit": "%", "category": "Compliance", "direction": "below", "warn": 95, "crit": 85, "description": "Taxable FinSight records whose CGST/SGST/IGST splits are internally consistent"},
    {"key": "currency_freshness_hours", "name": "FX Rate Freshness", "unit": "hours", "category": "Compliance", "direction": "above", "warn": 24, "crit": 72, "description": "Age of the INR consolidation rates"},
    {"key": "audit_compliance_pct", "name": "Audit Trail Coverage", "unit": "%", "category": "Compliance", "direction": "below", "warn": 99, "crit": 90, "description": "ETL jobs (30d) carrying an immutable audit-trail entry"},
]


def _memory_pct() -> float:
    try:
        info: dict[str, float] = {}
        for line in Path("/proc/meminfo").read_text().splitlines():
            parts = line.split(":")
            if len(parts) == 2:
                info[parts[0]] = float(parts[1].strip().split()[0])
        total, available = info.get("MemTotal", 0), info.get("MemAvailable", 0)
        return round(100 * (total - available) / total, 1) if total else 0.0
    except Exception:
        return 0.0


async def _db_pool_pct() -> float:
    try:
        status = await db.command("serverStatus")
        conns = status.get("connections", {})
        current, available = conns.get("current", 0), conns.get("available", 1)
        return round(100 * current / max(current + available, 1), 1)
    except Exception:
        return 0.0


async def _live_values() -> dict[str, float]:
    now = utcnow()
    hour_ago = now - timedelta(hours=1)
    values: dict[str, float] = {}

    tests = await db.api_tests.find({"created_at": {"$gte": hour_ago}}, {"latency_ms": 1, "success": 1}).to_list(3000)
    latencies = sorted(t["latency_ms"] for t in tests)

    def _pct(p: float) -> float:
        if not latencies:
            return 0.0
        idx = min(len(latencies) - 1, max(0, math.ceil(len(latencies) * p) - 1))
        return float(latencies[idx])

    values["p95_latency_ms"] = _pct(0.95)
    values["p99_latency_ms"] = _pct(0.99)
    ok = sum(1 for t in tests if t["success"])
    values["api_error_rate_pct"] = round(100 * (len(tests) - ok) / len(tests), 1) if tests else 0.0

    loaded_hour = await db.dest_records.count_documents({"loaded_at": {"$gte": hour_ago}})
    values["throughput_records_per_min"] = round(loaded_hour / 60, 1)
    values["memory_consumption_pct"] = _memory_pct()

    open_breakers = await db.circuit_breakers.count_documents({"state": "open"})
    values["worker_availability_pct"] = round(100 * (1 - open_breakers / 12), 1)

    counts = await source_status_counts()
    values["ingestion_backlog_records"] = counts["pending"]
    values["retry_queue_depth"] = await db.error_records.count_documents(
        {"dead_letter": False, "status": {"$in": ["open", "backoff"]}}
    )
    values["db_pool_utilization_pct"] = await _db_pool_pct()

    taxable = await db.dest_records.count_documents({"gst_treatment": {"$in": ["intra", "inter"]}})
    if taxable:
        bad = await db.dest_records.count_documents({
            "gst_treatment": {"$in": ["intra", "inter"]},
            "$expr": {"$gt": [{"$abs": {"$subtract": [
                {"$add": [{"$ifNull": ["$cgst_inr", 0]}, {"$ifNull": ["$sgst_inr", 0]}, {"$ifNull": ["$igst_inr", 0]}]},
                {"$ifNull": ["$tax_amount_inr", 0]},
            ]}}, 0.05]},
        })
        values["gst_validation_pass_rate_pct"] = round(100 * (taxable - bad) / taxable, 1)
    else:
        values["gst_validation_pass_rate_pct"] = 100.0

    settings = await db.settings.find_one({"key": "fx"})
    fx_at = (settings or {}).get("fx_synced_at")
    if fx_at:
        values["currency_freshness_hours"] = round((now - fx_at).total_seconds() / 3600, 1)
    else:
        values["currency_freshness_hours"] = 999.0

    since = now - timedelta(days=30)
    job_ids = [j["id"] async for j in db.sync_jobs.find({"created_at": {"$gte": since}}, {"id": 1})]
    if job_ids:
        audited = await db.audit_logs.count_documents({"action": "sync:run", "detail.job_id": {"$in": job_ids}})
        values["audit_compliance_pct"] = round(100 * audited / len(job_ids), 1)
    else:
        values["audit_compliance_pct"] = 100.0

    return values


def _state_of(direction: str, value: float, warn: float, crit: float) -> str:
    if direction == "above":
        return "crit" if value >= crit else ("warn" if value >= warn else "ok")
    return "crit" if value <= crit else ("warn" if value <= warn else "ok")


async def _metrics_with_values() -> list[MonitoringMetric]:
    now = utcnow()
    live = await _live_values()
    docs = {d["key"]: d for d in await db.monitoring_metrics.find().to_list(50)}
    out = []
    for d in METRIC_DEFS:
        doc = docs.get(d["key"]) or {}
        warn = doc.get("warn_threshold", d["warn"])
        crit = doc.get("crit_threshold", d["crit"])
        value = live.get(d["key"], 0.0)
        out.append(MonitoringMetric(
            id=doc.get("id", d["key"]), key=d["key"], name=d["name"], unit=d["unit"], category=d["category"],
            description=d["description"], direction=d["direction"], warn_threshold=warn, crit_threshold=crit,
            value=value, state=_state_of(d["direction"], value, warn, crit), computed_at=now,
        ))
    return out


@router.get("/metrics", response_model=list[MonitoringMetric])
async def get_metrics():
    return await _metrics_with_values()


@router.put("/metrics/{key}", response_model=MonitoringMetric)
async def update_thresholds(key: str, body: ThresholdUpdate, user: dict = Depends(require_action("monitoring:configure"))):
    d = next((m for m in METRIC_DEFS if m["key"] == key), None)
    if not d:
        raise HTTPException(status_code=404, detail=f"Unknown metric '{key}'")
    if body.warn_threshold < 0 or body.crit_threshold < 0:
        raise HTTPException(status_code=422, detail="Thresholds must be non-negative")
    await db.monitoring_metrics.update_one(
        {"key": key},
        {"$set": {"warn_threshold": body.warn_threshold, "crit_threshold": body.crit_threshold,
                  "updated_at": utcnow(), "updated_by_email": user["email"]}},
        upsert=True,
    )
    await log_audit("monitoring:thresholds", user, {"metric": key, "warn": body.warn_threshold, "crit": body.crit_threshold})
    metrics = await _metrics_with_values()
    return next(m for m in metrics if m.key == key)


@router.get("/alerts", response_model=list[AlertItem])
async def get_alerts():
    metrics = await _metrics_with_values()
    alerts = []
    for m in metrics:
        if m.state == "ok" or m.value is None:
            continue
        threshold = m.crit_threshold if m.state == "crit" else m.warn_threshold
        op = ">=" if m.direction == "above" else "<="
        alerts.append(AlertItem(
            metric_key=m.key, metric_name=m.name, severity=m.state, value=m.value,
            threshold=threshold, unit=m.unit,
            message=f"{m.name} is {m.value}{(' ' + m.unit) if m.unit else ''} ({op} {threshold}) — {m.state.upper()} threshold breached",
        ))
    return alerts


@router.get("/timeseries")
async def timeseries():
    now = utcnow()
    since = now - timedelta(hours=24)
    tests = await db.api_tests.find({"created_at": {"$gte": since}}, {"created_at": 1, "latency_ms": 1, "success": 1}).to_list(5000)
    loads = await db.dest_records.find({"loaded_at": {"$gte": since}}, {"loaded_at": 1}).to_list(5000)

    lat_buckets: dict[str, dict] = {}
    for t in tests:
        hour = t["created_at"].strftime("%d/%m %H:00")
        b = lat_buckets.setdefault(hour, {"lat_sum": 0, "n": 0, "errors": 0})
        b["lat_sum"] += t["latency_ms"]
        b["n"] += 1
        if not t["success"]:
            b["errors"] += 1
    load_buckets: dict[str, int] = {}
    for d in loads:
        hour = d["loaded_at"].strftime("%d/%m %H:00")
        load_buckets[hour] = load_buckets.get(hour, 0) + 1

    hours = sorted(set(lat_buckets) | set(load_buckets))
    return {
        "latency": [
            {"hour": h, "avg_latency_ms": round(lat_buckets[h]["lat_sum"] / lat_buckets[h]["n"], 1),
             "errors": lat_buckets[h]["errors"]}
            for h in hours if h in lat_buckets
        ],
        "throughput": [{"hour": h, "records": load_buckets[h]} for h in hours if h in load_buckets],
    }
