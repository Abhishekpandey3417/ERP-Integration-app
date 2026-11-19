"""Reconciliation — compare SAP source records against FinSight destination records,
with debit/credit totals, variance and one-click auto-adjust."""

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.pipeline import compare_domain
from lib.sap_sim import DOMAINS
from models.dto import ReconRunRequest
from models.integration import ReconciliationRun

router = APIRouter(prefix="/recon", tags=["reconciliation"])


@router.post("/run", response_model=ReconciliationRun)
async def run_reconciliation(body: ReconRunRequest, user: dict = Depends(require_action("recon:run"))):
    if body.domain and body.domain not in DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{body.domain}'")
    run = await compare_domain(body.domain or "all", user, scope_all=body.domain is None)
    return run


@router.get("/runs", response_model=list[ReconciliationRun])
async def list_runs(limit: int = Query(10, ge=1, le=50)):
    docs = await db.reconciliation_runs.find({}, {"rows": 0}).sort("created_at", -1).limit(limit).to_list(limit)
    return [ReconciliationRun(**{**d, "rows": []}) for d in docs]


@router.get("/runs/{rid}", response_model=ReconciliationRun)
async def get_run(rid: str):
    doc = await db.reconciliation_runs.find_one({"id": rid})
    if not doc:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")
    return ReconciliationRun(**doc)


@router.post("/runs/{rid}/adjust", response_model=ReconciliationRun)
async def adjust_run(rid: str, user: dict = Depends(require_action("recon:adjust"))):
    run = await db.reconciliation_runs.find_one({"id": rid})
    if not run:
        raise HTTPException(status_code=404, detail="Reconciliation run not found")
    if run.get("adjusted"):
        raise HTTPException(status_code=400, detail="This run has already been adjusted")

    adjusted = 0
    variance_delta = 0.0
    for row in run.get("rows", []):
        if row["kind"] != "mismatch" or not row.get("dest_id"):
            continue
        dest = await db.dest_records.find_one({"id": row["dest_id"]}, {"tax_amount_inr": 1})
        tax = ((dest or {}).get("tax_amount_inr") or 0) if dest else 0
        source_amount = row.get("source_amount_inr") or 0
        await db.dest_records.update_one(
            {"id": row["dest_id"]},
            {"$set": {"gross_amount_inr": source_amount, "net_amount_inr": round(source_amount - tax, 2)}},
        )
        adjusted += 1
        variance_delta += row.get("delta_inr") or 0

    counts = {**run["counts"], "mismatch": 0}
    totals = {**run["totals"], "variance_inr": round(run["totals"]["variance_inr"] - variance_delta, 2)}
    status = "reconciled" if counts["missing_in_destination"] == 0 and abs(totals["variance_inr"]) <= 0.01 else run["status"]
    await db.reconciliation_runs.update_one(
        {"id": rid},
        {"$set": {"counts": counts, "totals": totals, "status": status, "adjusted": True}},
    )
    await log_audit("recon:adjust", user, {"run_id": rid, "adjusted_records": adjusted})
    updated = await db.reconciliation_runs.find_one({"id": rid})
    return ReconciliationRun(**updated)
