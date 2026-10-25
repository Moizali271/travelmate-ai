import time
from datetime import datetime, timezone

import bcrypt
from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, Field

from app.activity import log_activity
from app.db import db

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_ATTEMPTS = 5
WINDOW_SECONDS = 900  # 15 minute
MAX_TRACKED_KEYS = 5000
MAX_PASSWORD_BYTES = 72  # bcrypt ki limit bytes mein hai

# "email|ip" -> ghalat koshishon ka waqt
_failed: dict = {}

# Email maujood na ho tab bhi bcrypt chale, taake jawab ka waqt ek jaisa rahe
DUMMY_HASH = bcrypt.hashpw(b"not-a-real-password", bcrypt.gensalt()).decode()


class PublicChangePasswordIn(BaseModel):
    email: str = Field(max_length=100)
    currentPassword: str = Field(max_length=72)
    newPassword: str = Field(min_length=6, max_length=72)


def attempt_key(email: str, request: Request) -> str:
    ip = request.client.host if request.client else "unknown"
    return f"{email}|{ip}"


def recent_failures(key: str) -> list:
    now = time.time()
    attempts = [t for t in _failed.get(key, []) if now - t < WINDOW_SECONDS]
    if attempts:
        _failed[key] = attempts
    else:
        _failed.pop(key, None)
    return attempts


def record_failure(key: str) -> None:
    if len(_failed) >= MAX_TRACKED_KEYS:
        now = time.time()
        for old_key in list(_failed):
            fresh = [t for t in _failed[old_key] if now - t < WINDOW_SECONDS]
            if fresh:
                _failed[old_key] = fresh
            else:
                del _failed[old_key]
        # phir bhi bhara ho to sabse purani entry hata do
        while len(_failed) >= MAX_TRACKED_KEYS:
            _failed.pop(next(iter(_failed)))
    _failed.setdefault(key, []).append(time.time())


def too_long(password: str) -> bool:
    return len(password.encode("utf-8")) > MAX_PASSWORD_BYTES


def verify_password(plain: str, hashed: str) -> bool:
    if too_long(plain):
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


@router.post("/change-password-public")
async def change_password_public(body: PublicChangePasswordIn, request: Request):
    email = body.email.strip().lower()
    key = attempt_key(email, request)

    if len(recent_failures(key)) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Bohat zyada ghalat koshishen, 15 minute baad dobara try karein",
        )

    if too_long(body.newPassword):
        raise HTTPException(status_code=400, detail="Naya password bohat lamba hai")

    user = await db.users.find_one({"email": email})

    if user and not user.get("password_hash"):
        record_failure(key)
        raise HTTPException(
            status_code=400,
            detail="Is email ke liye Google se login karein, password yahan change nahi hota",
        )

    stored_hash = user["password_hash"] if user else DUMMY_HASH
    ok = verify_password(body.currentPassword, stored_hash) and bool(user)

    if not ok:
        record_failure(key)
        await log_activity(None, "password_change_failed", {"email": email})
        raise HTTPException(
            status_code=401, detail="Email ya purana password ghalat hai"
        )

    if body.currentPassword == body.newPassword:
        raise HTTPException(
            status_code=400,
            detail="Naya password purane se alag hona chahiye",
        )

    hashed = bcrypt.hashpw(body.newPassword.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"_id": user["_id"]},
        {
            "$set": {
                "password_hash": hashed,
                "passwordChangedAt": datetime.now(timezone.utc),
            }
        },
    )
    _failed.pop(key, None)
    await log_activity(user, "password_changed", {"via": "login_page"})
    return {"message": "Password change ho gaya, ab naye password se login karein"}