import os
import re
from datetime import datetime, timezone

import bcrypt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException
from google.auth.transport import requests as google_requests
from google.oauth2 import id_token
from pydantic import BaseModel, Field
from pymongo import ReturnDocument
from starlette.concurrency import run_in_threadpool

from app.auth import create_token, get_current_user
from app.db import db

load_dotenv()

router = APIRouter(prefix="/api/auth", tags=["auth"])

GOOGLE_CLIENT_ID = os.getenv("GOOGLE_CLIENT_ID")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class GoogleLoginIn(BaseModel):
    credential: str


class RegisterIn(BaseModel):
    name: str = Field(min_length=2, max_length=60)
    email: str = Field(max_length=100)
    password: str = Field(min_length=6, max_length=72)


class LoginIn(BaseModel):
    email: str
    password: str


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "name": u.get("name", ""),
        "email": u.get("email", ""),
        "picture": u.get("picture", ""),
    }


@router.post("/google")
async def google_login(body: GoogleLoginIn):
    try:
        info = await run_in_threadpool(
            id_token.verify_oauth2_token,
            body.credential,
            google_requests.Request(),
            GOOGLE_CLIENT_ID,
        )
    except ValueError:
        raise HTTPException(status_code=401, detail="Google token ghalat hai")

    user = await db.users.find_one_and_update(
        {"oauthProvider": "google", "oauthSubject": info["sub"]},
        {
            "$set": {
                "name": info.get("name", ""),
                "email": info.get("email", "").lower(),
                "picture": info.get("picture", ""),
            },
            "$setOnInsert": {"createdAt": datetime.now(timezone.utc)},
        },
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    return {"token": create_token(str(user["_id"])), "user": public_user(user)}


@router.post("/register")
async def register(body: RegisterIn):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=400, detail="Sahi email likhein")

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
            "createdAt": datetime.now(timezone.utc),
        }
    )
    user = await db.users.find_one({"_id": res.inserted_id})
    return {"token": create_token(str(res.inserted_id)), "user": public_user(user)}


@router.post("/login")
async def login(body: LoginIn):
    email = body.email.strip().lower()
    user = await db.users.find_one({"email": email})

    if user and not user.get("password_hash"):
        raise HTTPException(
            status_code=401, detail="Is email ke liye Google se login karein"
        )

    ok = user and bcrypt.checkpw(
        body.password.encode(), user["password_hash"].encode()
    )
    if not ok:
        raise HTTPException(status_code=401, detail="Email ya password ghalat hai")
    return {"token": create_token(str(user["_id"])), "user": public_user(user)}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)