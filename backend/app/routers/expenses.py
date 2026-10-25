from datetime import date, datetime, timezone
from typing import Literal, Optional

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, field_validator
from pymongo.errors import DuplicateKeyError

from app.auth import get_current_user
from app.db import db

router = APIRouter(prefix="/api/expenses", tags=["expenses"])

Category = Literal[
    "accommodation", "food", "transport", "activities", "shopping", "other"
]
GENERAL = "general"
DEFAULT_CURRENCY = "PKR"


class ExpenseCreate(BaseModel):
    tripId: Optional[str] = Field(default=None, max_length=50)  # None = General
    title: str = Field(min_length=1, max_length=100)
    category: Category = "other"
    amount: float = Field(gt=0, le=1_000_000_000)
    expenseDate: date
    notes: str = Field(default="", max_length=300)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        value = value.strip()
        if not value:
            raise ValueError("Title khali nahi ho sakta")
        return value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip()


class ExpenseUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=100)
    category: Optional[Category] = None
    amount: Optional[float] = Field(default=None, gt=0, le=1_000_000_000)
    expenseDate: Optional[date] = None
    notes: Optional[str] = Field(default=None, max_length=300)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Title khali nahi ho sakta")
        return value

    @field_validator("notes")
    @classmethod
    def clean_notes(cls, value):
        return value.strip() if value is not None else value


class BudgetSet(BaseModel):
    amount: float = Field(ge=0, le=1_000_000_000)
    currency: str = Field(default=DEFAULT_CURRENCY, min_length=3, max_length=10)

    @field_validator("currency")
    @classmethod
    def upper_currency(cls, value):
        return value.strip().upper()


def serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def to_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


async def get_own_trip(trip_id: str, user: dict) -> dict:
    trip = await db.trips.find_one(
        {"_id": to_object_id(trip_id, "trip id"), "userId": user["id"]}
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


async def resolve_scope(trip_id: Optional[str], user: dict):
    """(tripId ya None, budget info). General ka budget budgets collection se,
    trip ka budget seedha trip se (Trip Planner wala)."""
    if not trip_id or trip_id == GENERAL:
        doc = await db.budgets.find_one({"userId": user["id"], "scope": GENERAL})
        info = {
            "scope": "general",
            "title": "General (no trip)",
            "budget": float(doc["amount"]) if doc else 0.0,
            "currency": doc["currency"] if doc else DEFAULT_CURRENCY,
        }
        return None, info

    trip = await get_own_trip(trip_id, user)
    info = {
        "scope": "trip",
        "title": trip.get("title", ""),
        "budget": float(trip.get("budget") or 0),
        "currency": trip.get("currency", DEFAULT_CURRENCY),
    }
    return trip_id, info


async def run_aggregate(pipeline: list) -> list:
    # Async pymongo mein aggregate() pehle await hota hai, phir cursor milta hai
    cursor = await db.expenses.aggregate(pipeline)
    return [row async for row in cursor]


@router.post("", status_code=201)
async def create_expense(
    expense: ExpenseCreate, user: dict = Depends(get_current_user)
):
    trip_id, _ = await resolve_scope(expense.tripId, user)

    data = expense.model_dump(mode="json")
    now = datetime.now(timezone.utc)
    data.update(
        {
            "tripId": trip_id,
            "userId": user["id"],
            "bookingId": None,
            "createdAt": now,
            "updatedAt": now,
        }
    )
    result = await db.expenses.insert_one(data)
    created = await db.expenses.find_one({"_id": result.inserted_id})
    return serialize(created)


@router.get("")
async def list_expenses(
    tripId: Optional[str] = None, user: dict = Depends(get_current_user)
):
    query: dict = {"userId": user["id"]}
    if tripId == GENERAL:
        query["tripId"] = None
    elif tripId:
        query["tripId"] = tripId

    expenses = []
    async for doc in db.expenses.find(query).sort(
        [("expenseDate", -1), ("createdAt", -1)]
    ):
        expenses.append(serialize(doc))
    return expenses


@router.get("/summary")
async def expense_summary(
    tripId: str = GENERAL, user: dict = Depends(get_current_user)
):
    trip_id, info = await resolve_scope(tripId, user)
    match = {"userId": user["id"], "tripId": trip_id}

    category_rows = await run_aggregate(
        [
            {"$match": match},
            {
                "$group": {
                    "_id": "$category",
                    "total": {"$sum": "$amount"},
                    "count": {"$sum": 1},
                }
            },
            {"$sort": {"total": -1}},
        ]
    )
    by_category = [
        {
            "category": row["_id"],
            "total": round(row["total"], 2),
            "count": row["count"],
        }
        for row in category_rows
    ]

    day_rows = await run_aggregate(
        [
            {"$match": match},
            {"$group": {"_id": "$expenseDate", "total": {"$sum": "$amount"}}},
            {"$sort": {"_id": 1}},
        ]
    )
    by_day = [
        {"date": row["_id"], "total": round(row["total"], 2)}
        for row in day_rows
    ]

    total = round(sum(item["total"] for item in by_category), 2)
    count = sum(item["count"] for item in by_category)
    budget = info["budget"]

    return {
        "scope": info["scope"],
        "tripId": trip_id,
        "title": info["title"],
        "currency": info["currency"],
        "budget": budget,
        "totalSpent": total,
        "remaining": round(budget - total, 2),
        "overBudget": budget > 0 and total > budget,
        "percentUsed": round(total / budget * 100, 1) if budget > 0 else None,
        "expenseCount": count,
        "byCategory": by_category,
        "byDay": by_day,
    }


@router.put("/budget/general")
async def set_general_budget(
    body: BudgetSet, user: dict = Depends(get_current_user)
):
    await db.budgets.update_one(
        {"userId": user["id"], "scope": GENERAL},
        {
            "$set": {
                "amount": body.amount,
                "currency": body.currency,
                "updatedAt": datetime.now(timezone.utc),
            }
        },
        upsert=True,
    )
    return {"scope": GENERAL, "amount": body.amount, "currency": body.currency}


@router.post("/from-booking/{booking_id}", status_code=201)
async def expense_from_booking(
    booking_id: str, user: dict = Depends(get_current_user)
):
    booking = await db.bookings.find_one(
        {"_id": to_object_id(booking_id, "booking id"), "userId": user["id"]}
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("status") == "cancelled":
        raise HTTPException(status_code=409, detail="Cancelled booking ka kharcha add nahi hota")
    if not booking.get("tripId"):
        raise HTTPException(status_code=400, detail="Is booking ko pehle kisi trip se jodein")

    price = booking.get("totalPrice")
    if (
        isinstance(price, bool)
        or not isinstance(price, (int, float))
        or price <= 0
    ):
        raise HTTPException(status_code=400, detail="Is booking mein sahi price nahi likhi")

    check_in = booking.get("checkIn")
    if not check_in:
        raise HTTPException(status_code=400, detail="Is booking mein check-in date nahi hai")

    trip = await get_own_trip(booking["tripId"], user)
    if booking.get("currency") != trip.get("currency"):
        raise HTTPException(
            status_code=409,
            detail="Booking aur trip ki currency alag hai, kharcha manually add karein",
        )

    now = datetime.now(timezone.utc)
    nights = booking.get("nights")
    if not isinstance(nights, int) or nights < 1:
        nights = 1
    hotel_name = booking.get("hotelName") or "Hotel"
    data = {
        "tripId": booking["tripId"],
        "title": f"{hotel_name} ({nights} night{'s' if nights > 1 else ''})"[:100],
        "category": "accommodation",
        "amount": price,
        "expenseDate": check_in,
        "notes": f"Booking {booking.get('reference', '')}"[:300],
        "userId": user["id"],
        "bookingId": booking_id,
        "createdAt": now,
        "updatedAt": now,
    }

    try:
        result = await db.expenses.insert_one(data)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409, detail="Is booking ka kharcha pehle se add hai"
        )

    created = await db.expenses.find_one({"_id": result.inserted_id})
    return serialize(created)


@router.patch("/{expense_id}")
async def update_expense(
    expense_id: str,
    changes: ExpenseUpdate,
    user: dict = Depends(get_current_user),
):
    oid = to_object_id(expense_id, "expense id")
    update_data = changes.model_dump(mode="json", exclude_unset=True)
    # null bhejne par koi field khali na ho jaye
    update_data = {k: v for k, v in update_data.items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No changes provided")
    update_data["updatedAt"] = datetime.now(timezone.utc)

    result = await db.expenses.update_one(
        {"_id": oid, "userId": user["id"]}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")

    doc = await db.expenses.find_one({"_id": oid, "userId": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Expense not found")
    return serialize(doc)


@router.delete("/{expense_id}", status_code=204)
async def delete_expense(
    expense_id: str, user: dict = Depends(get_current_user)
):
    result = await db.expenses.delete_one(
        {"_id": to_object_id(expense_id, "expense id"), "userId": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Expense not found")