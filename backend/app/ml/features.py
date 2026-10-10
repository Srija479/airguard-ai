from collections.abc import Mapping, Sequence
from datetime import datetime
from math import isfinite
from typing import Any

import pandas as pd

from ..services.aqi import calculate_aqi_for_hour

HORIZONS = (1, 3, 6, 12, 18, 24, 36, 48)
LAGS = (0, 1, 2, 3, 6, 12, 24)
FEATURE_COLUMNS = tuple(f"aqi_lag_{lag}" for lag in LAGS) + (
    "rolling_mean_24h",
    "target_hour",
    "target_day_of_week",
    "horizon",
)


def build_hourly_aqi_series(
    hourly: Mapping[str, Sequence[float | int | None]],
) -> list[float | None]:
    times = hourly.get("time", ())
    series = []
    for index in range(len(times)):
        value = calculate_aqi_for_hour(hourly, index)["aqi"]
        series.append(float(value) if isinstance(value, (int, float)) else None)
    return series


def _feature_values(
    aqi_series: Sequence[float | None],
    times: Sequence[str],
    origin_index: int,
    horizon: int,
) -> dict[str, float] | None:
    target_index = origin_index + horizon
    if origin_index < 23 or target_index >= len(times):
        return None

    values: dict[str, float] = {}
    for lag in LAGS:
        value = aqi_series[origin_index - lag]
        if value is None or not isfinite(value):
            return None
        values[f"aqi_lag_{lag}"] = value

    rolling_values = aqi_series[origin_index - 23 : origin_index + 1]
    if len(rolling_values) != 24 or any(value is None for value in rolling_values):
        return None
    try:
        target_time = datetime.fromisoformat(times[target_index])
    except (TypeError, ValueError):
        return None

    values.update(
        {
            "rolling_mean_24h": sum(rolling_values) / 24,
            "target_hour": float(target_time.hour),
            "target_day_of_week": float(target_time.weekday()),
            "horizon": float(horizon),
        }
    )
    return values


def build_feature_rows(
    hourly: Mapping[str, Sequence[float | int | None]],
    horizons: Sequence[int] = HORIZONS,
) -> pd.DataFrame:
    times = hourly.get("time", ())
    aqi_series = build_hourly_aqi_series(hourly)
    rows: list[dict[str, Any]] = []
    for origin_index in range(len(times)):
        for horizon in horizons:
            target_index = origin_index + horizon
            if target_index >= len(times):
                continue
            features = _feature_values(aqi_series, times, origin_index, horizon)
            target = aqi_series[target_index]
            if features is None or target is None:
                continue
            rows.append(
                {
                    **features,
                    "origin_time": times[origin_index],
                    "target_time": times[target_index],
                    "target": target,
                }
            )
    return pd.DataFrame(rows, columns=(*FEATURE_COLUMNS, "origin_time", "target_time", "target"))


def build_prediction_features(
    hourly: Mapping[str, Sequence[float | int | None]],
    horizons: Sequence[int] = range(1, 49),
) -> pd.DataFrame:
    times = hourly.get("time", ())
    aqi_series = build_hourly_aqi_series(hourly)
    origin_index = len(times) - 1
    rows = []
    for horizon in horizons:
        target_index = origin_index + horizon
        try:
            target_time = datetime.fromisoformat(times[origin_index])
        except (IndexError, TypeError, ValueError):
            break
        values = _feature_values_for_prediction(aqi_series, target_time, origin_index, horizon)
        if values is not None:
            rows.append(values)
    return pd.DataFrame(rows, columns=FEATURE_COLUMNS)


def _feature_values_for_prediction(
    aqi_series: Sequence[float | None],
    origin_time: datetime,
    origin_index: int,
    horizon: int,
) -> dict[str, float] | None:
    if origin_index < 23:
        return None
    values = {}
    for lag in LAGS:
        value = aqi_series[origin_index - lag]
        if value is None or not isfinite(value):
            return None
        values[f"aqi_lag_{lag}"] = value
    rolling_values = aqi_series[origin_index - 23 : origin_index + 1]
    if len(rolling_values) != 24 or any(value is None for value in rolling_values):
        return None
    target_time = origin_time + pd.Timedelta(hours=horizon)
    values.update(
        {
            "rolling_mean_24h": sum(rolling_values) / 24,
            "target_hour": float(target_time.hour),
            "target_day_of_week": float(target_time.weekday()),
            "horizon": float(horizon),
        }
    )
    return values