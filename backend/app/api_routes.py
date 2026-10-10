import asyncio
from math import asin, cos, radians, sin, sqrt
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query

from .api_aqi import _latest_index
from .services.aqi import calculate_aqi_for_hour
from .services.open_meteo import get_air_quality

router = APIRouter()
OSRM_URL = "https://router.project-osrm.org/route/v1/driving"
SAMPLE_DISTANCE_METERS = 5000


def _distance_meters(start: tuple[float, float], end: tuple[float, float]) -> float:
    lat1, lon1 = map(radians, start)
    lat2, lon2 = map(radians, end)
    delta_lat = lat2 - lat1
    delta_lon = lon2 - lon1
    value = sin(delta_lat / 2) ** 2 + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    return 6_371_000 * 2 * asin(sqrt(value))


def _sample_coordinates(geometry: list[list[float]]) -> list[tuple[float, float]]:
    if not geometry:
        return []
    points = [(float(point[1]), float(point[0])) for point in geometry]
    samples = [points[0]]
    next_sample_distance = SAMPLE_DISTANCE_METERS
    traversed = 0.0
    for start, end in zip(points, points[1:]):
        segment_distance = _distance_meters(start, end)
        while traversed + segment_distance >= next_sample_distance:
            ratio = (next_sample_distance - traversed) / segment_distance
            samples.append(
                (
                    start[0] + (end[0] - start[0]) * ratio,
                    start[1] + (end[1] - start[1]) * ratio,
                )
            )
            next_sample_distance += SAMPLE_DISTANCE_METERS
        traversed += segment_distance
    if samples[-1] != points[-1]:
        samples.append(points[-1])
    return samples


async def _aqi_at(latitude: float, longitude: float) -> int | None:
    data = await get_air_quality(latitude, longitude)
    try:
        index = _latest_index(data)
        value = calculate_aqi_for_hour(data["hourly"], index)["aqi"]
    except (KeyError, ValueError, IndexError):
        return None
    return int(value) if isinstance(value, (int, float)) else None


def _exposure_level(average_aqi: float) -> str:
    if average_aqi <= 100:
        return "Low"
    if average_aqi <= 200:
        return "Medium"
    return "High"


@router.get("/api/routes")
async def route_options(
    from_lat: float = Query(ge=-90, le=90),
    from_lon: float = Query(ge=-180, le=180),
    to_lat: float = Query(ge=-90, le=90),
    to_lon: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    url = (
        f"{OSRM_URL}/{from_lon},{from_lat};{to_lon},{to_lat}"
        "?alternatives=true&overview=full&geometries=geojson"
    )
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            response = await client.get(url)
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        raise HTTPException(
            status_code=502,
            detail="The demo routing service is unavailable. Please try again later.",
        ) from exc

    if payload.get("code") != "Ok" or not isinstance(payload.get("routes"), list):
        raise HTTPException(
            status_code=502,
            detail="The demo routing service could not find a route between these places.",
        )

    routes = []
    sample_limit = asyncio.Semaphore(5)

    async def lookup_sample(latitude: float, longitude: float) -> int | None:
        async with sample_limit:
            return await _aqi_at(latitude, longitude)

    for index, route in enumerate(payload["routes"][:3]):
        geometry = route.get("geometry", {}).get("coordinates", [])
        samples = _sample_coordinates(geometry)
        values = await asyncio.gather(
            *(lookup_sample(latitude, longitude) for latitude, longitude in samples),
            return_exceptions=True,
        )
        aqi_values = [value for value in values if isinstance(value, int)]
        average_aqi = sum(aqi_values) / len(aqi_values) if aqi_values else None
        duration_seconds = float(route.get("duration", 0))
        distance_meters = float(route.get("distance", 0))
        duration_hours = duration_seconds / 3600
        routes.append(
            {
                "id": index,
                "coordinates": [[latitude, longitude] for latitude, longitude in samples],
                "geometry": [[float(point[1]), float(point[0])] for point in geometry],
                "duration_seconds": duration_seconds,
                "distance_meters": distance_meters,
                "average_aqi": round(average_aqi, 1) if average_aqi is not None else None,
                "exposure_score": round(average_aqi * duration_hours, 1) if average_aqi is not None else None,
                "exposure_level": _exposure_level(average_aqi) if average_aqi is not None else "Unavailable",
                "sample_count": len(aqi_values),
                "lowest_exposure": False,
            }
        )

    available = [route for route in routes if route["exposure_score"] is not None]
    best = min(available, key=lambda route: route["exposure_score"]) if available else None
    if best is not None:
        best["lowest_exposure"] = True
    return {
        "routes": routes,
        "lowest_exposure_route_id": best["id"] if best else None,
        "duration_note": "Typical duration estimate; traffic is not live.",
    }