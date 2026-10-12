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
    if not update_data:
        raise HTTPException(status_code=400, detail="No changes provided")
    update_data["updatedAt"] = datetime.now(timezone.utc)
    result = await db.trips.update_one(
        {"_id": oid, "userId": user["id"]}, {"$set": update_data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")
    doc = await db.trips.find_one({"_id": oid})
    return serialize(doc)


@router.delete("/{trip_id}", status_code=204)
async def delete_trip(trip_id: str, user: dict = Depends(get_current_user)):
    result = await db.trips.delete_one(
        {"_id": to_object_id(trip_id), "userId": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Trip not found")