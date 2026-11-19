"""Geocodificação (OpenStreetMap/Nominatim) e rotas (OSRM) — sem chave de API."""
import math
from typing import Optional

import requests
from starlette.concurrency import run_in_threadpool

BELMONTE_CENTER = {"lat": -15.8582, "lng": -39.0769}
UA = "BelmonteMobi/1.0 (suporte belmontemobi)"
GEO_TIMEOUT = 8


def haversine_km(a: dict, b: dict) -> float:
    lat1, lng1 = a.get("lat"), a.get("lng")
    lat2, lng2 = b.get("lat"), b.get("lng")
    if None in (lat1, lng1, lat2, lng2):
        return 0.0
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def _osrm_sync(origin: dict, dest: dict) -> tuple[float, float, list]:
    url = (
        f"https://router.project-osrm.org/route/v1/driving/"
        f"{origin['lng']},{origin['lat']};{dest['lng']},{dest['lat']}"
    )
    r = requests.get(url, params={"overview": "full", "geometries": "geojson"}, timeout=GEO_TIMEOUT, headers={"User-Agent": UA})
    r.raise_for_status()
    route = r.json()["routes"][0]
    coords = [[round(c[1], 6), round(c[0], 6)] for c in route["geometry"]["coordinates"]]
    return route["distance"] / 1000.0, route["duration"] / 60.0, coords


async def route_between(origin: dict, dest: dict) -> dict:
    """Distância/duração reais via OSRM com fallback haversine (fator 1.3)."""
    if not (origin.get("lat") and origin.get("lng") and dest.get("lat") and dest.get("lng")):
        return {"distance_km": 0.0, "duration_min": 0.0, "geometry": []}
    try:
        km, mins, geo = await run_in_threadpool(_osrm_sync, origin, dest)
        return {"distance_km": round(km, 2), "duration_min": round(mins, 1), "geometry": geo}
    except Exception:
        km = haversine_km(origin, dest) * 1.3
        return {"distance_km": round(km, 2), "duration_min": round(km / 28 * 60, 1), "geometry": []}


def _nominatim_search_sync(q: str) -> list:
    r = requests.get(
        "https://nominatim.openstreetmap.org/search",
        params={
            "q": q,
            "format": "json",
            "limit": 6,
            "countrycodes": "br",
            "viewbox": "-40.6,-15.0,-38.0,-16.8",
        },
        headers={"User-Agent": UA},
        timeout=GEO_TIMEOUT,
    )
    r.raise_for_status()
    out = []
    for item in r.json():
        out.append(
            {
                "label": item.get("display_name", ""),
                "lat": float(item["lat"]),
                "lng": float(item["lon"]),
            }
        )
    return out


def _nominatim_reverse_sync(lat: float, lng: float) -> str:
    r = requests.get(
        "https://nominatim.openstreetmap.org/reverse",
        params={"lat": lat, "lon": lng, "format": "json"},
        headers={"User-Agent": UA},
        timeout=GEO_TIMEOUT,
    )
    r.raise_for_status()
    return r.json().get("display_name", "")


async def geocode(db, q: str) -> list:
    key = q.strip().lower()
    cached = await db.geocache.find_one({"key": key})
    if cached and cached.get("results"):
        return cached["results"]
    try:
        results = await run_in_threadpool(_nominatim_search_sync, q)
    except Exception:
        results = []
    if results:
        await db.geocache.update_one(
            {"key": key},
            {"$set": {"key": key, "results": results, "created_at": __import__("models").now()}},
            upsert=True,
        )
    return results


async def reverse_geocode(lat: float, lng: float) -> str:
    try:
        return await run_in_threadpool(_nominatim_reverse_sync, lat, lng)
    except Exception:
        return "Localização atual"
