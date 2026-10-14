"""
TravelMate AI - Bookings router
Endpoints:
  POST   /api/bookings                      -> create booking (status: requested)
  GET    /api/bookings                      -> list logged-in user's bookings (?status=)
  GET    /api/bookings/{booking_id}         -> get one booking
  PATCH  /api/bookings/{booking_id}/confirm -> confirm with confirmation number
  PATCH  /api/bookings/{booking_id}/cancel  -> cancel
  DELETE /api/bookings/{booking_id}         -> delete (cancelled only)
"""

import secrets
from datetime import date, datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

# ---------------------------------------------------------------------------
# Project imports (with fallbacks so small naming differences don't crash)
# ---------------------------------------------------------------------------
try:
    from app.db import db
except ImportError:  # pragma: no cover
    from app import db as _db_module

    db = getattr(_db_module, "db", None) or getattr(_db_module, "database")

try:
    from app.auth import get_current_user
except ImportError:  # pragma: no cover
    try:
        from app.auth import get_current_active_user as get_current_user
    except ImportError:
        from app.auth import current_user as get_current_user

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

ACTIVE_STATUSES = ["requested", "confirmed"]


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class BookingCreate(BaseModel):
    tripId: Optional[str] = None
    hotelId: Optional[str] = None
    hotelName: str
    hotelType: Optional[str] = None
    stars: Optional[float] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    address: Optional[str] = None
    destination: Optional[str] = None
    checkIn: str
    checkOut: str
    guests: int = 1
    rooms: int = 1
    guestName: Optional[str] = None
    phone: Optional[str] = None
    notes: Optional[str] = None
    pricePerNight: Optional[float] = None
    currency: Optional[str] = "PKR"


class ConfirmBody(BaseModel):
    confirmationNumber: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _user_id(user: Any) -> str:
    """Return the logged-in user's id as a string (works for dict or object)."""
    if isinstance(user, dict):
        value = user.get("_id") or user.get("id") or user.get("userId")
    else:
        value = (
            getattr(user, "id", None)
            or getattr(user, "_id", None)
            or getattr(user, "userId", None)
        )
    if value is None:
        raise HTTPException(status_code=401, detail="Invalid user session")
    return str(value)


def _user_id_variants(uid: str) -> list:
    """userId may be stored as a string or as an ObjectId; match both."""
    variants: list = [uid]
    try:
        variants.append(ObjectId(uid))
    except (InvalidId, TypeError):
        pass
    return variants


def _oid(value: str, label: str = "id") -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def _parse_date(value: str, label: str) -> date:
    try:
        return datetime.fromisoformat(str(value)[:10]).date()
    except ValueError:
        raise HTTPException(
            status_code=400, detail=f"{label} must be in YYYY-MM-DD format"
        )


def _serialize(doc: dict) -> dict:
    out = dict(doc)
    out["id"] = str(out.pop("_id"))
    for key, value in list(out.items()):
        if isinstance(value, ObjectId):
            out[key] = str(value)
        elif isinstance(value, datetime):
            out[key] = value.isoformat()
    return out


def _to_dict(model: BaseModel) -> dict:
    return model.model_dump() if hasattr(model, "model_dump") else model.dict()


async def _get_own_booking(booking_id: str, uid: str) -> dict:
    booking = await db.bookings.find_one(
        {"_id": _oid(booking_id, "booking id"), "userId": {"$in": _user_id_variants(uid)}}
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    return booking


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------
@router.post("", status_code=201)
async def create_booking(payload: BookingCreate, user=Depends(get_current_user)):
    uid = _user_id(user)

    check_in = _parse_date(payload.checkIn, "checkIn")
    check_out = _parse_date(payload.checkOut, "checkOut")
    if check_out <= check_in:
        raise HTTPException(
            status_code=400, detail="Check-out must be after check-in"
        )
    if payload.guests < 1 or payload.rooms < 1:
        raise HTTPException(
            status_code=400, detail="Guests and rooms must be at least 1"
        )

    # If a trip is given, it must belong to this user
    if payload.tripId:
        trip = await db.trips.find_one(
            {
                "_id": _oid(payload.tripId, "trip id"),
                "userId": {"$in": _user_id_variants(uid)},
            }
        )
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")

    check_in_str = check_in.isoformat()
    check_out_str = check_out.isoformat()

    # Conflict check: same hotel, overlapping dates, still active
    if payload.hotelId:
        conflict = await db.bookings.find_one(
            {
                "userId": {"$in": _user_id_variants(uid)},
                "hotelId": payload.hotelId,
                "status": {"$in": ACTIVE_STATUSES},
                "checkIn": {"$lt": check_out_str},
                "checkOut": {"$gt": check_in_str},
            }
        )
        if conflict:
            raise HTTPException(
                status_code=409,
                detail="You already have an active booking for this hotel on these dates",
            )

    nights = (check_out - check_in).days
    total_price = None
    if payload.pricePerNight is not None:
        total_price = round(payload.pricePerNight * nights * payload.rooms, 2)

    now = datetime.now(timezone.utc)
    doc = _to_dict(payload)
    doc.update(
        {
            "userId": uid,
            "checkIn": check_in_str,
            "checkOut": check_out_str,
            "nights": nights,
            "totalPrice": total_price,
            "reference": "TM-" + secrets.token_hex(4).upper(),
            "status": "requested",
            "confirmationNumber": None,
            "createdAt": now,
            "updatedAt": now,
        }
    )

    result = await db.bookings.insert_one(doc)
    doc["_id"] = result.inserted_id
    return _serialize(doc)


# ---------------------------------------------------------------------------
# List / Get
# ---------------------------------------------------------------------------
@router.get("")
async def list_bookings(
    status: Optional[str] = Query(default=None),
    user=Depends(get_current_user),
):
    uid = _user_id(user)
    query: dict = {"userId": {"$in": _user_id_variants(uid)}}
    if status:
        query["status"] = status

    cursor = db.bookings.find(query).sort("createdAt", -1)
    bookings = await cursor.to_list(length=500)
    return [_serialize(b) for b in bookings]


@router.get("/{booking_id}")
async def get_booking(booking_id: str, user=Depends(get_current_user)):
    booking = await _get_own_booking(booking_id, _user_id(user))
    return _serialize(booking)


# ---------------------------------------------------------------------------
# Confirm / Cancel / Delete
# ---------------------------------------------------------------------------
@router.patch("/{booking_id}/confirm")
async def confirm_booking(
    booking_id: str, body: ConfirmBody, user=Depends(get_current_user)
):
    booking = await _get_own_booking(booking_id, _user_id(user))

    if booking.get("status") == "cancelled":
        raise HTTPException(
            status_code=400, detail="Cancelled booking cannot be confirmed"
        )

    await db.bookings.update_one(
        {"_id": booking["_id"]},
        {
            "$set": {
                "status": "confirmed",
                "confirmationNumber": body.confirmationNumber,
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    updated = await db.bookings.find_one({"_id": booking["_id"]})
    return _serialize(updated)


@router.patch("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user=Depends(get_current_user)):
    booking = await _get_own_booking(booking_id, _user_id(user))

    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    await db.bookings.update_one(
        {"_id": booking["_id"]},
        {
            "$set": {
                "status": "cancelled",
                "cancelledAt": datetime.now(timezone.utc),
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    updated = await db.bookings.find_one({"_id": booking["_id"]})
    return _serialize(updated)


@router.delete("/{booking_id}")
async def delete_booking(booking_id: str, user=Depends(get_current_user)):
    booking = await _get_own_booking(booking_id, _user_id(user))

    if booking.get("status") != "cancelled":
        raise HTTPException(
            status_code=400, detail="Only cancelled bookings can be deleted"
        )

    await db.bookings.delete_one({"_id": booking["_id"]})
    return {"deleted": True, "id": booking_id}