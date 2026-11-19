"""One-shot, idempotent seeder for the Integration Bridge demo dataset.

Run:  cd /app/backend && python seed.py [--force]

Creates demo users, 24 API endpoints, 80+ field mappings, monitoring thresholds,
sync schedules, ~1,080 simulated SAP source records, ETL history (including a
deliberate Material Ledger outage with an OPEN circuit breaker), API test history,
reconciliation exceptions and audit-trail entries. Nothing here contacts a real
SAP or FinSight system.
"""

import asyncio
import random
import sys
import uuid
from datetime import timedelta

from lib.audit import log_audit
from lib.auth import hash_password
from lib.db import db, ensure_indexes
from lib.fx import FX_SOURCE
from lib.pipeline import compare_domain, execute_etl, utcnow
from lib.sap_sim import DOMAINS, DOMAIN_ORDER, generate_records
from lib.transform import MAPPING_RULES, TRANSFORM_LABELS
from routers.monitoring import METRIC_DEFS

SEED_PASSWORD = "meridian2026"
SAP_BASE = "https://sap4hana-demo.meridian.local"       # simulated — no real SAP connectivity
FINSIGHT_BASE = "https://finsight.meridian-demo.local"  # simulated FinSight destination
COLLECTIONS = [
    "users", "source_records", "dest_records", "sync_jobs", "api_endpoints", "field_mappings",
    "error_records", "reconciliation_runs", "monitoring_metrics", "api_tests", "audit_logs",
    "circuit_breakers", "sync_schedules", "settings",
]

# ~1,080 documents across the 12 domains
DOMAIN_SEED_COUNTS = {
    "gl": 140, "ap": 110, "ar": 110, "cc": 70, "pc": 70, "ml": 80,
    "po": 100, "so": 110, "fa": 50, "bs": 90, "bg": 60, "inv": 90,
}

SYSTEM = {"email": "system@meridian.com", "role": "system"}


def _endpoint_docs(now):
    docs = []
    for k in DOMAIN_ORDER:
        cfg = DOMAINS[k]
        table = cfg["sap_table"].split("/")[0]
        docs.append({
            "id": str(uuid.uuid4()), "key": f"SAP-{k.upper()}-ODATA", "side": "source",
            "domain": k, "domain_name": cfg["name"],
            "name": f"SAP S/4HANA · {cfg['name']} Extract", "method": "GET",
            "path": f"/sap/opu/odata/sap/{table}_SRV/{cfg['doc_type']}_Set",
            "base_url": SAP_BASE, "auth_type": "OAuth2 Bearer (simulated)",
            "auth_doc": "Acquire an OAuth2 bearer token from the SAP authorization server (simulated) and send "
                        "'Authorization: Bearer <token>'. Tokens are scoped to company code 1000. This is a "
                        "simulation — no real SAP credentials exist or are used anywhere in this application.",
            "description": f"OData extract of {cfg['name']} documents from SAP tables {cfg['sap_table']} "
                           f"({cfg['doc_type']}).",
            "status": "up",
            "request_sample": {
                "__query": f"{cfg['doc_type']}_Set?$top=100&$filter=Budat ge datetime'2026-01-01T00:00:00'",
                "__headers": {"Authorization": "Bearer <redacted>", "Accept": "application/json"},
            },
            "response_sample": {
                "d": {"results": [{
                    "Belnr": "51000123", "Bukrs": "1000", "Budat": "20260115", "Waers": "INR",
                    "Wrbtr": 45120.75, "Shkzg": "S", "Werks": "PL-101",
                    "GST_Split": {"Cgst": 4060.87, "Sgst": 4060.87, "Igst": 0.0},
                }]},
            },
            "headers": {"Content-Type": "application/json", "Accept": "application/json"},
            "created_at": now,
        })
        docs.append({
            "id": str(uuid.uuid4()), "key": f"FS-{k.upper()}-INGEST", "side": "destination",
            "domain": k, "domain_name": cfg["name"],
            "name": f"FinSight · {cfg['name']} Ingestion", "method": "POST",
            "path": f"/api/v1/ingest/{k}",
            "base_url": FINSIGHT_BASE, "auth_type": "API Key + HMAC signature (simulated)",
            "auth_doc": "Send the tenant API key in 'X-Finsight-Key' and an HMAC-SHA256 signature of the body in "
                        "'X-Finsight-Signature' (simulated). Records must be INR-denominated with normalised ISO "
                        "dates and a valid 15-character GSTIN where applicable.",
            "description": f"REST ingestion endpoint for normalised {cfg['name']} records in the FinSight "
                           f"analytics store (region ap-south-1).",
            "status": "up",
            "request_sample": {
                "finsight_ref": f"FS-{k.upper()}-50012345", "source_doc_no": "51000123", "domain": k,
                "currency": "INR", "gross_amount_inr": 3765326.59, "doc_date": "2026-01-15",
                "fiscal_year": "2025-26", "posting_period": "010", "region": "ap-south-1",
                "__headers": {"X-Finsight-Key": "<redacted>", "X-Finsight-Signature": "<redacted>"},
            },
            "response_sample": {"status": "accepted", "finsight_ref": f"FS-{k.upper()}-50012345",
                                "checksum": "9f2a7c31e04b…", "stored_in": "ap-south-1"},
            "headers": {"Content-Type": "application/json"},
            "created_at": now,
        })
    return docs


async def main(force: bool) -> None:
    await ensure_indexes()
    if await db.users.count_documents({}) and not force:
        print("Already seeded — run `python seed.py --force` to drop and reseed.")
        return
    if force:
        for c in COLLECTIONS:
            await db[c].drop()
        await ensure_indexes()

    now = utcnow()

    # ---- users (demo accounts)
    await db.users.insert_many([
        {"id": str(uuid.uuid4()), "email": "admin@meridian.com", "name": "Devendra Verma (Lead Architect)",
         "role": "admin", "password_hash": hash_password(SEED_PASSWORD), "created_at": now},
        {"id": str(uuid.uuid4()), "email": "viewer@meridian.com", "name": "Pooja Hegde (Financial Auditor)",
         "role": "viewer", "password_hash": hash_password(SEED_PASSWORD), "created_at": now},
    ])
    print("users seeded")

    # ---- settings: FX rates synced 6h ago so the freshness metric starts realistic
    await db.settings.update_one(
        {"key": "fx"},
        {"$set": {"fx_synced_at": now - timedelta(hours=6), "source": FX_SOURCE}},
        upsert=True,
    )

    # ---- 24 API endpoints (12 SAP source + 12 FinSight destination)
    endpoint_docs = _endpoint_docs(now)
    await db.api_endpoints.insert_many(endpoint_docs)
    print(f"api endpoints seeded ({len(endpoint_docs)})")

    # ---- field mappings (50+, from the transform engine's single source of truth)
    await db.field_mappings.insert_many([
        {"id": str(uuid.uuid4()), "domain": domain, "domain_name": DOMAINS[domain]["name"],
         "sap_field": sap_field, "finsight_field": fs_field,
         "transform": TRANSFORM_LABELS.get(transform, transform), "sample": sample,
         "required": required, "active": True}
        for domain, sap_field, fs_field, transform, sample, required in MAPPING_RULES
    ])
    print(f"field mappings seeded ({len(MAPPING_RULES)})")

    # ---- monitoring thresholds + sync schedules
    await db.monitoring_metrics.insert_many([
        {"id": str(uuid.uuid4()), "key": d["key"], "warn_threshold": d["warn"], "crit_threshold": d["crit"],
         "updated_at": now, "updated_by_email": "system"}
        for d in METRIC_DEFS
    ])
    await db.sync_schedules.insert_many([
        {"domain": k, "domain_name": DOMAINS[k]["name"],
         "interval": random.choice(["Every 15 minutes", "Hourly", "Every 6 hours", "Daily at 00:00 IST"]),
         "updated_at": now}
        for k in DOMAIN_ORDER
    ])

    # ---- source records
    total = 0
    for k, n in DOMAIN_SEED_COUNTS.items():
        docs = generate_records(k, n, days_back=365)
        await db.source_records.insert_many(docs)
        total += len(docs)
    print(f"source records seeded ({total})")

    # ---- deliberate simulated outage: Material Ledger endpoint down → 5 failed syncs → breaker OPENS
    await db.api_endpoints.update_one({"key": "SAP-ML-ODATA"}, {"$set": {"status": "down"}})
    for _ in range(5):
        try:
            await execute_etl("ml", 12, "checksum", SYSTEM, mode="scheduled")
        except Exception as exc:
            print("ml outage sync:", exc)
    print("material-ledger outage injected (endpoint down, breaker open)")

    # ---- ETL history for every other domain (~70% of pending)
    for k in DOMAIN_ORDER:
        if k == "ml":
            continue
        pending = await db.source_records.count_documents({"domain": k, "status": "pending"})
        batch = max(10, int(pending * 0.7))
        if batch > 0:
            try:
                job = await execute_etl(k, batch, "checksum", SYSTEM, mode="scheduled")
                print(f"  synced {k}: +{job['loaded']} loaded · {job['validation_failed']} validation errors · "
                      f"{job['duplicates_skipped']} duplicates blocked")
            except Exception as exc:
                print(f"  sync {k} failed: {exc}")

    # ---- reconciliation exceptions: 6 ₹-level amount deltas + 5 missing destination docs
    dest_docs = await db.dest_records.find(
        {}, {"id": 1, "gross_amount_inr": 1, "tax_amount_inr": 1},
    ).sort("loaded_at", -1).to_list(40)
    for d in dest_docs[:6]:
        delta = random.choice([0.5, -1.25, 2.0, -0.5, 1.0, 0.75])
        new_gross = round((d["gross_amount_inr"] or 0) + delta, 2)
        tax = d.get("tax_amount_inr") or 0
        await db.dest_records.update_one(
            {"id": d["id"]},
            {"$set": {"gross_amount_inr": new_gross, "net_amount_inr": round(new_gross - tax, 2)}},
        )
    missing_targets = await db.source_records.find({"status": "synced"}, {"checksum": 1}).to_list(5)
    for s in missing_targets:
        await db.dest_records.delete_one({"checksum": s["checksum"]})
    print(f"reconciliation exceptions injected ({len(dest_docs[:6])} mismatches, {len(missing_targets)} missing)")

    # ---- park three validation errors in the dead-letter queue
    dl_candidates = await db.error_records.find(
        {"classification": "validation_error", "dead_letter": False}, {"id": 1},
    ).sort("created_at", 1).to_list(3)
    for e in dl_candidates:
        await db.error_records.update_one(
            {"id": e["id"]},
            {"$set": {"dead_letter": True, "status": "dead_letter", "attempts": 4}},
        )
    print(f"dead-letter queue seeded ({len(dl_candidates)})")

    # ---- API test history (24h) so latency/error-rate charts have real series
    tests = []
    for _ in range(120):
        ep = random.choice(endpoint_docs)
        down = ep["status"] == "down"
        success = (not down) and random.random() > 0.06
        latency = random.randint(45, 480) if success else random.randint(500, 900)
        tests.append({
            "id": str(uuid.uuid4()), "endpoint_id": ep["id"], "endpoint_key": ep["key"],
            "method": ep["method"], "path": ep["path"],
            "status_code": 200 if success else (503 if down else random.choice([504, 400])),
            "success": success, "latency_ms": latency,
            "request_sample": ep["request_sample"],
            "response_sample": ep["response_sample"] if success else {"error": {"code": "SERVICE_UNAVAILABLE"}},
            "tested_by_email": "system@meridian.com",
            "created_at": now - timedelta(minutes=random.randint(0, 60 * 23), seconds=random.randint(0, 3600)),
        })
    await db.api_tests.insert_many(tests)
    print(f"api test history seeded ({len(tests)})")

    # ---- a few audit entries for the stream (sync runs already audited themselves)
    await log_audit("auth:login", {"email": "admin@meridian.com", "role": "admin"}, {"note": "seeded session"})
    await log_audit("fx:refresh", {"email": "system@meridian.com", "role": "system"}, {"note": "seeded FX snapshot"})

    # ---- first reconciliation run over everything
    run = await compare_domain("all", SYSTEM, scope_all=True)
    print(f"reconciliation run: {run['status']} — {run['counts']}")

    print("\nSeed complete. Demo logins (password 'meridian2026'):")
    print("  admin@meridian.com  (admin — full access)")
    print("  viewer@meridian.com (viewer — read-only)")


if __name__ == "__main__":
    asyncio.run(main("--force" in sys.argv))
