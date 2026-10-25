import math
from datetime import date, datetime, timedelta, timezone
from typing import Literal, Optional

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from pymongo import UpdateOne
from pymongo.errors import DuplicateKeyError

from app.auth import get_current_user
from app.db import db
from app.schemas import StopCreate

router = APIRouter(prefix="/api/trips", tags=["stops"])

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "TravelMateAI/1.0 (student project)"
ROAD_FACTOR = 1.3
AVG_SPEED_KMH = 40

CostType = Literal[
    "accommodation", "food", "transport", "activities", "shopping", "other"
]


class StopUpdate(BaseModel):
    startTime: Optional[str] = Field(default=None, pattern=r"^(\d{2}:\d{2})?$")
    visitMinutes: Optional[int] = Field(default=None, ge=0, le=1440)
    notes: Optional[str] = Field(default=None, max_length=500)
    cost: Optional[float] = Field(default=None, ge=0, le=1_000_000_000)
    costType: Optional[CostType] = None
    visited: Optional[bool] = None


class ReorderItem(BaseModel):
    id: str
    dayNumber: int = Field(ge=1)
    stopOrder: int = Field(ge=1)


class ReorderBody(BaseModel):
    items: list[ReorderItem] = Field(max_length=500)


class StopByName(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    dayNumber: int = Field(default=1, ge=1)


def to_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


def serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def with_defaults(doc: dict) -> dict:
    doc.setdefault("dayNumber", 1)
    doc.setdefault("visitMinutes", 60)
    doc.setdefault("startTime", "")
    doc.setdefault("notes", "")
    doc.setdefault("cost", 0)
    doc.setdefault("costType", "activities")
    return doc


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def has_coords(stop: dict) -> bool:
    return isinstance(stop.get("lat"), (int, float)) and isinstance(
        stop.get("lon"), (int, float)
    )


def trip_days(trip: dict) -> tuple[int, date]:
    try:
        start = date.fromisoformat(str(trip["startDate"])[:10])
        end = date.fromisoformat(str(trip["endDate"])[:10])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=400,
            detail="Trip ki dates sahi nahi hain, pehle dates theek karein",
        )
    return max((end - start).days + 1, 1), start


async def get_own_trip(trip_id: str, user: dict) -> dict:
    trip = await db.trips.find_one(
        {"_id": to_object_id(trip_id, "trip id"), "userId": user["id"]}
    )
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")
    return trip


async def next_order(trip_id: str) -> int:
    last = await db.itinerary_stops.find_one(
        {"tripId": trip_id}, sort=[("stopOrder", -1)]
    )
    return (last["stopOrder"] if last else 0) + 1


@router.post("/{trip_id}/stops", status_code=201)
async def add_stop(
    trip_id: str, stop: StopCreate, user: dict = Depends(get_current_user)
):
    await get_own_trip(trip_id, user)

    doc = stop.model_dump()
    doc.update(
        {
            "tripId": trip_id,
            "userId": user["id"],
            "dayNumber": 1,
            "stopOrder": await next_order(trip_id),
            "visited": False,
            "visitMinutes": 60,
            "startTime": "",
            "notes": "",
            "cost": 0,
            "costType": "activities",
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


@router.post("/{trip_id}/stops/by-name", status_code=201)
async def add_stop_by_name(
    trip_id: str, body: StopByName, user: dict = Depends(get_current_user)
):
    trip = await get_own_trip(trip_id, user)
    n_days, _ = trip_days(trip)
    if body.dayNumber > n_days:
        raise HTTPException(
            status_code=400, detail=f"Is trip mein sirf {n_days} din hain"
        )

    name = body.name.strip()
    if len(name) < 2:
        raise HTTPException(status_code=400, detail="Jagah ka naam likhein")

    try:
        async with httpx.AsyncClient(timeout=15) as client:
            res = await client.get(
                NOMINATIM_URL,
                params={
                    "q": name,
                    "format": "json",
                    "limit": 1,
                    "accept-language": "en",
                },
                headers={"User-Agent": USER_AGENT},
            )
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502, detail="Location service se rabta nahi ho saka"
        )

    if res.status_code == 429:
        raise HTTPException(
            status_code=502,
            detail="Location service par bohat requests hain, thori der baad try karein",
        )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Location service available nahi")

    try:
        data = res.json()
    except ValueError:
        raise HTTPException(
            status_code=502, detail="Location service ka jawab samajh nahi aaya"
        )

    if not isinstance(data, list) or not data:
        raise HTTPException(status_code=404, detail="Yeh jagah nahi mili")

    item = data[0]
    try:
        lat = float(item["lat"])
        lon = float(item["lon"])
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=502, detail="Location service ka jawab adhoora hai"
        )

    place_id = f"osm:{item.get('osm_type', 'x')}/{item.get('osm_id', '0')}"

    doc = {
        "placeId": place_id,
        "name": name,
        "lat": lat,
        "lon": lon,
        "category": str(item.get("type", "")),
        "photoUrl": None,
        "wikiUrl": None,
        "tripId": trip_id,
        "userId": user["id"],
        "dayNumber": body.dayNumber,
        "stopOrder": await next_order(trip_id),
        "visited": False,
        "visitMinutes": 60,
        "startTime": "",
        "notes": "",
        "cost": 0,
        "costType": "activities",
        "createdAt": datetime.now(timezone.utc),
    }
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
        stops.append(with_defaults(serialize(doc)))
    return stops


@router.put("/{trip_id}/stops/reorder")
async def reorder_stops(
    trip_id: str, body: ReorderBody, user: dict = Depends(get_current_user)
):
    trip = await get_own_trip(trip_id, user)
    n_days, _ = trip_days(trip)

    ids = [to_object_id(item.id, "stop id") for item in body.items]
    if len(set(ids)) != len(ids):
        raise HTTPException(status_code=400, detail="Duplicate stop ids")

    for item in body.items:
        if item.dayNumber > n_days:
            raise HTTPException(
                status_code=400, detail=f"Is trip mein sirf {n_days} din hain"
            )

    count = await db.itinerary_stops.count_documents(
        {"_id": {"$in": ids}, "tripId": trip_id, "userId": user["id"]}
    )
    if count != len(ids):
        raise HTTPException(status_code=404, detail="Koi stop nahi mila")

    ops = [
        UpdateOne(
            {"_id": oid, "tripId": trip_id, "userId": user["id"]},
            {"$set": {"dayNumber": item.dayNumber, "stopOrder": item.stopOrder}},
        )
        for oid, item in zip(ids, body.items)
    ]
    if ops:
        await db.itinerary_stops.bulk_write(ops)
    return {"updated": len(ops)}


@router.patch("/{trip_id}/stops/{stop_id}")
async def update_stop(
    trip_id: str,
    stop_id: str,
    changes: StopUpdate,
    user: dict = Depends(get_current_user),
):
    await get_own_trip(trip_id, user)
    data = changes.model_dump(exclude_unset=True)
    # null bhejne par koi field khali na ho jaye
    data = {k: v for k, v in data.items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="No changes provided")

    oid = to_object_id(stop_id, "stop id")
    result = await db.itinerary_stops.update_one(
        {"_id": oid, "tripId": trip_id, "userId": user["id"]}, {"$set": data}
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Stop not found")

    doc = await db.itinerary_stops.find_one(
        {"_id": oid, "tripId": trip_id, "userId": user["id"]}
    )
    if not doc:
        raise HTTPException(status_code=404, detail="Stop not found")
    return with_defaults(serialize(doc))


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


@router.get("/{trip_id}/itinerary")
async def get_itinerary(trip_id: str, user: dict = Depends(get_current_user)):
    trip = await get_own_trip(trip_id, user)
    n_days, start = trip_days(trip)

    stops = []
    async for doc in db.itinerary_stops.find(
        {"tripId": trip_id, "userId": user["id"]}
    ).sort([("dayNumber", 1), ("stopOrder", 1)]):
        stops.append(with_defaults(serialize(doc)))

    by_day: dict[int, list] = {n: [] for n in range(1, n_days + 1)}
    for stop in stops:
        try:
            day = min(max(int(stop["dayNumber"]), 1), n_days)
        except (TypeError, ValueError):
            day = 1
        by_day[day].append(stop)

    days = []
    total_distance = 0.0
    total_travel = 0
    stops_cost = 0.0
    by_category: dict[str, float] = {}

    for number in range(1, n_days + 1):
        day_stops = by_day[number]

        distance = 0.0
        for a, b in zip(day_stops, day_stops[1:]):
            if has_coords(a) and has_coords(b):
                distance += haversine_km(a["lat"], a["lon"], b["lat"], b["lon"])
        distance = round(distance * ROAD_FACTOR, 1)
        travel_minutes = round(distance / AVG_SPEED_KMH * 60)

        day_cost = sum(float(s["cost"] or 0) for s in day_stops)
        for s in day_stops:
            kind = s["costType"] or "other"
            by_category[kind] = by_category.get(kind, 0.0) + float(s["cost"] or 0)

        total_distance += distance
        total_travel += travel_minutes
        stops_cost += day_cost

        days.append(
            {
                "dayNumber": number,
                "date": (start + timedelta(days=number - 1)).isoformat(),
                "stops": day_stops,
                "distanceKm": distance,
                "travelMinutes": travel_minutes,
                "visitMinutes": sum(int(s["visitMinutes"] or 0) for s in day_stops),
                "cost": round(day_cost, 2),
            }
        )

    bookings_cost = 0.0
    async for booking in db.bookings.find(
        {"tripId": trip_id, "userId": user["id"], "status": {"$ne": "cancelled"}}
    ):
        bookings_cost += float(booking.get("totalPrice") or 0)

    budget = float(trip.get("budget") or 0)
    total_cost = stops_cost + bookings_cost

    return {
        "trip": {
            "id": trip_id,
            "title": trip.get("title", ""),
            "destination": trip.get("destination", ""),
            "startDate": str(trip["startDate"])[:10],
            "endDate": str(trip["endDate"])[:10],
            "budget": budget,
            "currency": trip.get("currency", "PKR"),
            "travelerCount": trip.get("travelerCount", 1),
        },
        "days": days,
        "summary": {
            "totalDays": n_days,
            "totalStops": len(stops),
            "totalDistanceKm": round(total_distance, 1),
            "totalTravelMinutes": total_travel,
            "stopsCost": round(stops_cost, 2),
            "bookingsCost": round(bookings_cost, 2),
            "totalCost": round(total_cost, 2),
            "budget": budget,
            "remaining": round(budget - total_cost, 2),
            "byCategory": {k: round(v, 2) for k, v in by_category.items() if v > 0},
        },
    }