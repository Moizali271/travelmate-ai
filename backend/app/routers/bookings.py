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

import re
import secrets
from datetime import date, datetime, timezone
from typing import Any, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from app.auth import get_current_user
from app.db import db

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

ACTIVE_STATUSES = ["requested", "confirmed"]
MAX_NIGHTS = 30
PHONE_RE = re.compile(r"^[0-9+\-\s()]{7,20}$")


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------
class BookingCreate(BaseModel):
    tripId: Optional[str] = Field(default=None, max_length=50)
    hotelId: Optional[str] = Field(default=None, max_length=100)
    hotelName: str = Field(min_length=1, max_length=200)
    hotelType: Optional[str] = Field(default=None, max_length=50)
    stars: Optional[float] = Field(default=None, ge=0, le=5)
    lat: Optional[float] = Field(default=None, ge=-90, le=90)
    lon: Optional[float] = Field(default=None, ge=-180, le=180)
    address: Optional[str] = Field(default=None, max_length=300)
    destination: Optional[str] = Field(default=None, max_length=100)
    checkIn: str = Field(max_length=30)
    checkOut: str = Field(max_length=30)
    guests: int = Field(default=1, ge=1, le=10)
    rooms: int = Field(default=1, ge=1, le=5)
    guestName: Optional[str] = Field(default=None, max_length=100)
    phone: Optional[str] = Field(default=None, max_length=20)
    notes: Optional[str] = Field(default=None, max_length=500)
    pricePerNight: Optional[float] = Field(default=None, ge=0, le=10_000_000)
    currency: Optional[str] = Field(default="PKR", max_length=10)


class ConfirmBody(BaseModel):
    confirmationNumber: str = Field(max_length=50)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _user_id(user: Any) -> str:
    """Return the logged-in user's id as a string."""
    value = user.get("id") if isinstance(user, dict) else None
    if not value:
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
    return model.model_dump()


def _clean(value: Optional[str]) -> Optional[str]:
    if value is None:
        return None
    value = value.strip()
    return value or None


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

    hotel_name = payload.hotelName.strip()
    if not hotel_name:
        raise HTTPException(status_code=400, detail="Hotel name is required")

    check_in = _parse_date(payload.checkIn, "checkIn")
    check_out = _parse_date(payload.checkOut, "checkOut")
    if check_in < date.today():
        raise HTTPException(status_code=400, detail="Check-in cannot be in the past")
    if check_out <= check_in:
        raise HTTPException(
            status_code=400, detail="Check-out must be after check-in"
        )
    nights = (check_out - check_in).days
    if nights > MAX_NIGHTS:
        raise HTTPException(
            status_code=400, detail=f"Maximum {MAX_NIGHTS} nights per booking"
        )

    phone = _clean(payload.phone)
    if phone and not PHONE_RE.match(phone):
        raise HTTPException(status_code=400, detail="Phone number is not valid")

    guest_name = _clean(payload.guestName)
    if guest_name is not None and len(guest_name) < 2:
        raise HTTPException(
            status_code=400, detail="Guest name must be at least 2 characters"
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

    total_price = None
    if payload.pricePerNight is not None:
        total_price = round(payload.pricePerNight * nights * payload.rooms, 2)

    currency = (payload.currency or "PKR").strip().upper() or "PKR"

    now = datetime.now(timezone.utc)
    doc = _to_dict(payload)
    doc.update(
        {
            "userId": uid,
            "hotelName": hotel_name,
            "guestName": guest_name,
            "phone": phone,
            "notes": _clean(payload.notes),
            "currency": currency,
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
    status: Optional[str] = Query(default=None, max_length=20),
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
    uid = _user_id(user)
    booking = await _get_own_booking(booking_id, uid)

    if booking.get("status") == "cancelled":
        raise HTTPException(
            status_code=400, detail="Cancelled booking cannot be confirmed"
        )

    confirmation = body.confirmationNumber.strip()
    if not confirmation:
        raise HTTPException(
            status_code=400, detail="Confirmation number is required"
        )

    await db.bookings.update_one(
        {"_id": booking["_id"], "userId": {"$in": _user_id_variants(uid)}},
        {
            "$set": {
                "status": "confirmed",
                "confirmationNumber": confirmation,
                "updatedAt": datetime.now(timezone.utc),
            }
        },
    )
    updated = await db.bookings.find_one(
        {"_id": booking["_id"], "userId": {"$in": _user_id_variants(uid)}}
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Booking not found")
    return _serialize(updated)


@router.patch("/{booking_id}/cancel")
async def cancel_booking(booking_id: str, user=Depends(get_current_user)):
    uid = _user_id(user)
    booking = await _get_own_booking(booking_id, uid)

    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=400, detail="Booking is already cancelled")

    now = datetime.now(timezone.utc)
    await db.bookings.update_one(
        {"_id": booking["_id"], "userId": {"$in": _user_id_variants(uid)}},
        {
            "$set": {
                "status": "cancelled",
                "cancelledAt": now,
                "updatedAt": now,
            }
        },
    )
    updated = await db.bookings.find_one(
        {"_id": booking["_id"], "userId": {"$in": _user_id_variants(uid)}}
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Booking not found")
    return _serialize(updated)


@router.delete("/{booking_id}")
async def delete_booking(booking_id: str, user=Depends(get_current_user)):
    uid = _user_id(user)
    booking = await _get_own_booking(booking_id, uid)

    if booking.get("status") != "cancelled":
        raise HTTPException(
            status_code=400, detail="Only cancelled bookings can be deleted"
        )

    await db.bookings.delete_one(
        {"_id": booking["_id"], "userId": {"$in": _user_id_variants(uid)}}
    )
    return {"deleted": True, "id": booking_id}