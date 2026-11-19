"""Authentication routes — JWT in an httpOnly cookie, mounted under /api/auth."""

from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Response

from lib.audit import log_audit
from lib.auth import COOKIE_NAME, JWT_EXPIRES_MIN, create_token, get_current_user, verify_password
from lib.db import db
from models.auth import LoginRequest, UserPublic

router = APIRouter(prefix="/auth", tags=["auth"])


def _public(doc: dict) -> UserPublic:
    return UserPublic(id=doc["id"], email=doc["email"], name=doc["name"], role=doc["role"], created_at=doc.get("created_at"))


@router.post("/login", response_model=UserPublic)
async def login(body: LoginRequest, response: Response):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        await log_audit("auth:login_failed", {"email": body.email}, {"reason": "bad_credentials"}, severity="warning")
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_token(user)
    response.set_cookie(
        key=COOKIE_NAME, value=token, httponly=True, samesite="lax", path="/",
        max_age=JWT_EXPIRES_MIN * 60,
    )
    await log_audit("auth:login", user, {})
    return _public(user)


@router.post("/logout")
async def logout(response: Response, user: dict = Depends(get_current_user)):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    await log_audit("auth:logout", user, {})
    return {"ok": True}


@router.get("/me", response_model=UserPublic)
async def me(user: dict = Depends(get_current_user)):
    doc = await db.users.find_one({"id": user["user_id"]})
    if not doc:
        raise HTTPException(status_code=401, detail="Account no longer exists")
    return _public(doc)
