"""API Management — the 24-endpoint registry (12 SAP source + 12 FinSight destination),
live API testing with latency recording, and outage simulation toggles."""

import random
import uuid
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query

from lib.audit import log_audit
from lib.auth import require_action
from lib.db import db
from lib.pipeline import utcnow
from models.dto import HealthToggleRequest
from models.integration import ApiEndpoint, EndpointTest

router = APIRouter(prefix="/api-mgmt", tags=["api-management"])


async def _attach_stats(endpoints: list[dict]) -> list[ApiEndpoint]:
    tests = await db.api_tests.find({}, {"endpoint_id": 1, "success": 1, "latency_ms": 1, "created_at": 1}) \
        .sort("created_at", -1).to_list(3000)
    by_ep: dict[str, dict] = {}
    for t in tests:
        s = by_ep.setdefault(t["endpoint_id"], {"count": 0, "success": 0, "lat_sum": 0, "last": None})
        s["count"] += 1
        s["success"] += 1 if t["success"] else 0
        s["lat_sum"] += t["latency_ms"]
        if s["last"] is None:
            s["last"] = t
    out = []
    for ep in endpoints:
        s = by_ep.get(ep["id"])
        stats = {
            "test_count": s["count"] if s else 0,
            "test_success_count": s["success"] if s else 0,
            "avg_latency_ms": round(s["lat_sum"] / s["count"], 1) if s else None,
            "last_test_at": s["last"]["created_at"] if s else None,
            "last_test_success": s["last"]["success"] if s else None,
        }
        out.append(ApiEndpoint(**{**ep, **stats}))
    return out


@router.get("/endpoints", response_model=list[ApiEndpoint])
async def list_endpoints():
    eps = await db.api_endpoints.find().sort([("side", 1), ("domain", 1)]).to_list(100)
    return await _attach_stats(eps)


@router.get("/endpoints/{eid}", response_model=ApiEndpoint)
async def get_endpoint(eid: str):
    ep = await db.api_endpoints.find_one({"id": eid})
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    return (await _attach_stats([ep]))[0]


@router.post("/endpoints/{eid}/test", response_model=EndpointTest)
async def test_endpoint(eid: str, user: dict = Depends(require_action("apim:test"))):
    ep = await db.api_endpoints.find_one({"id": eid})
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")

    latency = max(40, min(900, int(random.gauss(150, 60))))
    if ep["status"] == "down":
        status_code, success = 503, False
        response_sample = {
            "error": {
                "code": "SERVICE_UNAVAILABLE",
                "message": f"{ep['base_url']} is unreachable — simulated outage is active on this endpoint",
                "timestamp": utcnow().isoformat(),
            }
        }
    elif random.random() < 0.02:
        status_code, success = 504, False
        response_sample = {"error": {"code": "GATEWAY_TIMEOUT", "message": "Upstream did not respond within 30s (simulated)"}}
    else:
        status_code, success = 200, True
        response_sample = ep["response_sample"]

    test = {
        "id": str(uuid.uuid4()),
        "endpoint_id": ep["id"], "endpoint_key": ep["key"], "method": ep["method"], "path": ep["path"],
        "status_code": status_code, "success": success, "latency_ms": latency,
        "request_sample": ep["request_sample"], "response_sample": response_sample,
        "tested_by_email": user["email"], "created_at": utcnow(),
    }
    await db.api_tests.insert_one(test)
    await log_audit("apim:test", user, {"endpoint": ep["key"], "status_code": status_code, "latency_ms": latency,
                                        "severity" if False else "outcome": "success" if success else "failure"},
                    severity="info" if success else "error")
    return EndpointTest(**test)


@router.post("/endpoints/{eid}/health", response_model=ApiEndpoint)
async def toggle_health(eid: str, body: HealthToggleRequest, user: dict = Depends(require_action("apim:toggle"))):
    if body.status not in ("up", "down"):
        raise HTTPException(status_code=422, detail="status must be 'up' or 'down'")
    ep = await db.api_endpoints.find_one({"id": eid})
    if not ep:
        raise HTTPException(status_code=404, detail="Endpoint not found")
    await db.api_endpoints.update_one({"id": eid}, {"$set": {"status": body.status}})
    await log_audit("apim:toggle", user, {"endpoint": ep["key"], "status": body.status})
    updated = await db.api_endpoints.find_one({"id": eid})
    return (await _attach_stats([updated]))[0]


@router.get("/tests", response_model=list[EndpointTest])
async def list_tests(limit: int = Query(50, ge=1, le=200)):
    docs = await db.api_tests.find().sort("created_at", -1).limit(limit).to_list(limit)
    return [EndpointTest(**d) for d in docs]
