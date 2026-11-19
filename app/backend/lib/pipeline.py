"""Core integration pipeline shared by the routers and the seeder.

Extract → Transform → Load with duplicate prevention, error classification,
exponential-backoff retries, a per-endpoint circuit breaker, and reconciliation.
"""

import time
import uuid
from datetime import datetime, timedelta, timezone

from pymongo.errors import BulkWriteError, DuplicateKeyError

from lib.audit import log_audit
from lib.db import db
from lib.transform import transform_record

BREAKER_THRESHOLD = 5          # consecutive failures per source endpoint → OPEN
BREAKER_COOLDOWN_S = 90        # OPEN → HALF-OPEN after this many seconds
MAX_RETRY_ATTEMPTS = 4         # 4th failed attempt dead-letters the record


class BreakerOpen(Exception):
    def __init__(self, payload: dict):
        self.payload = payload
        super().__init__(payload.get("message", "circuit breaker open"))


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


# ---------------------------------------------------------------- circuit breaker

def _effective_state(doc: dict | None) -> str:
    if not doc:
        return "closed"
    if doc.get("state") == "open":
        opened = doc.get("opened_at")
        if opened and (utcnow() - opened).total_seconds() >= BREAKER_COOLDOWN_S:
            return "half_open"
        return "open"
    return doc.get("state", "closed")


async def breaker_snapshot(domain: str) -> dict:
    key = f"src:{domain}"
    doc = await db.circuit_breakers.find_one({"key": key})
    return {
        "key": key,
        "domain": domain,
        "state": _effective_state(doc),
        "consecutive_failures": (doc or {}).get("consecutive_failures", 0),
        "total_failures": (doc or {}).get("total_failures", 0),
        "opened_at": (doc or {}).get("opened_at"),
        "updated_at": (doc or {}).get("updated_at"),
    }


async def record_breaker_result(domain: str, success: bool) -> dict:
    key = f"src:{domain}"
    doc = await db.circuit_breakers.find_one({"key": key})
    now = utcnow()
    if success:
        new = {"key": key, "domain": domain, "state": "closed", "consecutive_failures": 0,
               "total_failures": (doc or {}).get("total_failures", 0), "opened_at": None, "updated_at": now}
    else:
        fails = (doc or {}).get("consecutive_failures", 0) + 1
        state = "open" if fails >= BREAKER_THRESHOLD else (doc or {}).get("state", "closed")
        if state == "half_open":
            state = "open"  # trial failed — re-open
        new = {"key": key, "domain": domain, "state": state, "consecutive_failures": fails,
               "total_failures": (doc or {}).get("total_failures", 0) + 1,
               "opened_at": now if state == "open" else (doc or {}).get("opened_at"), "updated_at": now}
    await db.circuit_breakers.update_one({"key": key}, {"$set": new}, upsert=True)
    return new


async def ensure_breaker_not_open(domain: str) -> dict:
    snap = await breaker_snapshot(domain)
    if snap["state"] == "open":
        raise BreakerOpen({
            "message": f"Circuit breaker for domain '{domain}' is OPEN — sync blocked. "
                       f"Reset it in Error Management or wait out the {BREAKER_COOLDOWN_S}s cooldown.",
            "breaker": snap,
        })
    return snap


# ---------------------------------------------------------------- error records

def backoff_seconds(attempts: int) -> int:
    """Exponential backoff: attempt 1 → 2s, 2 → 4s, 3 → 8s, 4 → 16s."""
    return 2 ** max(attempts, 1)


async def record_error(source_record: dict, classification: str, message: str, job_id: str | None,
                       attempts: int = 0, status: str = "open") -> dict:
    now = utcnow()
    err = {
        "id": str(uuid.uuid4()),
        "source_id": source_record.get("id"),
        "source_doc_no": source_record.get("sap_doc_no"),
        "domain": source_record.get("domain"),
        "domain_name": source_record.get("domain_name"),
        "classification": classification,
        "message": message,
        "job_id": job_id,
        "attempts": attempts,
        "status": status,  # open | backoff | resolved | dead_letter
        "dead_letter": False,
        "next_retry_at": now + timedelta(seconds=backoff_seconds(max(attempts, 1))),
        "payload_snapshot": {
            "sap_doc_no": source_record.get("sap_doc_no"),
            "amount": source_record.get("amount"),
            "currency": source_record.get("currency"),
            "party_gstin": source_record.get("party_gstin"),
            "sap_doc_date": source_record.get("sap_doc_date"),
        },
        "region": "ap-south-1",
        "created_at": now,
        "resolved_at": None,
    }
    await db.error_records.insert_one(err)
    if source_record.get("id"):
        await db.source_records.update_one(
            {"id": source_record["id"]},
            {"$set": {"status": "failed", "error_id": err["id"], "sync_job_id": job_id}},
        )
    return err


async def _fail_attempt(err: dict, attempts: int, message: str) -> dict:
    if attempts >= MAX_RETRY_ATTEMPTS:
        updated = {**err, "attempts": attempts, "status": "dead_letter", "dead_letter": True, "message": message}
    else:
        updated = {**err, "attempts": attempts, "status": "backoff",
                   "next_retry_at": utcnow() + timedelta(seconds=backoff_seconds(attempts)), "message": message}
    await db.error_records.update_one({"id": err["id"]}, {"$set": {k: v for k, v in updated.items() if k != "id"}})
    return updated


async def attempt_error_recovery(err: dict) -> dict:
    """Re-run the failed record through the pipeline. Returns the updated error doc."""
    now = utcnow()
    attempts = err.get("attempts", 0) + 1
    classification = err.get("classification", "validation_error")

    # Network-class errors only recover when the source endpoint is healthy again.
    if classification in ("network_timeout", "auth_failure"):
        endpoint = await db.api_endpoints.find_one({"domain": err.get("domain"), "side": "source"})
        if endpoint and endpoint.get("status") == "down":
            await record_breaker_result(err.get("domain"), False)
            return await _fail_attempt(err, attempts, "SAP source endpoint is still unreachable (simulated outage)")

    src = await db.source_records.find_one({"id": err["source_id"]}) if err.get("source_id") else None
    if not src:
        return await _fail_attempt(err, attempts, "Source document no longer exists — cannot retry")

    dest, _steps, issues = transform_record(src, sync_job_id=err.get("job_id"))
    if issues:
        return await _fail_attempt(err, attempts, issues[0]["message"])
    try:
        await db.dest_records.insert_one({**dest, "loaded_at": now})
    except DuplicateKeyError:
        return await _fail_attempt(err, attempts, "Destination already contains this checksum (duplicate blocked)")

    await db.source_records.update_one(
        {"id": src["id"]},
        {"$set": {"status": "synced", "error_id": None, "sync_job_id": dest["sync_job_id"]}},
    )
    await record_breaker_result(err.get("domain"), True)
    updated = {**err, "attempts": attempts, "status": "resolved", "dead_letter": False,
               "resolved_at": now, "message": "Recovered on retry — record loaded to FinSight"}
    await db.error_records.update_one({"id": err["id"]}, {"$set": {k: v for k, v in updated.items() if k != "id"}})
    return updated


# ---------------------------------------------------------------- ETL

async def load_batch(dest_docs: list[dict]) -> tuple[int, int]:
    """Insert with duplicate prevention (unique checksum index). Returns (loaded, duplicates)."""
    if not dest_docs:
        return 0, 0
    try:
        await db.dest_records.insert_many(dest_docs, ordered=False)
        return len(dest_docs), 0
    except BulkWriteError as exc:
        errs = exc.details.get("writeErrors", [])
        dups = sum(1 for we in errs if we.get("code") == 11000)
        other = [we for we in errs if we.get("code") != 11000]
        if other:
            raise RuntimeError(f"load failed: {other[0].get('errmsg', 'unknown write error')}")
        return len(dest_docs) - dups, dups


async def execute_etl(domain: str, batch_size: int, strategy: str, triggered_by: dict,
                      reprocess: bool = False, mode: str = "manual") -> dict:
    """Full ETL run for one domain. Raises BreakerOpen when the circuit is open."""
    started = time.perf_counter()
    now = utcnow()
    job_id = str(uuid.uuid4())

    src_endpoint = await db.api_endpoints.find_one({"domain": domain, "side": "source"})
    if not src_endpoint:
        raise ValueError(f"No SAP source endpoint configured for domain '{domain}'")

    await ensure_breaker_not_open(domain)

    domain_doc = await db.source_records.find_one({"domain": domain})
    domain_name = (domain_doc or {}).get("domain_name", domain)

    # ---- EXTRACT
    query = {"domain": domain} if reprocess else {"domain": domain, "status": "pending"}
    sort_dir = -1 if reprocess else 1  # reprocess takes the newest batch; normal ETL drains oldest pending first
    docs = await db.source_records.find(query).sort("created_at", sort_dir).to_list(batch_size)

    if not docs:
        raise ValueError(f"No {'records' if reprocess else 'pending records'} to sync for '{domain}' — "
                         f"generate a batch in the SAP Simulator first")

    # ---- simulated SAP endpoint outage → whole batch fails as network timeouts
    if src_endpoint.get("status") == "down":
        for doc in docs:
            await record_error(doc, "network_timeout",
                               f"SAP OData endpoint {src_endpoint['key']} unreachable (simulated outage) — "
                               f"connection timed out after 30s", job_id)
        await record_breaker_result(domain, False)
        duration_ms = int((time.perf_counter() - started) * 1000)
        job = {
            "id": job_id, "domain": domain, "domain_name": domain_name, "batch_size": batch_size,
            "strategy": strategy, "reprocess": reprocess, "mode": mode,
            "extracted": len(docs), "transformed": 0, "loaded": 0, "duplicates_skipped": 0,
            "validation_failed": 0, "failed": len(docs), "duration_ms": duration_ms,
            "status": "failed", "triggered_by_email": triggered_by.get("email"),
            "message": "SAP source endpoint unreachable (simulated outage)",
            "created_at": now, "finished_at": utcnow(),
        }
        await db.sync_jobs.insert_one(job)
        await log_audit("sync:run", triggered_by, {"job_id": job_id, "domain": domain, "status": "failed"}, severity="error")
        return job

    # ---- TRANSFORM
    dest_docs, failed_pairs = [], []
    for doc in docs:
        dest, _steps, issues = transform_record(doc, sync_job_id=job_id)
        if issues:
            failed_pairs.append((doc, issues))
        else:
            dest_docs.append(dest)

    validation_failed = len(failed_pairs)

    # ---- LOAD — duplicate prevention: skip checksums already present in FinSight
    checksums = [d["checksum"] for d in dest_docs]
    pre_existing: set[str] = set()
    if checksums:
        cursor = db.dest_records.find({"checksum": {"$in": checksums}}, {"checksum": 1})
        pre_existing = {p["checksum"] async for p in cursor}
    fresh = [d for d in dest_docs if d["checksum"] not in pre_existing]
    loaded, bulk_dups = await load_batch(fresh)
    duplicates = len(pre_existing) + bulk_dups

    # Sources with a valid transform are considered synced (fresh loads now; duplicates
    # were already loaded to FinSight by an earlier job).
    await db.source_records.update_many(
        {"id": {"$in": [d["source_id"] for d in dest_docs]}},
        {"$set": {"status": "synced", "sync_job_id": job_id, "error_id": None}},
    )
    for doc, issues in failed_pairs:
        first = issues[0]
        await record_error(doc, first["code"].lower(), first["message"], job_id)

    await record_breaker_result(domain, True)
    duration_ms = int((time.perf_counter() - started) * 1000)
    status = "success" if validation_failed == 0 and duplicates == 0 else "partial"
    job = {
        "id": job_id, "domain": domain, "domain_name": domain_name, "batch_size": batch_size,
        "strategy": strategy, "reprocess": reprocess, "mode": mode,
        "extracted": len(docs), "transformed": len(dest_docs), "loaded": loaded,
        "duplicates_skipped": duplicates, "validation_failed": validation_failed,
        "failed": validation_failed, "duration_ms": duration_ms, "status": status,
        "triggered_by_email": triggered_by.get("email"),
        "message": f"Loaded {loaded} records to FinSight · {validation_failed} validation failures · {duplicates} duplicates blocked",
        "created_at": now, "finished_at": utcnow(),
    }
    await db.sync_jobs.insert_one(job)
    await log_audit("sync:run", triggered_by, {"job_id": job_id, "domain": domain, "status": status,
                                               "loaded": loaded, "failed": validation_failed})
    return job


# ---------------------------------------------------------------- reconciliation

def _classify_row(src: dict, dest: dict | None) -> tuple[str, float | None]:
    if not dest:
        return "missing_in_destination", None
    delta = round((src.get("amount_inr") or 0) - (dest.get("gross_amount_inr") or 0), 2)
    if abs(delta) > 0.01:
        return "mismatch", delta
    return "matched", delta


async def compare_domain(domain: str, triggered_by: dict, scope_all: bool = False) -> dict:
    started = time.perf_counter()
    now = utcnow()
    base_query = {} if scope_all else {"domain": domain}
    src_docs = await db.source_records.find({**base_query, "status": "synced"}).to_list(5000)
    dest_docs = await db.dest_records.find(base_query).to_list(5000)
    dest_by_checksum = {d["checksum"]: d for d in dest_docs}

    rows: list[dict] = []
    counts = {"matched": 0, "mismatch": 0, "missing_in_destination": 0}
    src_debit = src_credit = dest_debit = dest_credit = 0.0

    for src in src_docs:
        dest = dest_by_checksum.get(src["checksum"])
        kind, delta = _classify_row(src, dest)
        counts[kind] += 1
        amt = src.get("amount_inr") or 0
        if src["debit_credit"] == "D":
            src_debit += amt
        else:
            src_credit += amt
        if dest:
            damt = dest.get("gross_amount_inr") or 0
            if dest["debit_credit"] == "Debit":
                dest_debit += damt
            else:
                dest_credit += damt
        if kind != "matched" or len(rows) < 25:
            rows.append({
                "source_id": src["id"], "dest_id": (dest or {}).get("id"), "domain": src["domain"],
                "domain_name": src["domain_name"], "sap_doc_no": src["sap_doc_no"],
                "finsight_ref": (dest or {}).get("finsight_ref"),
                "plant_code": src["plant_code"], "party_name": src.get("party_name"),
                "source_amount_inr": src.get("amount_inr"), "dest_amount_inr": (dest or {}).get("gross_amount_inr"),
                "source_debit_credit": "Debit" if src["debit_credit"] == "D" else "Credit",
                "dest_debit_credit": (dest or {}).get("debit_credit"),
                "delta_inr": delta, "kind": kind,
            })

    # exceptions first for the inspector
    rows.sort(key=lambda r: (r["kind"] == "matched", r["kind"] == "missing_in_destination"))
    variance = round((src_debit - src_credit) - (dest_debit - dest_credit), 2)
    run = {
        "id": str(uuid.uuid4()),
        "scope": "all" if scope_all else domain,
        "domain": None if scope_all else domain,
        "counts": {**counts, "total": len(src_docs)},
        "totals": {
            "source_debit_total_inr": round(src_debit, 2), "source_credit_total_inr": round(src_credit, 2),
            "dest_debit_total_inr": round(dest_debit, 2), "dest_credit_total_inr": round(dest_credit, 2),
            "variance_inr": variance,
        },
        "status": "reconciled" if counts["mismatch"] == 0 and counts["missing_in_destination"] == 0 and abs(variance) <= 0.01 else "exceptions_found",
        "adjusted": False,
        "rows": rows[:150],
        "duration_ms": int((time.perf_counter() - started) * 1000),
        "created_by_email": triggered_by.get("email"),
        "created_at": now,
    }
    await db.reconciliation_runs.insert_one(run)
    await log_audit("recon:run", triggered_by, {"run_id": run["id"], "scope": run["scope"],
                                                "status": run["status"], "mismatches": counts["mismatch"]})
    return run
