import asyncio
import os
import time
from pathlib import Path

import httpx
from dotenv import dotenv_values
from fastapi import APIRouter, Depends, HTTPException, Query

from app.auth import get_current_user

router = APIRouter(prefix="/api/destinations", tags=["destinations"])

# backend/app/routers/destinations.py -> backend/.env
ENV_PATH = Path(__file__).resolve().parents[2] / ".env"

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


def get_secret(name: str) -> str:
    # .env har dafa file se padhi jati hai, isliye key badalne par restart nahi chahiye
    value = dotenv_values(ENV_PATH).get(name) or os.getenv(name) or ""
    return value.strip().strip('"').strip("'")


def cache_get(key: str):
    item = _cache.get(key)
    if item and time.time() - item[0] < CACHE_SECONDS:
        return item[1]
    return None


def cache_set(key: str, value) -> None:
    _cache[key] = (time.time(), value)


def normalize(text: str) -> str:
    return " ".join(text.lower().split())


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
                "gsrlimit": 5,
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
        ranked = sorted(pages.values(), key=lambda p: p.get("index", 99))
        wanted = normalize(name)
        for page in ranked:
            title = normalize(page.get("title") or "")
            # sirf wohi page jis ka title naam se bilkul milta ho
            if title == wanted or title.startswith(wanted + " ("):
                return {
                    "description": (page.get("extract") or "").strip(),
                    "photo": (page.get("thumbnail") or {}).get("source"),
                    "wiki_url": page.get("fullurl"),
                }
        return {}
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
    api_key = get_secret("PEXELS_API_KEY")
    if not api_key:
        return None
    try:
        res = await client.get(
            "https://api.pexels.com/v1/search",
            params={"query": query, "per_page": 1},
            headers={"Authorization": api_key},
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


def youtube_error_message(res: httpx.Response) -> str:
    try:
        err = res.json().get("error") or {}
    except ValueError:
        err = {}
    message = err.get("message", "")
    reasons = " ".join(e.get("reason", "") for e in err.get("errors", []))

    if "quota" in reasons.lower() or "quota" in message.lower():
        return "YouTube ki roz ki hadd khatam ho gayi, kal dobara try karein"
    if "API key not valid" in message:
        return "YouTube API key ghalat hai, nayi key dobara copy karke .env mein lagayein"
    if "has not been used" in message or "disabled" in message or "accessNotConfigured" in reasons:
        return "YouTube Data API v3 enable nahi hai, Google Cloud Library mein Enable karein"
    if "blocked" in message.lower() or "referer" in message.lower():
        return "Is key par restriction hai, API restrictions mein YouTube Data API v3 chunein"
    return f"YouTube ne {res.status_code} diya"


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
    api_key = get_secret("YOUTUBE_API_KEY")
    if not api_key:
        return {
            "videos": [],
            "message": "YOUTUBE_API_KEY backend/.env mein nahi mili. Naam, nayi line aur save check karein",
        }

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
                    "key": api_key,
                },
            )
    except httpx.HTTPError:
        return {"videos": [], "message": "YouTube se rabta nahi ho saka, internet check karein"}

    if res.status_code != 200:
        return {"videos": [], "message": youtube_error_message(res)}

    try:
        data = res.json()
    except ValueError:
        return {"videos": [], "message": "YouTube ka jawab samajh nahi aaya"}

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
    if videos:
        cache_set(key, result)
    return result