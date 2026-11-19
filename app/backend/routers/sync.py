"""Data Synchronization — ETL runner, batch processing, job history, schedule configuration."""

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.pipeline import BreakerOpen, execute_etl, utcnow
from lib.sap_sim import DOMAINS
from models.dto import ScheduleUpdate, SyncRunRequest
from models.integration import SyncJob, SyncSchedule

router = APIRouter(prefix="/sync", tags=["synchronization"])

SCHEDULE_INTERVALS = ["Every 15 minutes", "Hourly", "Every 6 hours", "Daily at 00:00 IST", "Paused"]


@router.post("/run", response_model=SyncJob)
async def run_sync(body: SyncRunRequest, user: dict = Depends(require_action("sync:run"))):
    if body.domain not in DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{body.domain}'")
    if body.strategy not in ("checksum", "doc_id"):
        raise HTTPException(status_code=422, detail="strategy must be 'checksum' or 'doc_id'")
    try:
        job = await execute_etl(body.domain, body.batch_size, body.strategy, user, reprocess=body.reprocess)
    except BreakerOpen as exc:
        raise HTTPException(status_code=409, detail=exc.payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return job


@router.get("/jobs", response_model=list[SyncJob])
async def list_jobs(domain: str | None = None, limit: int = Query(30, ge=1, le=200)):
    query = {"domain": domain} if domain else {}
    docs = await db.sync_jobs.find(query).sort("created_at", -1).limit(limit).to_list(limit)
    return [SyncJob(**d) for d in docs]


@router.get("/jobs/{jid}", response_model=SyncJob)
async def get_job(jid: str):
    doc = await db.sync_jobs.find_one({"id": jid})
    if not doc:
        raise HTTPException(status_code=404, detail="Sync job not found")
    return SyncJob(**doc)


@router.get("/schedules", response_model=list[SyncSchedule])
async def list_schedules():
    docs = await db.sync_schedules.find().sort("domain", 1).to_list(50)
    return [SyncSchedule(**d) for d in docs]


@router.put("/schedules/{domain}", response_model=SyncSchedule)
async def update_schedule(domain: str, body: ScheduleUpdate, user: dict = Depends(require_action("sync:schedule"))):
    if domain not in DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{domain}'")
    if body.interval not in SCHEDULE_INTERVALS:
        raise HTTPException(status_code=422, detail=f"interval must be one of: {', '.join(SCHEDULE_INTERVALS)}")
    now = utcnow()
    await db.sync_schedules.update_one(
        {"domain": domain},
        {"$set": {"domain": domain, "domain_name": DOMAINS[domain]["name"], "interval": body.interval, "updated_at": now}},
        upsert=True,
    )
    await log_audit("sync:schedule", user, {"domain": domain, "interval": body.interval})
    return SyncSchedule(domain=domain, domain_name=DOMAINS[domain]["name"], interval=body.interval, updated_at=now)
