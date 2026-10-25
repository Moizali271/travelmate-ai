import os
import re
from datetime import datetime, timezone

import bcrypt
from bson import ObjectId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from google.auth.exceptions import GoogleAuthError, TransportError
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool

from app.activity import log_activity, user_role
from app.auth import create_token, get_current_user
from app.db import db

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_PASSWORD_BYTES = 72  # bcrypt ki limit bytes mein hai, characters mein nahi


class GoogleLoginIn(BaseModel):
    credential: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(max_length=100)
    password: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: str = Field(max_length=100)
    password: str = Field(max_length=72)


class ChangePasswordIn(BaseModel):
    currentPassword: str = Field(max_length=72)
    newPassword: str = Field(min_length=6, max_length=72)


def password_too_long(password: str) -> bool:
    return len(password.encode("utf-8")) > MAX_PASSWORD_BYTES


def verify_password(plain: str, hashed: str) -> bool:
    if password_too_long(plain):
        return False
    try:
        return bcrypt.checkpw(plain.encode(), hashed.encode())
    except ValueError:
        return False


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]) if "_id" in u else u.get("id", ""),
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "picture": u.get("picture", ""),
        "role": user_role(u),
    }


async def mark_login(user: dict):
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"lastLoginAt": datetime.now(timezone.utc)}},
    )


@router.post("/google")
async def google_login(body: GoogleLoginIn):
    # client id na ho to Google token ka audience check skip ho jata hai
    if not GOOGLE_CLIENT_ID:
        raise HTTPException(
            status_code=503, detail="Google login abhi configure nahi hai"
        )

    try:
        info = await run_in_threadpool(
            id_token.verify_oauth2_token,
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except TransportError:
        raise HTTPException(
            status_code=503, detail="Google se rabta nahi ho saka, dobara koshish karein"
        )
    except (ValueError, GoogleAuthError):
        raise HTTPException(status_code=401, detail="Google token ghalat hai")

    if not info.get("email_verified"):
        raise HTTPException(status_code=401, detail="Google email verified nahi hai")

    email = info.get("email", "").lower()

    # agar yeh Google account pehli baar aa raha hai aur email pehle se
    # password account ke saath registered hai, to dusra user mat banao
    google_user = await db.users.find_one(
        {"oauthProvider": "google", "oauthSubject": info["sub"]}
    )
    if not google_user:
        clash = await db.users.find_one({"email": email})
        if clash:
            raise HTTPException(
                status_code=400,
                detail="Yeh email pehle se email/password se registered hai, usi se login karein",
            )

    user = await db.users.find_one_and_update(
        {"oauthProvider": "google", "oauthSubject": info["sub"]},
        {
            "$set": {
                "name": info.get("name", ""),
                "email": email,
                "picture": info.get("picture", ""),
            },
            "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    await mark_login(user)
    await log_activity(user, "login", {"method": "google"})
    return {"token": create_token(str(user["_id"])), "user": public_user(user)}


@router.post("/register")
async def register(body: RegisterIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Sahi email likhein")

    if password_too_long(body.password):
        raise HTTPException(
            status_code=400, detail="Password bohat lamba hai, chhota rakhein"
        )

    existing = await db.users.find_one({"email": email})
    if existing:
        if existing.get("password_hash"):
            detail = "Yeh email pehle se registered hai, Login karein"
        else:
            detail = "Yeh email Google se registered hai, Google se login karein"
        raise HTTPException(status_code=400, detail=detail)

    hashed = bcrypt.hashpw(body.password.encode(), bcrypt.gensalt()).decode()
    res = await db.users.insert_one(
        {
            "name": body.name.strip(),
            "email": email,
            "password_hash": hashed,
            "role": "user",
            "createdAt": datetime.now(timezone.utc),
        }
    )
    user = await db.users.find_one({"_id": res.inserted_id})
    await log_activity(user, "signup", {"method": "email"})
    return {"token": create_token(str(res.inserted_id)), "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})

    if user and not user.get("password_hash"):
        raise HTTPException(
            status_code=401, detail="Is email ke liye Google se login karein"
        )

    ok = bool(user) and verify_password(body.password, user["password_hash"])
    if not ok:
        await log_activity(None, "login_failed", {"email": email})
        raise HTTPException(status_code=401, detail="Email ya password ghalat hai")

    await mark_login(user)
    await log_activity(user, "login", {"method": "email"})
    return {"token": create_token(str(user["_id"])), "user": public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)


@router.post("/change-password")
async def change_password(
    body: ChangePasswordIn, user: dict = Depends(get_current_user)
):
    # get_current_user "_id" ki jagah "id" (string) deta hai
    doc = await db.users.find_one({"_id": ObjectId(user["id"])})

    if not doc or not doc.get("password_hash"):
        raise HTTPException(
            status_code=400,
            detail="Aap Google se login hain, is account ka password yahan change nahi hota",
        )

    if not verify_password(body.currentPassword, doc["password_hash"]):
        raise HTTPException(status_code=400, detail="Purana password ghalat hai")

    if password_too_long(body.newPassword):
        raise HTTPException(
            status_code=400, detail="Naya password bohat lamba hai, chhota rakhein"
        )

    if body.currentPassword == body.newPassword:
        raise HTTPException(
            status_code=400,
            detail="Naya password purane se alag hona chahiye",
        )

    hashed = bcrypt.hashpw(body.newPassword.encode(), bcrypt.gensalt()).decode()
    await db.users.update_one(
        {"_id": doc["_id"]},
        {
            "$set": {
                "password_hash": hashed,
                "passwordChangedAt": datetime.now(timezone.utc),
            }
        },
    )
    await log_activity(doc, "password_changed", {})
    return {"message": "Password change ho gaya"}