import os
from datetime import datetime, timedelta, timezone

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.db import db

load_dotenv()

JWT_SECRET = os.getenv("JWT_SECRET")
if not JWT_SECRET or len(JWT_SECRET) < 32:
    raise RuntimeError(
        "JWT_SECRET backend/.env mein set karein (kam az kam 32 characters)"
    )
bearer = HTTPBearer(auto_error=False)


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": user_id,
        "iat": now,
        "exp": now + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


async def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer),
) -> dict:
    if creds is None:
        raise HTTPException(status_code=401, detail="Login zaroori hai")
    try:
        payload = jwt.decode(
            creds.credentials,
            JWT_SECRET,
            algorithms=["HS256"],
            options={"require": ["exp", "sub"]},
        )
        oid = ObjectId(payload["sub"])
    except (jwt.PyJWTError, KeyError, InvalidId, TypeError):
        raise HTTPException(status_code=401, detail="Token ghalat ya expire ho gaya")

    user = await db.users.find_one({"_id": oid})
    if not user:
        raise HTTPException(status_code=401, detail="User nahi mila")
    user["id"] = str(user.pop("_id"))
    return user