from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import APIRouter, Query

from .services.aqi import calculate_aqi_for_hour
from .services.open_meteo import POLLUTANTS, get_air_quality, search_places

router = APIRouter()


def _now_for_response(data: dict[str, Any]) -> datetime:
    now_utc = datetime.now(timezone.utc)
    offset = int(data.get("utc_offset_seconds", 0))
    return (now_utc + timedelta(seconds=offset)).replace(tzinfo=None)


def _latest_index(data: dict[str, Any]) -> int:
    times = data["hourly"]["time"]
    now_local = _now_for_response(data)
    latest = None
    for index, value in enumerate(times):
        try:
            observed = datetime.fromisoformat(value)
        except (TypeError, ValueError):
            continue
        if observed.tzinfo is not None:
            observed = observed.astimezone(timezone.utc).replace(tzinfo=None)
            comparison_time = datetime.now(timezone.utc).replace(tzinfo=None)
        else:
            comparison_time = now_local
        if observed <= comparison_time:
            latest = index
    if latest is None:
        raise ValueError("No current air quality sample is available")
    return latest


def _pollutants_at(hourly: dict[str, Any], index: int) -> dict[str, float | None]:
    values: dict[str, float | None] = {}
    for pollutant in POLLUTANTS:
        series = hourly.get(pollutant)
        value = series[index] if isinstance(series, list) and index < len(series) else None
        values[pollutant] = float(value) if isinstance(value, (int, float)) else None
    return values


def _aqi_point(data: dict[str, Any], index: int) -> dict[str, Any]:
    hourly = data["hourly"]
    pollutants = _pollutants_at(hourly, index)
    return {
        **calculate_aqi_for_hour(hourly, index),
        "pollutants": pollutants,
        "observed_at": hourly["time"][index],
    }


@router.get("/api/places/search")
async def places_search(
    q: str = Query(min_length=1, max_length=100),
    lang: str = Query(default="en", min_length=2, max_length=5),
) -> list[dict[str, Any]]:
    return await search_places(q, lang)


@router.get("/api/aqi/current")
async def current_aqi(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    data = await get_air_quality(lat, lon)
    try:
        point = _aqi_point(data, _latest_index(data))
    except (KeyError, ValueError) as exc:
        raise ValueError("Air quality service returned no usable current sample") from exc
    return {
        "aqi": point["aqi"],
        "category": point["category"],
        "main_pollutant": point["main_pollutant"],
        "pollutants": point["pollutants"],
        "observed_at": point["observed_at"],
        "source": "Open-Meteo (CAMS)",
        "is_modelled": True,
        "averaging": "CPCB averaging periods applied",
        "stale": data["stale"],
    }


@router.get("/api/aqi/history")
async def aqi_history(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
    hours: int = Query(default=24, ge=1, le=48),
) -> dict[str, Any]:
    data = await get_air_quality(lat, lon)
    try:
        latest = _latest_index(data)
        start = max(0, latest - hours + 1)
        points = [
            point
            for index in range(start, latest + 1)
            if (point := _aqi_point(data, index))["aqi"] is not None
        ]
    except (KeyError, ValueError) as exc:
        raise ValueError("Air quality service returned no usable history") from exc
    return {"points": points, "stale": data["stale"]}
