"""Error Management — classification, retry with exponential backoff, circuit breakers, DLQ."""

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.pipeline import attempt_error_recovery, breaker_snapshot, utcnow
from lib.sap_sim import DOMAIN_ORDER
from models.dto import ErrorPage, RequeueRequest
from models.integration import CircuitBreaker, ErrorRecord

router = APIRouter(prefix="/errors", tags=["error-management"])

# Only these source fields may be corrected from the DLQ inspector
PATCHABLE_FIELDS = {"amount", "party_gstin", "sap_doc_date", "currency"}


@router.get("", response_model=ErrorPage)
async def list_errors(
    status: str | None = None,
    classification: str | None = None,
    domain: str | None = None,
    limit: int = Query(50, ge=1, le=200),
):
    query: dict = {}
    if status:
        query["status"] = status
    if classification:
        query["classification"] = classification
    if domain:
        query["domain"] = domain
    docs = await db.error_records.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    count_rows = await db.error_records.aggregate([
        {"$group": {"_id": "$classification", "count": {"$sum": 1}}},
    ]).to_list(50)
    return ErrorPage(items=[ErrorRecord(**d) for d in docs], counts={r["_id"]: r["count"] for r in count_rows})


@router.post("/{eid}/retry", response_model=ErrorRecord)
async def retry_error(eid: str, user: dict = Depends(require_action("errors:retry"))):
    err = await db.error_records.find_one({"id": eid})
    if not err:
        raise HTTPException(status_code=404, detail="Error record not found")
    if err.get("dead_letter"):
        raise HTTPException(status_code=400, detail="Record is in the dead-letter queue — use Requeue instead")
    if err.get("status") == "resolved":
        raise HTTPException(status_code=400, detail="Error already resolved")
    updated = await attempt_error_recovery(err)
    await log_audit("errors:retry", user, {"error_id": eid, "outcome": updated["status"], "attempts": updated["attempts"]})
    return ErrorRecord(**updated)


@router.get("/dlq", response_model=list[ErrorRecord])
async def list_dlq(limit: int = Query(50, ge=1, le=200)):
    docs = await db.error_records.find({"dead_letter": True}).sort("created_at", -1).limit(limit).to_list(limit)
    return [ErrorRecord(**d) for d in docs]


@router.post("/dlq/{eid}/requeue", response_model=ErrorRecord)
async def requeue(eid: str, body: RequeueRequest, user: dict = Depends(require_action("errors:requeue"))):
    err = await db.error_records.find_one({"id": eid})
    if not err:
        raise HTTPException(status_code=404, detail="Error record not found")
    if not err.get("dead_letter"):
        raise HTTPException(status_code=400, detail="Record is not in the dead-letter queue")
    if body.patched_payload:
        patch = {k: v for k, v in body.patched_payload.items() if k in PATCHABLE_FIELDS and v is not None}
        if err.get("source_id") and patch:
            await db.source_records.update_one({"id": err["source_id"]}, {"$set": patch})
            await log_audit("errors:dlq_patch", user, {"error_id": eid, "fields": sorted(patch.keys())})
    updated = await attempt_error_recovery(err)
    await log_audit("errors:requeue", user, {"error_id": eid, "outcome": updated["status"]})
    return ErrorRecord(**updated)


async def _snapshot_with_endpoint(domain: str) -> CircuitBreaker:
    snap = await breaker_snapshot(domain)
    ep = await db.api_endpoints.find_one({"domain": domain, "side": "source"}, {"key": 1, "status": 1})
    snap["endpoint_key"] = (ep or {}).get("key")
    snap["endpoint_status"] = (ep or {}).get("status")
    return CircuitBreaker(**snap)


@router.get("/circuit-breakers", response_model=list[CircuitBreaker])
async def list_breakers():
    return [await _snapshot_with_endpoint(domain) for domain in DOMAIN_ORDER]


@router.post("/circuit-breakers/{domain}/reset", response_model=CircuitBreaker)
async def reset_breaker(domain: str, user: dict = Depends(require_action("errors:breaker-reset"))):
    if domain not in DOMAIN_ORDER:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{domain}'")
    now = utcnow()
    await db.circuit_breakers.update_one(
        {"key": f"src:{domain}"},
        {"$set": {"key": f"src:{domain}", "domain": domain, "state": "closed",
                  "consecutive_failures": 0, "opened_at": None, "updated_at": now}},
        upsert=True,
    )
    await log_audit("errors:breaker_reset", user, {"domain": domain})
    return await _snapshot_with_endpoint(domain)
