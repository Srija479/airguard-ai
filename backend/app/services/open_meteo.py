from time import monotonic
from typing import Any

import httpx
from fastapi import HTTPException

AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"
GEOCODING_URL = "https://geocoding-api.open-meteo.com/v1/search"
POLLUTANTS = (
    "pm2_5",
    "pm10",
    "nitrogen_dioxide",
    "ozone",
    "sulphur_dioxide",
    "carbon_monoxide",
)
_CACHE_TTL_SECONDS = 15 * 60
_HISTORY_CACHE_TTL_SECONDS = 6 * 60 * 60
_air_quality_cache: dict[tuple[float, float], tuple[float, dict[str, Any]]] = {}
_history_cache: dict[tuple[float, float, int], tuple[float, dict[str, Any]]] = {}


def _cache_key(lat: float, lon: float) -> tuple[float, float]:
    return round(lat, 2), round(lon, 2)


async def get_air_quality(lat: float, lon: float) -> dict[str, Any]:
    key = _cache_key(lat, lon)
    cached = _air_quality_cache.get(key)
    if cached is not None and monotonic() - cached[0] < _CACHE_TTL_SECONDS:
        return {**cached[1], "stale": False}

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(POLLUTANTS),
        "past_days": 2,
        "forecast_days": 3,
        "timezone": "auto",
    }

    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(AIR_QUALITY_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise ValueError("Open-Meteo returned an invalid hourly response")
        result = {
            "hourly": hourly,
            "utc_offset_seconds": payload.get("utc_offset_seconds", 0),
        }
    except (httpx.HTTPError, ValueError) as exc:
        if cached is not None:
            return {**cached[1], "stale": True}
        raise HTTPException(
            status_code=502,
            detail="Air quality data is currently unavailable",
        ) from exc

    _air_quality_cache[key] = (monotonic(), result)
    return {**result, "stale": False}


async def get_history(lat: float, lon: float, days: int = 60) -> dict[str, Any]:
    if not 1 <= days <= 60:
        raise ValueError("History days must be between 1 and 60")
    key = (*_cache_key(lat, lon), days)
    cached = _history_cache.get(key)
    if cached is not None and monotonic() - cached[0] < _HISTORY_CACHE_TTL_SECONDS:
        return {**cached[1], "stale": False}

    params = {
        "latitude": lat,
        "longitude": lon,
        "hourly": ",".join(POLLUTANTS),
        "past_days": days,
        "forecast_days": 0,
        "timezone": "auto",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(AIR_QUALITY_URL, params=params)
            response.raise_for_status()
            payload = response.json()
        hourly = payload.get("hourly")
        if not isinstance(hourly, dict) or not isinstance(hourly.get("time"), list):
            raise ValueError("Open-Meteo returned an invalid hourly history")
        result = {
            "hourly": hourly,
            "utc_offset_seconds": payload.get("utc_offset_seconds", 0),
        }
    except (httpx.HTTPError, ValueError) as exc:
        if cached is not None:
            return {**cached[1], "stale": True}
        raise HTTPException(
            status_code=502,
            detail="Air quality history is currently unavailable",
        ) from exc

    _history_cache[key] = (monotonic(), result)
    return {**result, "stale": False}


async def search_places(query: str, language: str) -> list[dict[str, Any]]:
    params = {
        "name": query,
        "count": 10,
        "language": language,
        "countryCode": "IN",
        "format": "json",
    }
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(GEOCODING_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="Place search is currently unavailable",
        ) from exc

    return [
        {
            "name": place["name"],
            "state": place.get("admin1"),
            "latitude": place["latitude"],
            "longitude": place["longitude"],
        }
        for place in payload.get("results", [])
        if place.get("country_code") == "IN"
        and all(key in place for key in ("name", "latitude", "longitude"))
    ]
