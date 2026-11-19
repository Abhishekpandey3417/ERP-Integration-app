"""Shared Mongo handle — import `client`/`db` from here (server.py, routers, seed.py)."""

import logging
import os
from pathlib import Path

from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import ASCENDING, DESCENDING, IndexModel

load_dotenv(Path(__file__).parent.parent / ".env")

logger = logging.getLogger(__name__)

mongo_url = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
db_name = os.environ.get("DB_NAME", "integration_bridge")

def _init_client():
    try:
        from pymongo import MongoClient
        test = MongoClient(mongo_url, serverSelectionTimeoutMS=1000)
        test.server_info()
        logger.info("Connected to live MongoDB at %s", mongo_url)
        return AsyncIOMotorClient(mongo_url, tz_aware=True)
    except Exception as exc:
        logger.warning("MongoDB unavailable (%s); using in-memory mongomock_motor fallback", exc)
        from mongomock_motor import AsyncMongoMockClient
        return AsyncMongoMockClient()

client = _init_client()
db = client[db_name]

# One entry per collection: every field a route filters, sorts, or dedupes on. Applied by ensure_indexes() at startup.
INDEXES: dict[str, list[IndexModel]] = {
    "users": [IndexModel([("email", ASCENDING)], name="email", unique=True)],
    "source_records": [
        IndexModel([("domain", ASCENDING), ("status", ASCENDING), ("doc_date", DESCENDING)], name="domain_status_date"),
        IndexModel([("checksum", ASCENDING)], name="checksum"),
        IndexModel([("plant_code", ASCENDING), ("doc_date", DESCENDING)], name="plant_date"),
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
    ],
    "dest_records": [
        # Unique on checksum — the duplicate-prevention guarantee at load time.
        IndexModel([("checksum", ASCENDING)], name="checksum", unique=True),
        IndexModel([("domain", ASCENDING), ("loaded_at", DESCENDING)], name="domain_loaded"),
        IndexModel([("plant_code", ASCENDING), ("doc_date", ASCENDING)], name="plant_date"),
        IndexModel([("doc_date", ASCENDING)], name="doc_date"),
    ],
    "sync_jobs": [
        IndexModel([("created_at", DESCENDING)], name="created_desc"),
        IndexModel([("domain", ASCENDING), ("created_at", DESCENDING)], name="domain_created"),
    ],
    "api_endpoints": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "field_mappings": [IndexModel([("domain", ASCENDING), ("sap_field", ASCENDING)], name="domain_sap_field")],
    "error_records": [
        IndexModel([("status", ASCENDING), ("created_at", DESCENDING)], name="status_created"),
        IndexModel([("classification", ASCENDING)], name="classification"),
        IndexModel([("dead_letter", ASCENDING), ("created_at", DESCENDING)], name="dead_letter_created"),
    ],
    "reconciliation_runs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "monitoring_metrics": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "api_tests": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "audit_logs": [IndexModel([("created_at", DESCENDING)], name="created_desc")],
    "circuit_breakers": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
    "sync_schedules": [IndexModel([("domain", ASCENDING)], name="domain", unique=True)],
    "settings": [IndexModel([("key", ASCENDING)], name="key", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:  # one at a time so a bad spec skips only itself
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:  # never block boot on an index; the log line names what to fix
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)
