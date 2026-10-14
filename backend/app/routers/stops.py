from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pymongo.errors import DuplicateKeyError

from app.auth import get_current_user
from app.db import db
from app.schemas import StopCreate

router = APIRouter(prefix="/api/trips", tags=["stops"])


def to_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


async def get_own_trip(trip_id: str, user: dict) -> dict:
    trip = await db.trips.find_one(
        {"_id": to_object_id(trip_id, "trip id"), "userId": user["id"]}
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


@router.post("/{trip_id}/stops", status_code=201)
async def add_stop(
    trip_id: str, stop: StopCreate, user: dict = Depends(get_current_user)
):
    await get_own_trip(trip_id, user)

    last = await db.itinerary_stops.find_one(
        {"tripId": trip_id}, sort=[("stopOrder", -1)]
    )
    doc = stop.model_dump()
    doc.update(
        {
            "tripId": trip_id,
            "userId": user["id"],
            "dayNumber": 1,
            "stopOrder": (last["stopOrder"] if last else 0) + 1,
            "visited": False,
            "createdAt": datetime.now(timezone.utc),
        }
    )
    try:
        result = await db.itinerary_stops.insert_one(doc)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=409, detail="Yeh jagah pehle se is trip mein hai"
        )

    created = await db.itinerary_stops.find_one({"_id": result.inserted_id})
    return serialize(created)


@router.get("/{trip_id}/stops")
async def list_stops(trip_id: str, user: dict = Depends(get_current_user)):
    await get_own_trip(trip_id, user)
    stops = []
    async for doc in db.itinerary_stops.find(
        {"tripId": trip_id, "userId": user["id"]}
    ).sort("stopOrder", 1):
        stops.append(serialize(doc))
    return stops


@router.delete("/{trip_id}/stops/{stop_id}", status_code=204)
async def delete_stop(
    trip_id: str, stop_id: str, user: dict = Depends(get_current_user)
):
    result = await db.itinerary_stops.delete_one(
        {
            "_id": to_object_id(stop_id, "stop id"),
            "tripId": trip_id,
            "userId": user["id"],
        }
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Stop not found")