"""Data Transformation — field-mapping directory, FX rates, and the transformation sandbox."""

from fastapi import APIRouter, Depends, HTTPException

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.fx import FX_SOURCE,FX_TO_INR
from lib.pipeline import utcnow
from lib.sap_sim import DOMAINS
from lib.transform import sandbox_transform
from models.dto import SandboxRequest
from models.integration import FieldMapping

router = APIRouter(prefix="/mappings", tags=["transformation"])


@router.get("", response_model=list[FieldMapping])
async def list_mappings():
    docs = await db.field_mappings.find().sort([("domain", 1), ("sap_field", 1)]).to_list(300)
    return [FieldMapping(**d) for d in docs]


@router.get("/fx")
async def fx_rates():
    settings = await db.settings.find_one({"key": "fx"})
    payload = {
        "source": FX_SOURCE,
        "synced_at": (settings or {}).get("fx_synced_at"),
        "rates": [
            {"currency": cur, "rate_to_inr": rate}
            for cur, rate in sorted(
                # local import keeps the FX table as the single source of truth
                __import__("lib.fx", fromlist=["FX_TO_INR"]).FX_TO_INR.items()
            )
        ],
    }
    return payload


@router.post("/test")
async def test_transform(body: SandboxRequest, user: dict = Depends(require_action("mappings:test"))):
    if body.domain not in DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{body.domain}'")
    result = sandbox_transform(body.domain, body.payload)
    await log_audit("mappings:test", user, {"domain": body.domain, "issues": len(result["issues"])})
    return result


@router.post("/fx/refresh")
async def refresh_fx(user: dict = Depends(require_action("monitoring:configure"))):
    await db.settings.update_one({"key": "fx"}, {"$set": {"fx_synced_at": utcnow(), "source": FX_SOURCE}}, upsert=True)
    await log_audit("fx:refresh", user, {})
    return {"ok": True, "synced_at": utcnow()}
