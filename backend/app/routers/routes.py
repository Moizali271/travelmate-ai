import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException

from app.auth import get_current_user
from app.db import db
from app.schemas import RouteCalculate, RouteSave

load_dotenv()

ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_URL = "https://api.openrouteservice.org/v2/directions/{profile}/geojson"
PROFILES = {
    "driving": "driving-car",
    "walking": "foot-walking",
    "cycling": "cycling-regular",
}

router = APIRouter(prefix="/api/routes", tags=["routes"])


def serialize(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    return doc


def to_object_id(value: str, label: str) -> ObjectId:
    try:
        return ObjectId(value)
    except InvalidId:
        raise HTTPException(status_code=400, detail=f"Invalid {label}")


@router.post("/calculate")
async def calculate_route(
    data: RouteCalculate, user: dict = Depends(get_current_user)
):
    if not ORS_API_KEY:
        raise HTTPException(status_code=500, detail="ORS_API_KEY .env mein set nahi hai")

    body = {
        "coordinates": [
            [data.start.lon, data.start.lat],
            [data.end.lon, data.end.lat],
        ],
        "radiuses": [-1, -1],
    }
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            res = await client.post(
                ORS_URL.format(profile=PROFILES[data.mode]),
                json=body,
                headers={"Authorization": ORS_API_KEY},
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Routing service se rabta nahi ho saka")

    if res.status_code != 200:
        detail = "Route nahi mil saka"
        try:
            err = res.json().get("error")
            if isinstance(err, dict):
                detail = err.get("message", detail)
            elif isinstance(err, str):
                detail = err
        except ValueError:
            pass
        if res.status_code == 429:
            raise HTTPException(status_code=429, detail="Aaj ki routing limit poori ho gayi")
        code = 400 if res.status_code in (400, 404) else 502
        raise HTTPException(status_code=code, detail=detail)

    feature = res.json()["features"][0]
    summary = feature["properties"]["summary"]
    return {
        "mode": data.mode,
        "distanceMeters": summary["distance"],
        "durationSeconds": summary["duration"],
        # ORS [lon, lat] deta hai, Leaflet ko [lat, lon] chahiye
        "geometry": [[lat, lon] for lon, lat in feature["geometry"]["coordinates"]],
    }


@router.post("/save", status_code=201)
async def save_route(route: RouteSave, user: dict = Depends(get_current_user)):
    doc = route.model_dump()
    if doc["tripId"]:
        trip = await db.trips.find_one(
            {"_id": to_object_id(doc["tripId"], "trip id"), "userId": user["id"]}
        )
        if not trip:
            raise HTTPException(status_code=404, detail="Trip not found")
    doc["userId"] = user["id"]
    doc["createdAt"] = datetime.now(timezone.utc)
    result = await db.routes.insert_one(doc)
    created = await db.routes.find_one({"_id": result.inserted_id})
    return serialize(created)


@router.get("/saved")
async def list_saved_routes(
    tripId: Optional[str] = None, user: dict = Depends(get_current_user)
):
    query = {"userId": user["id"]}
    if tripId:
        query["tripId"] = tripId
    routes = []
    async for doc in db.routes.find(query).sort("createdAt", -1):
        routes.append(serialize(doc))
    return routes


@router.delete("/{route_id}", status_code=204)
async def delete_route(route_id: str, user: dict = Depends(get_current_user)):
    result = await db.routes.delete_one(
        {"_id": to_object_id(route_id, "route id"), "userId": user["id"]}
    )
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Route not found")