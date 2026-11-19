"""Append-only audit trail — every mutation and every denied authorization decision.

India data-residency note: entries are tagged with the storage region so the
monitoring module can show audit-trail compliance.
"""

import uuid
from datetime import datetime, timezone

from lib.db import db


async def log_audit(action: str, user: dict | None, detail: dict | None = None, severity: str = "info") -> dict:
    entry = {
        "id": str(uuid.uuid4()),
        "action": action,
        "actor_email": (user or {}).get("email", "system"),
        "actor_role": (user or {}).get("role", "system"),
        "detail": detail or {},
        "severity": severity,
        "region": "ap-south-1",
        "created_at": datetime.now(timezone.utc),
    }
    await db.audit_logs.insert_one(entry)
    return entry
