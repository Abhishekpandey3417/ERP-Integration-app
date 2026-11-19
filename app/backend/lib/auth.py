"""JWT (httpOnly cookie) authentication + minimal RBAC.

Single-tenant app with two role scopes — admin (all actions) and viewer
(read-only). Authorization is deny-by-default through one decision point
(`require_action`); routes never check roles ad-hoc.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Cookie, Depends, HTTPException
from passlib.context import CryptContext

from lib.audit import log_audit
from lib.db import db

COOKIE_NAME = "meridian_session"
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], pbkdf2_sha256__rounds=24_000)

JWT_SECRET = os.environ.get("JWT_SECRET", "meridian-bridge-dev-secret-change-in-prod")
JWT_EXPIRES_MIN = int(os.environ.get("JWT_EXPIRES_MIN", "720"))

# Deny-by-default: None means "all actions" (admin). Viewer gets exactly the read set.
PERMS: dict[str, set[str] | None] = {
    "admin": None,
    "viewer": {
        "dashboard:read", "simulator:read", "apim:read", "mappings:read", "mappings:test",
        "sync:read", "recon:read", "errors:read", "monitoring:read", "analytics:read",
    },
}


def perms_for(role: str) -> set[str] | None:
    return PERMS.get(role, set())


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(user: dict) -> str:
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "exp": datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRES_MIN),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def get_current_user(meridian_session: str | None = Cookie(default=None)) -> dict:
    """Re-derive the principal from the cookie AND the DB (source of truth) each request."""
    if not meridian_session:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(meridian_session, JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired — sign in again")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session token")
    user = await db.users.find_one({"id": payload.get("sub")})
    if not user:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return {"user_id": user["id"], "email": user["email"], "name": user["name"], "role": user["role"]}


def require_action(action: str):
    """Dependency factory — the single authorization decision point (deny-by-default)."""

    async def dep(user: dict = Depends(get_current_user)) -> dict:
        allowed = perms_for(user["role"])
        if allowed is not None and action not in allowed:
            await log_audit(f"deny:{action}", user, {"reason": "role_lacks_permission"}, severity="warning")
            raise HTTPException(status_code=403, detail=f"Role '{user['role']}' is not permitted to perform this action")
        return user

    return dep


def new_user_id() -> str:
    return str(uuid.uuid4())
