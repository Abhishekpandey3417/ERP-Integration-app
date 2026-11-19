"""SAP ERP Simulator — browse the 12 domains, generate simulated batches, inspect raw payloads."""

import re
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.sap_sim import DOMAINS, DOMAIN_ORDER, PLANTS, generate_records, idoc_payload
from models.dto import GenerateRequest
from models.records import DomainStat, RecordPage, SourceRecord

router = APIRouter(prefix="/simulator", tags=["sap-simulator"])

DOMAIN_META = [
    {"key": k, "name": DOMAINS[k]["name"], "sap_table": DOMAINS[k]["sap_table"], "doc_type": DOMAINS[k]["doc_type"]}
    for k in DOMAIN_ORDER
]


@router.get("/meta")
async def meta():
    return {"domains": DOMAIN_META, "plants": PLANTS}


@router.get("/domains", response_model=list[DomainStat])
async def list_domains():
    src_rows = await db.source_records.aggregate([
        {"$group": {"_id": {"domain": "$domain", "status": "$status"}, "count": {"$sum": 1}}},
    ]).to_list(100)
    dest_rows = await db.dest_records.aggregate([
        {"$group": {"_id": "$domain", "count": {"$sum": 1}}},
    ]).to_list(20)
    last_jobs = await db.sync_jobs.aggregate([
        {"$group": {"_id": "$domain", "last": {"$max": "$created_at"}}},
    ]).to_list(20)

    src: dict[str, dict] = {}
    for row in src_rows:
        entry = src.setdefault(row["_id"]["domain"], {"total": 0, "pending": 0, "synced": 0, "failed": 0})
        entry[row["_id"]["status"] if row["_id"]["status"] in ("pending", "synced", "failed") else "pending"] += row["count"]
        entry["total"] += row["count"]
    dest = {r["_id"]: r["count"] for r in dest_rows}
    last = {r["_id"]: r["last"] for r in last_jobs}

    return [
        DomainStat(
            key=k, name=DOMAINS[k]["name"], sap_table=DOMAINS[k]["sap_table"], doc_type=DOMAINS[k]["doc_type"],
            total=src.get(k, {}).get("total", 0), pending=src.get(k, {}).get("pending", 0),
            synced=src.get(k, {}).get("synced", 0), failed=src.get(k, {}).get("failed", 0),
            dest_count=dest.get(k, 0), last_sync_at=last.get(k),
        )
        for k in DOMAIN_ORDER
    ]


@router.get("/records", response_model=RecordPage)
async def list_records(
    domain: str | None = None,
    status: str | None = None,
    plant: str | None = None,
    search: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=100),
):
    query: dict = {}
    if domain:
        query["domain"] = domain
    if status:
        query["status"] = status
    if plant:
        query["plant_code"] = plant
    if search:
        safe = re.escape(search)
        query["$or"] = [{"sap_doc_no": {"$regex": safe, "$options": "i"}}, {"party_name": {"$regex": safe, "$options": "i"}}]

    total = await db.source_records.count_documents(query)
    docs = await db.source_records.find(query).sort([("doc_date", -1), ("sap_doc_no", -1)]).skip((page - 1) * page_size).limit(page_size).to_list(page_size)
    return RecordPage(items=[SourceRecord(**d) for d in docs], total=total, page=page, page_size=page_size)


@router.get("/records/{rid}/payload")
async def record_payload(rid: str):
    doc = await db.source_records.find_one({"id": rid})
    if not doc:
        raise HTTPException(status_code=404, detail="Record not found")
    return {"sap_doc_no": doc["sap_doc_no"], "payload": idoc_payload(doc)}


@router.post("/generate")
async def generate(body: GenerateRequest, user: dict = Depends(require_action("simulator:generate"))):
    if body.domain not in DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{body.domain}'")
    docs = generate_records(body.domain, body.count, days_back=120)
    if docs:
        await db.source_records.insert_many(docs)
    await log_audit("simulator:generate", user, {"domain": body.domain, "count": len(docs)})
    return {"created": len(docs), "domain": body.domain, "domain_name": DOMAINS[body.domain]["name"]}
