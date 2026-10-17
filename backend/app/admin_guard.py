from fastapi import Depends, HTTPException

from app.activity import user_role
from app.auth import get_current_user


async def require_admin(user: dict = Depends(get_current_user)):
    if user_role(user) != "admin":
        raise HTTPException(status_code=403, detail="Sirf admin ke liye")
    return user