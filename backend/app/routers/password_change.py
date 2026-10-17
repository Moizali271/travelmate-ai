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

# "email|ip" -> ghalat koshishon ka waqt
_failed: dict = {}


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
    _failed[key] = attempts
    return attempts


@router.post("/change-password-public")
async def change_password_public(body: PublicChangePasswordIn, request: Request):
    email = body.email.strip().lower()
    key = attempt_key(email, request)

    if len(recent_failures(key)) >= MAX_ATTEMPTS:
        raise HTTPException(
            status_code=429,
            detail="Bohat zyada ghalat koshishen, 15 minute baad dobara try karein",
        )

    user = await db.users.find_one({"email": email})

    if user and not user.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="Is email ke liye Google se login karein, password yahan change nahi hota",
        )

    ok = False
    if user:
        try:
            ok = bcrypt.checkpw(
                body.currentPassword.encode(), user["password_hash"].encode()
            )
        except ValueError:
            ok = False

    if not ok:
        _failed.setdefault(key, []).append(time.time())
        await log_activity(None, "password_change_failed", {"email": email})
        raise HTTPException(
            status_code=401, detail="Email ya purana password ghalat hai"
        )

    if body.currentPassword == body.newPassword:
        raise HTTPException(
            status_code=400,
            detail="Naya password purane se alag hona chahiye",
        )

    if len(body.newPassword.encode()) > 72:
        raise HTTPException(status_code=400, detail="Naya password bohat lamba hai")

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