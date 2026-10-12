import asyncio
import os
import time

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user

load_dotenv()

router = APIRouter(prefix="/api/destinations", tags=["destinations"])

PEXELS_API_KEY = os.getenv("PEXELS_API_KEY")
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY")

HEADERS = {"User-Agent": "TravelMateAI/1.0 (student portfolio project)"}
TIMEOUT = httpx.Timeout(10.0)

CATEGORY_QUERIES = {
    "all": "{q}",
    "attractions": "tourist attractions in {q}",
    "museums": "museums in {q}",
    "parks": "parks in {q}",
    "beaches": "beaches in {q}",
    "historic": "historic sites in {q}",
    "food": "restaurants in {q}",
}

CACHE_SECONDS = 600
_cache: dict = {}


def cache_get(key: str):
    item = _cache.get(key)
    if item and time.time() - item[0] < CACHE_SECONDS:
        return item[1]
    return None


def cache_set(key: str, value) -> None:
    _cache[key] = (time.time(), value)


async def nominatim_search(client: httpx.AsyncClient, term: str, limit: int = 8):
    res = await client.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": term,
            "format": "jsonv2",
            "limit": limit,
            "addressdetails": 1,
            "accept-language": "en",
        },
    )
    res.raise_for_status()
    return res.json()


async def wiki_lookup(client: httpx.AsyncClient, term: str, name: str) -> dict:
    try:
        res = await client.get(
            "https://en.wikipedia.org/w/api.php",
            params={
                "action": "query",
                "generator": "search",
                "gsrsearch": term,
                "gsrlimit": 1,
                "prop": "extracts|pageimages|info",
                "exintro": 1,
                "explaintext": 1,
                "exsentences": 3,
                "pithumbsize": 640,
                "inprop": "url",
                "format": "json",
            },
        )
        res.raise_for_status()
        pages = (res.json().get("query") or {}).get("pages") or {}
        page = next(iter(pages.values()), None)
        if not page:
            return {}
        title = (page.get("title") or "").lower()
        wanted = name.lower()
        if wanted not in title and title not in wanted:
            return {}
        return {
            "description": (page.get("extract") or "").strip(),
            "photo": (page.get("thumbnail") or {}).get("source"),
            "wiki_url": page.get("fullurl"),
        }
    except (httpx.HTTPError, ValueError):
        return {}


async def wiki_info(client: httpx.AsyncClient, name: str, hint: str) -> dict:
    # English Wikipedia Urdu/Arabic naam nahi samajhta
    if not name or not name.isascii():
        return {}
    terms = [name]
    if hint and hint.isascii():
        terms.insert(0, f"{name} {hint}")
    for term in terms:
        info = await wiki_lookup(client, term, name)
        if info:
            return info
    return {}


async def pexels_photo(client: httpx.AsyncClient, query: str):
    if not PEXELS_API_KEY:
        return None
    try:
        res = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": 1},
            headers={"Authorization": PEXELS_API_KEY},
        )
        res.raise_for_status()
        photos = res.json().get("photos") or []
        return photos[0]["src"]["large"] if photos else None
    except (httpx.HTTPError, ValueError, KeyError, IndexError):
        return None


async def build_item(client: httpx.AsyncClient, raw: dict) -> dict:
    addr = raw.get("address") or {}
    name = raw.get("name") or (raw.get("display_name") or "").split(",")[0]
    place = (
        addr.get("city")
        or addr.get("town")
        or addr.get("state")
        or addr.get("country")
        or ""
    )
    info = await wiki_info(client, name, place)
    photo = info.get("photo") or await pexels_photo(client, f"{name} {place}".strip())
    return {
        "id": str(raw.get("place_id")),
        "name": name,
        "display_name": raw.get("display_name", ""),
        "category": raw.get("category", ""),
        "type": raw.get("type", ""),
        "lat": float(raw["lat"]),
        "lon": float(raw["lon"]),
        "description": info.get("description", ""),
        "photo_url": photo,
        "wiki_url": info.get("wiki_url"),
    }


@router.get("/search")
async def search_destinations(
    q: str = Query(min_length=2, max_length=80),
    category: str = "all",
    user: dict = Depends(get_current_user),
):
    template = CATEGORY_QUERIES.get(category, CATEGORY_QUERIES["all"])
    term = template.format(q=q.strip())
    key = f"search:{term.lower()}"

    cached = cache_get(key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            raws = await nominatim_search(client, term)
            items = await asyncio.gather(*(build_item(client, r) for r in raws))
    except httpx.HTTPError:
        raise HTTPException(
            status_code=502,
            detail="Place search service abhi available nahi, thori der baad try karein",
        )

    result = {
        "query": q,
        "category": category,
        "count": len(items),
        "results": list(items),
    }
    cache_set(key, result)
    return result


@router.get("/videos")
async def destination_videos(
    q: str = Query(min_length=2, max_length=80),
    user: dict = Depends(get_current_user),
):
    if not YOUTUBE_API_KEY:
        return {"videos": [], "message": "YouTube key set nahi hai"}

    key = f"videos:{q.lower()}"
    cached = cache_get(key)
    if cached is not None:
        return cached

    try:
        async with httpx.AsyncClient(timeout=TIMEOUT, headers=HEADERS) as client:
            res = await client.get(
                "https://www.googleapis.com/youtube/v3/search",
                params={
                    "part": "snippet",
                    "q": f"{q} travel guide",
                    "type": "video",
                    "maxResults": 6,
                    "safeSearch": "moderate",
                    "key": YOUTUBE_API_KEY,
                },
            )
            res.raise_for_status()
            data = res.json()
    except (httpx.HTTPError, ValueError):
        return {"videos": [], "message": "YouTube se videos nahi mil sake"}

    videos = []
    for item in data.get("items", []):
        vid = (item.get("id") or {}).get("videoId")
        snip = item.get("snippet") or {}
        if not vid:
            continue
        thumbs = snip.get("thumbnails") or {}
        thumb = (thumbs.get("medium") or thumbs.get("default") or {}).get("url")
        videos.append(
            {
                "id": vid,
                "title": snip.get("title", ""),
                "channel": snip.get("channelTitle", ""),
                "thumbnail": thumb,
                "url": f"https://www.youtube.com/watch?v={vid}",
            }
        )

    result = {"videos": videos, "message": "" if videos else "Koi video nahi mili"}
    cache_set(key, result)
    return result