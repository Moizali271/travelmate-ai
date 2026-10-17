import asyncio
import logging
import math
import re
import time
from datetime import date
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user
from app.db import db

router = APIRouter(prefix="/api/hotels", tags=["hotels"])
logger = logging.getLogger("uvicorn.error")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
# Pehla server na chale to doosra try hoga
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "TravelMateAI/1.0 (student project)"
CACHE_FRESH_SECONDS = 24 * 3600  # itni der tak list dobara server se nahi maangte
MAX_RESULTS = 60
OVERPASS_TIMEOUT = 20

HOTEL_KINDS = {"hotel", "guest_house", "hostel", "motel", "apartment"}
NOMINATIM_TERMS = ["hotel", "guest house", "hostel"]


def haversine_km(lat1, lon1, lat2, lon2) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def parse_stars(value):
    if not value:
        return None
    match = re.match(r"\s*(\d)", str(value))
    if not match:
        return None
    number = int(match.group(1))
    return number if 1 <= number <= 5 else None


def build_address(tags: dict) -> str:
    keys = ("addr:housenumber", "addr:street", "addr:suburb", "addr:city")
    return ", ".join(tags[k] for k in keys if tags.get(k))


def overpass_query(lat: float, lon: float, radius: int) -> str:
    kinds = "|".join(sorted(HOTEL_KINDS))
    return f"""[out:json][timeout:20];
(
  node["tourism"~"^({kinds})$"](around:{radius},{lat},{lon});
  way["tourism"~"^({kinds})$"](around:{radius},{lat},{lon});
);
out center 150;"""


def booking_link(name: str, city: str, check_in: date, check_out: date, guests: int) -> str:
    search = quote_plus(f"{name} {city}")
    return (
        "https://www.booking.com/searchresults.html"
        f"?ss={search}&checkin={check_in}&checkout={check_out}"
        f"&group_adults={guests}&no_rooms=1"
    )


def maps_link(name: str, city: str) -> str:
    return (
        "https://www.google.com/maps/search/?api=1&query="
        + quote_plus(f"{name} {city}")
    )


async def geocode(client: httpx.AsyncClient, text: str) -> dict:
    res = await client.get(
        NOMINATIM_URL,
        params={"q": text, "format": "json", "limit": 1, "accept-language": "en"},
        headers={"User-Agent": USER_AGENT},
    )
    if res.status_code != 200:
        raise HTTPException(status_code=502, detail="Destination search service available nahi")
    data = res.json()
    if not data:
        raise HTTPException(status_code=404, detail="Destination nahi mila")
    item = data[0]
    return {
        # User ne jo likha wahi naam rakhte hain (jaise "Karachi")
        "name": text.strip().title(),
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
    }


async def request_overpass(client: httpx.AsyncClient, lat: float, lon: float, radius: int):
    """Free Overpass servers se list maangta hai. Na mile to None deta hai."""
    query = overpass_query(lat, lon, radius)

    for url in OVERPASS_URLS:
        try:
            res = await client.post(
                url,
                data={"data": query},
                headers={"User-Agent": USER_AGENT},
                timeout=OVERPASS_TIMEOUT,
            )
        except httpx.HTTPError as err:
            logger.warning("Overpass %s failed: %s", url, repr(err))
            continue

        if res.status_code != 200:
            logger.warning(
                "Overpass %s status %s: %s",
                url,
                res.status_code,
                res.text[:200].replace("\n", " "),
            )
            continue

        try:
            data = res.json()
        except ValueError:
            logger.warning("Overpass %s returned non-JSON", url)
            continue

        # Kabhi kabhi Overpass 200 deta hai magar query fail hoti hai
        remark = str(data.get("remark", ""))
        if not data.get("elements") and "error" in remark.lower():
            logger.warning("Overpass %s remark: %s", url, remark[:200])
            continue

        return data.get("elements", [])

    return None


async def request_nominatim(client: httpx.AsyncClient, lat: float, lon: float, radius: int):
    """Overpass na chale to Nominatim se hotels. Overpass jaisi hi shape deta hai."""
    delta_lat = radius / 111000
    delta_lon = radius / (111000 * max(math.cos(math.radians(lat)), 0.2))
    # left, top, right, bottom
    viewbox = f"{lon - delta_lon},{lat + delta_lat},{lon + delta_lon},{lat - delta_lat}"

    found: dict = {}
    for index, term in enumerate(NOMINATIM_TERMS):
        if index > 0:
            await asyncio.sleep(1.1)  # Nominatim policy: 1 request per second

        try:
            res = await client.get(
                NOMINATIM_URL,
                params={
                    "q": term,
                    "format": "jsonv2",
                    "limit": 40,
                    "viewbox": viewbox,
                    "bounded": 1,
                    "extratags": 1,
                    "addressdetails": 1,
                    "accept-language": "en",
                },
                headers={"User-Agent": USER_AGENT},
            )
        except httpx.HTTPError as err:
            logger.warning("Nominatim fallback '%s' failed: %s", term, repr(err))
            continue

        if res.status_code != 200:
            logger.warning("Nominatim fallback '%s' status %s", term, res.status_code)
            continue

        try:
            items = res.json()
        except ValueError:
            continue

        for item in items:
            kind = item.get("type")
            if item.get("category") != "tourism" or kind not in HOTEL_KINDS:
                continue

            name = item.get("name") or ""
            if not name:
                continue

            extra = item.get("extratags") or {}
            address = item.get("address") or {}
            osm_type = item.get("osm_type", "node")
            osm_id = item.get("osm_id")
            if osm_id is None:
                continue

            tags = {
                "name": name,
                "tourism": kind,
                "stars": extra.get("stars"),
                "website": extra.get("website") or extra.get("contact:website"),
                "phone": extra.get("phone") or extra.get("contact:phone"),
                "addr:street": address.get("road"),
                "addr:suburb": address.get("suburb") or address.get("neighbourhood"),
                "addr:city": address.get("city") or address.get("town"),
            }
            found[(osm_type, osm_id)] = {
                "type": osm_type,
                "id": osm_id,
                "lat": float(item["lat"]),
                "lon": float(item["lon"]),
                "tags": {k: v for k, v in tags.items() if v},
            }

    logger.warning("Nominatim fallback ne %d hotels diye", len(found))
    return list(found.values())


async def fetch_elements(client: httpx.AsyncClient, lat: float, lon: float, radius: int):
    """(elements, stale). Pehle MongoDB cache, phir Overpass, phir Nominatim,
    phir purani cache."""
    key = f"{round(lat, 3)}:{round(lon, 3)}:{radius}"
    cached = await db.hotel_cache.find_one({"_id": key})

    if cached and time.time() - cached.get("savedAtTs", 0) < CACHE_FRESH_SECONDS:
        return cached["elements"], False

    elements = await request_overpass(client, lat, lon, radius)

    if not elements:
        # Overpass fail hui ya khali aayi, doosre source se koshish
        elements = await request_nominatim(client, lat, lon, radius)

    if elements:
        await db.hotel_cache.update_one(
            {"_id": key},
            {"$set": {"elements": elements, "savedAtTs": time.time()}},
            upsert=True,
        )
        return elements, False

    if cached:
        logger.warning("Data sources busy, purani saved hotel list use ho rahi hai (%s)", key)
        return cached["elements"], True

    raise HTTPException(
        status_code=502,
        detail="Hotel data service abhi busy hai, thori der baad try karo",
    )


@router.get("/search")
async def search_hotels(
    q: str = Query(min_length=2, max_length=100),
    checkIn: date = Query(),
    checkOut: date = Query(),
    guests: int = Query(default=2, ge=1, le=10),
    radius: int = Query(default=5000, ge=500, le=15000),
    user: dict = Depends(get_current_user),
):
    if checkIn < date.today():
        raise HTTPException(status_code=400, detail="Check-in date guzri hui nahi ho sakti")
    if checkOut <= checkIn:
        raise HTTPException(status_code=400, detail="Check-out, check-in ke baad honi chahiye")
    if (checkOut - checkIn).days > 30:
        raise HTTPException(status_code=400, detail="Zyada se zyada 30 raatein")

    try:
        async with httpx.AsyncClient(timeout=30) as client:
            place = await geocode(client, q.strip())
            elements, stale = await fetch_elements(
                client, place["lat"], place["lon"], radius
            )
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Hotel service se rabta nahi ho saka")

    hotels = []
    for el in elements:
        tags = el.get("tags") or {}
        name = tags.get("name")
        center = el.get("center") or {}
        lat = el.get("lat", center.get("lat"))
        lon = el.get("lon", center.get("lon"))
        if not name or lat is None or lon is None:
            continue

        hotels.append(
            {
                "id": f"{el.get('type')}/{el.get('id')}",
                "name": name,
                "type": tags.get("tourism", "hotel"),
                "stars": parse_stars(tags.get("stars")),
                "lat": lat,
                "lon": lon,
                "distanceKm": round(haversine_km(place["lat"], place["lon"], lat, lon), 2),
                "address": build_address(tags),
                "phone": tags.get("phone") or tags.get("contact:phone") or "",
                "website": tags.get("website") or tags.get("contact:website") or "",
                "bookingUrl": booking_link(name, place["name"], checkIn, checkOut, guests),
                "mapsUrl": maps_link(name, place["name"]),
            }
        )

    hotels.sort(key=lambda h: h["distanceKm"])

    return {
        "destination": place,
        "checkIn": str(checkIn),
        "checkOut": str(checkOut),
        "guests": guests,
        "stale": stale,
        "count": len(hotels[:MAX_RESULTS]),
        "hotels": hotels[:MAX_RESULTS],
    }