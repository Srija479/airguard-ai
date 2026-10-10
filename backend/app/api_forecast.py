from pathlib import Path
import threading
from typing import Any

import joblib
from fastapi import APIRouter, Query

from .api_aqi import _latest_index
from .ml.predict import predict_hourly
from .ml.train import train_and_save
from .services.aqi import calculate_aqi_for_hour
from .services.open_meteo import get_air_quality, get_history

router = APIRouter()
MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
_training: set[str] = set()
_training_lock = threading.Lock()


def _model_key(lat: float, lon: float) -> str:
    return f"{lat:.2f}_{lon:.2f}"


def _model_path(lat: float, lon: float) -> Path:
    return MODEL_DIR / f"{_model_key(lat, lon)}.joblib"


def _load_artifact(lat: float, lon: float) -> dict[str, Any] | None:
    path = _model_path(lat, lon)
    return joblib.load(path) if path.is_file() else None


def _start_training(lat: float, lon: float, hourly: dict[str, Any]) -> None:
    key = _model_key(lat, lon)
    with _training_lock:
        if key in _training or _model_path(lat, lon).is_file():
            return
        _training.add(key)

    def train_in_background() -> None:
        try:
            train_and_save(hourly, _model_path(lat, lon))
        finally:
            with _training_lock:
                _training.discard(key)

    threading.Thread(target=train_in_background, daemon=True).start()


def _observed_history(data: dict[str, Any]) -> tuple[dict[str, Any], int]:
    hourly = data["hourly"]
    latest = _latest_index(data)
    observed = {
        key: values[: latest + 1] if isinstance(values, list) else values
        for key, values in hourly.items()
    }
    return observed, latest


def _history_points(hourly: dict[str, Any]) -> list[dict[str, Any]]:
    times = hourly.get("time", [])
    start = max(0, len(times) - 24)
    return [
        {"time": times[index], "aqi": point["aqi"], "category": point["category"]}
        for index in range(start, len(times))
        if (point := calculate_aqi_for_hour(hourly, index))["aqi"] is not None
    ]


def _atmospheric_forecast(data: dict[str, Any]) -> list[dict[str, Any]]:
    hourly = data["hourly"]
    latest = _latest_index(data)
    end = min(len(hourly.get("time", [])), latest + 49)
    points = []
    for index in range(latest + 1, end):
        point = calculate_aqi_for_hour(hourly, index)
        if point["aqi"] is not None:
            points.append(
                {
                    "time": hourly["time"][index],
                    "aqi": point["aqi"],
                    "category": point["category"],
                }
            )
    return points


def _two_hour_windows(points: list[dict[str, Any]]) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    windows = [
        {
            "start": points[index]["time"],
            "end": points[index + 1]["time"],
            "average_aqi": round((points[index]["aqi"] + points[index + 1]["aqi"]) / 2),
        }
        for index in range(len(points) - 1)
    ]
    if not windows:
        return None, None
    return min(windows, key=lambda window: window["average_aqi"]), max(
        windows, key=lambda window: window["average_aqi"]
    )


@router.get("/api/forecast/status")
async def forecast_status(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
) -> dict[str, str]:
    history = await get_history(lat, lon, days=60)
    if len(history.get("hourly", {}).get("time", [])) < 14 * 24:
        return {"status": "not_ready"}
    if _model_path(lat, lon).is_file():
        return {"status": "ready"}
    with _training_lock:
        if _model_key(lat, lon) in _training:
            return {"status": "training"}
    return {"status": "not_ready"}


@router.get("/api/forecast")
async def forecast(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    history = await get_history(lat, lon, days=60)
    observed, _ = _observed_history(history)
    if len(observed.get("time", [])) < 14 * 24:
        return {"status": "not_ready"}

    artifact = _load_artifact(lat, lon)
    if artifact is None:
        _start_training(lat, lon, observed)
        with _training_lock:
            status = "training" if _model_key(lat, lon) in _training else "not_ready"
        return {"status": status}

    ai_points = predict_hourly(observed, artifact)
    if not ai_points:
        return {"status": "not_ready"}
    atmospheric_data = await get_air_quality(lat, lon)
    atmospheric_points = _atmospheric_forecast(atmospheric_data)
    best_window, worst_window = _two_hour_windows(ai_points)
    return {
        "status": "ready",
        "ai": ai_points,
        "atmospheric": atmospheric_points,
        "observed": _history_points(observed),
        "best_window": best_window,
        "worst_window": worst_window,
        "metrics": artifact["metrics"],
    }


@router.get("/api/forecast/evaluation")
async def forecast_evaluation(
    lat: float = Query(ge=-90, le=90),
    lon: float = Query(ge=-180, le=180),
) -> dict[str, Any]:
    artifact = _load_artifact(lat, lon)
    if artifact is None:
        return {"status": "not_ready"}
    metrics = artifact["metrics"]
    return {
        "status": "ready",
        "model": metrics["test"]["model"],
        "persistence": metrics["test"]["persistence"],
        "same_hour_yesterday": metrics["test"]["same_hour_yesterday"],
        "mae_by_horizon": metrics["mae_by_horizon"],
        "test_start": metrics["test_start"],
        "test_end": metrics["test_end"],
        "test_rows": metrics["test_rows"],
        "selected_model": metrics["selected_model"],
        "beats_baseline": metrics["beats_baseline"],
    }