from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import db
from app.schemas import TripCreate, TripUpdate

router = APIRouter(prefix="/api/trips", tags=["trips"])


def serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def to_object_id(trip_id: str) -> ObjectId:
    try:
        return ObjectId(trip_id)
    except InvalidId:
        raise HTTPException(status_code=400, detail="Invalid trip id")


@router.post("", status_code=201)
async def create_trip(trip: TripCreate, user: dict = Depends(get_current_user)):
    data = trip.model_dump(mode="json")
    now = datetime.now(timezone.utc)
    data["userId"] = user["id"]
    data["createdAt"] = now
    data["updatedAt"] = now
    result = await db.trips.insert_one(data)
    created = await db.trips.find_one({"_id": result.inserted_id})
    return serialize(created)


@router.get("")
async def list_trips(user: dict = Depends(get_current_user)):
    trips = []
    async for doc in db.trips.find({"userId": user["id"]}).sort("createdAt", -1):
        trips.append(serialize(doc))
    return trips


@router.get("/{trip_id}")
async def get_trip(trip_id: str, user: dict = Depends(get_current_user)):
    doc = await db.trips.find_one(
        {"_id": to_object_id(trip_id), "userId": user["id"]}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    return serialize(doc)


@router.patch("/{trip_id}")
async def update_trip(
    trip_id: str, changes: TripUpdate, user: dict = Depends(get_current_user)
):
    oid = to_object_id(trip_id)
    update_data = changes.model_dump(mode="json", exclude_unset=True)
    # owner fields kabhi client se change nahi hone chahiye
    for protected in ("id", "_id", "userId", "createdAt"):
        update_data.pop(protected, None)
    # null bhejne par koi field khali na ho jaye
    update_data = {k: v for k, v in update_data.items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No changes provided")

    existing = await db.trips.find_one({"_id": oid, "userId": user["id"]})
    if not existing:
        raise HTTPException(status_code=404, detail="Trip not found")

    # sirf ek date badli ho to purani date ke saath compare karo
    if "startDate" in update_data or "endDate" in update_data:
        new_start = str(update_data.get("startDate", existing.get("startDate")))[:10]
        new_end = str(update_data.get("endDate", existing.get("endDate")))[:10]
        if new_end < new_start:
            raise HTTPException(
                status_code=400,
                detail="endDate, startDate se pehle nahi ho sakti",
            )

    update_data["updatedAt"] = datetime.now(timezone.utc)
    await db.trips.update_one(
        {"_id": oid, "userId": user["id"]}, {"$set": update_data}
    )
    doc = await db.trips.find_one({"_id": oid, "userId": user["id"]})
    if not doc:
        raise HTTPException(status_code=404, detail="Trip not found")
    return serialize(doc)


@router.delete("/{trip_id}", status_code=204)
async def delete_trip(trip_id: str, user: dict = Depends(get_current_user)):
    result = await db.trips.delete_one(
        {"_id": to_object_id(trip_id), "userId": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    # trip ke saath uske saare stops bhi hata dein
    await db.itinerary_stops.delete_many({"tripId": trip_id, "userId": user["id"]})
    # trip ke saath uske saved routes bhi hata dein
    await db.routes.delete_many({"tripId": trip_id, "userId": user["id"]})
    # trip ke saath uske expenses aur budget bhi hata dein
    await db.expenses.delete_many({"tripId": trip_id, "userId": user["id"]})
    await db.expense_budgets.delete_many({"tripId": trip_id, "userId": user["id"]})
    # bookings delete nahi hongi, sirf trip se alag ho jayengi
    await db.bookings.update_many(
        {"tripId": trip_id, "userId": user["id"]},
        {"$set": {"tripId": None}},
    )