import asyncio
import hashlib
import logging
import math
import os
import re
import time
from datetime import date
from urllib.parse import quote_plus

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user

try:  # .env se PEXELS_API_KEY padhne ke liye (agar python-dotenv installed ho)
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

router = APIRouter(prefix="/api/hotels", tags=["hotels"])
logger = logging.getLogger("uvicorn.error")

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
]
USER_AGENT = "TravelMateAI/1.0 (student project)"
CACHE_SECONDS = 600
MAX_RESULTS = 60
ROUNDS = 2

# Pexels (optional): .env mein PEXELS_API_KEY=xxxx likhein
PEXELS_URL = "https://api.pexels.com/v1/search"
PHOTO_CACHE_SECONDS = 86400
PHOTO_QUERIES = {
    "hotel": "hotel room interior",
    "guest_house": "cozy guest house bedroom",
    "hostel": "hostel dorm room",
    "motel": "motel room",
    "apartment": "modern apartment bedroom",
}

_cache: dict = {}
_photo_cache: dict = {}


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


def parse_amenities(tags: dict) -> list:
    amenities = []

    internet = str(tags.get("internet_access", "")).lower()
    if internet in ("wlan", "wifi", "yes", "wired") or tags.get("wifi") == "yes":
        amenities.append("wifi")

    if tags.get("swimming_pool") == "yes" or tags.get("pool") == "yes":
        amenities.append("pool")

    if tags.get("air_conditioning") == "yes":
        amenities.append("ac")

    if tags.get("parking") or tags.get("parking:fee") or tags.get("capacity:parking"):
        amenities.append("parking")

    if tags.get("wheelchair") in ("yes", "limited"):
        amenities.append("wheelchair")

    return amenities


def valid_image(url) -> str:
    if not url:
        return ""
    url = str(url).strip()
    return url if url.startswith(("http://", "https://")) else ""


def overpass_query(lat: float, lon: float, radius: int) -> str:
    kinds = "hotel|guest_house|hostel|motel|apartment"
    return f"""[out:json][timeout:25];
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
        "name": text.strip().title(),
        "lat": float(item["lat"]),
        "lon": float(item["lon"]),
    }


async def fetch_elements(client: httpx.AsyncClient, lat: float, lon: float, radius: int) -> list:
    key = (round(lat, 3), round(lon, 3), radius)
    cached = _cache.get(key)
    if cached and time.time() - cached[0] < CACHE_SECONDS:
        return cached[1]

    query = overpass_query(lat, lon, radius)

    for attempt in range(ROUNDS):
        for url in OVERPASS_URLS:
            try:
                res = await client.post(
                    url,
                    data={"data": query},
                    headers={"User-Agent": USER_AGENT},
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

            remark = str(data.get("remark", ""))
            if not data.get("elements") and "error" in remark.lower():
                logger.warning("Overpass %s remark: %s", url, remark[:200])
                continue

            elements = data.get("elements", [])
            _cache[key] = (time.time(), elements)
            return elements

        if attempt < ROUNDS - 1:
            await asyncio.sleep(2)

    raise HTTPException(
        status_code=502,
        detail="Hotel data service abhi busy hai, thori der baad try karo",
    )


async def fetch_stock_photos(client: httpx.AsyncClient, kind: str) -> list:
    api_key = os.getenv("PEXELS_API_KEY", "").strip()
    if not api_key:
        return []

    cached = _photo_cache.get(kind)
    if cached and time.time() - cached[0] < PHOTO_CACHE_SECONDS:
        return cached[1]

    query = PHOTO_QUERIES.get(kind, "hotel room interior")
    try:
        res = await client.get(
            PEXELS_URL,
            params={"query": query, "per_page": 15, "orientation": "landscape"},
            headers={"Authorization": api_key, "User-Agent": USER_AGENT},
        )
        if res.status_code != 200:
            logger.warning("Pexels status %s", res.status_code)
            return []
        photos = [
            {"url": p["src"]["medium"]}
            for p in res.json().get("photos", [])
            if p.get("src", {}).get("medium")
        ]
    except (httpx.HTTPError, ValueError, KeyError) as err:
        logger.warning("Pexels failed: %s", repr(err))
        return []

    _photo_cache[kind] = (time.time(), photos)
    return photos


def pick_photo(photos: list, hotel_id: str):
    if not photos:
        return None
    index = int(hashlib.md5(hotel_id.encode()).hexdigest(), 16) % len(photos)
    return photos[index]


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
        async with httpx.AsyncClient(timeout=35) as client:
            place = await geocode(client, q.strip())
            elements = await fetch_elements(client, place["lat"], place["lon"], radius)
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

        own_image = valid_image(tags.get("image"))
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
                "amenities": parse_amenities(tags),
                "image": own_image,
                "imageSource": "osm" if own_image else "",
                "bookingUrl": booking_link(name, place["name"], checkIn, checkOut, guests),
                "mapsUrl": maps_link(name, place["name"]),
            }
        )

    hotels.sort(key=lambda h: h["distanceKm"])
    hotels = hotels[:MAX_RESULTS]

    # Jin hotels ki apni photo nahi, unke liye Pexels stock photo (agar key ho)
    kinds = list({h["type"] for h in hotels if not h["image"]})
    if kinds and os.getenv("PEXELS_API_KEY", "").strip():
        try:
            async with httpx.AsyncClient(timeout=10) as photo_client:
                lists = await asyncio.gather(
                    *[fetch_stock_photos(photo_client, k) for k in kinds]
                )
            photos_by_kind = dict(zip(kinds, lists))
            for hotel in hotels:
                if hotel["image"]:
                    continue
                photo = pick_photo(photos_by_kind.get(hotel["type"], []), hotel["id"])
                if photo:
                    hotel["image"] = photo["url"]
                    hotel["imageSource"] = "stock"
        except Exception as err:
            logger.warning("Photo step failed: %s", repr(err))

    return {
        "destination": place,
        "checkIn": str(checkIn),
        "checkOut": str(checkOut),
        "guests": guests,
        "count": len(hotels),
        "hotels": hotels,
    }