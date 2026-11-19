"""Dashboard — the command-center aggregate, fed entirely by live MongoDB data."""

from datetime import timedelta

from fastapi import APIRouter, Depends

from lib.aggregations import financial_summary, plant_performance, source_status_counts
from lib.auth import get_current_user
from lib.db import db
from lib.pipeline import utcnow
from lib.sap_sim import DOMAINS, DOMAIN_ORDER

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/summary")
async def summary(user: dict = Depends(get_current_user)):
    now = utcnow()
    counts = await source_status_counts()
    dest_total = await db.dest_records.count_documents({})

    tests = await db.api_tests.find({}, {"success": 1, "latency_ms": 1, "created_at": 1}) \
        .sort("created_at", -1).to_list(500)
    api_total = len(tests)
    api_ok = sum(1 for t in tests if t["success"])
    api_success_rate = round(100 * api_ok / api_total, 1) if api_total else 0.0
    api_avg_latency = round(sum(t["latency_ms"] for t in tests) / api_total, 1) if api_total else 0.0

    jobs = await db.sync_jobs.find().sort("created_at", -1).to_list(50)
    for j in jobs:
        j.pop("_id", None)
    since = now - timedelta(days=30)
    jobs_30d = [j for j in jobs if j["created_at"] >= since]
    sync_ok = sum(1 for j in jobs_30d if j["status"] in ("success", "partial"))

    fin = await financial_summary()

    src_rows = await db.source_records.aggregate([
        {"$group": {"_id": {"domain": "$domain", "status": "$status"}, "count": {"$sum": 1}}},
    ]).to_list(100)
    dest_rows = await db.dest_records.aggregate([
        {"$group": {"_id": "$domain", "count": {"$sum": 1}}},
    ]).to_list(20)
    last_jobs = await db.sync_jobs.aggregate([
        {"$group": {"_id": "$domain", "last": {"$max": "$created_at"}}},
    ]).to_list(20)

    by_domain: dict[str, dict] = {}
    for row in src_rows:
        e = by_domain.setdefault(row["_id"]["domain"], {"total": 0, "pending": 0, "synced": 0, "failed": 0})
        st = row["_id"]["status"] if row["_id"]["status"] in ("pending", "synced", "failed") else "pending"
        e[st] += row["count"]
        e["total"] += row["count"]
    dest_by_domain = {r["_id"]: r["count"] for r in dest_rows}
    last_by_domain = {r["_id"]: r["last"] for r in last_jobs}

    domain_health = []
    for k in DOMAIN_ORDER:
        e = by_domain.get(k, {"total": 0, "pending": 0, "synced": 0, "failed": 0})
        domain_health.append({
            "key": k, "name": DOMAINS[k]["name"], **e,
            "dest_count": dest_by_domain.get(k, 0), "last_sync_at": last_by_domain.get(k),
        })

    src_up = await db.api_endpoints.count_documents({"side": "source", "status": "up"})
    src_total = await db.api_endpoints.count_documents({"side": "source"})
    breakers_open = await db.circuit_breakers.count_documents({"state": "open"})

    # 24h latency / error-rate trend from real API test results
    recent_tests = await db.api_tests.find(
        {"created_at": {"$gte": now - timedelta(hours=24)}},
        {"latency_ms": 1, "success": 1, "created_at": 1},
    ).sort("created_at", 1).to_list(2000)
    buckets: dict[str, dict] = {}
    for t in recent_tests:
        h = t["created_at"].strftime("%d/%m %H:00")
        b = buckets.setdefault(h, {"lat_sum": 0, "n": 0, "errors": 0})
        b["lat_sum"] += t["latency_ms"]
        b["n"] += 1
        if not t["success"]:
            b["errors"] += 1
    latency_trend = [
        {"hour": h, "avg_latency_ms": round(b["lat_sum"] / b["n"], 1),
         "error_rate_pct": round(100 * b["errors"] / b["n"], 1)}
        for h, b in sorted(buckets.items())
    ]

    audit_recent = await db.audit_logs.find().sort("created_at", -1).to_list(10)
    for entry in audit_recent:
        entry.pop("_id", None)

    return {
        "records": {**counts, "destination": dest_total},
        "api": {"total_tests": api_total, "success_rate_pct": api_success_rate, "avg_latency_ms": api_avg_latency},
        "sync": {"jobs_30d": len(jobs_30d), "successful_jobs_30d": sync_ok, "last_job": jobs[0] if jobs else None},
        "financial": fin,
        "pipeline": {"source_endpoints_up": src_up, "source_endpoints_total": src_total, "breakers_open": breakers_open},
        "domain_health": domain_health,
        "status_mix": [{"status": s, "count": counts[s]} for s in ("synced", "pending", "failed")],
        "latency_trend": latency_trend,
        "plants": await plant_performance(),
        "audit_recent": audit_recent,
        "generated_at": now,
    }
