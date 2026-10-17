import os
from datetime import datetime, timezone

from app.db import db


def admin_emails() -> set[str]:
    raw = os.getenv("ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def user_role(user: dict) -> str:
    email = str(user.get("email", "")).lower()
    if email in admin_emails():
        return "admin"
    return user.get("role", "user")


async def log_activity(user: dict | None, action: str, details: dict | None = None):
    """Har user ki harkat save karta hai. Fail ho to app nahi rukti."""
    try:
        details = details or {}

        user_id = None
        if user:
            # Database doc mein "_id" hota hai, get_current_user ke dict mein "id"
            raw_id = user.get("_id") or user.get("id")
            user_id = str(raw_id) if raw_id else None

        await db.activity_logs.insert_one(
            {
                "userId": user_id,
                "userName": user.get("name", "") if user else "",
                "email": (
                    user.get("email", "") if user else details.get("email", "")
                ),
                "action": action,
                "details": details,
                "createdAt": datetime.now(timezone.utc),
            }
        )
    except Exception:
        pass