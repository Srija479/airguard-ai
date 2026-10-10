from datetime import datetime, timedelta
from typing import Any

import numpy as np

from .features import FEATURE_COLUMNS, build_prediction_features

_CATEGORY_LIMITS = (
    (50, "good"),
    (100, "satisfactory"),
    (200, "moderate"),
    (300, "poor"),
    (400, "veryPoor"),
    (500, "severe"),
)


def _category(aqi: int) -> str:
    return next(category for threshold, category in _CATEGORY_LIMITS if aqi <= threshold)


def predict_hourly(hourly: dict[str, Any], artifact: dict[str, Any]) -> list[dict[str, Any]]:
    features = build_prediction_features(hourly)
    if len(features) != 48:
        return []
    selected_model = artifact["selected_model"]
    if selected_model == "model":
        predicted = artifact["model"].predict(features[list(FEATURE_COLUMNS)])
    elif selected_model == "persistence":
        predicted = features["aqi_lag_0"].to_numpy(dtype=float)
    else:
        predicted = features["aqi_lag_24"].to_numpy(dtype=float)

    origin = datetime.fromisoformat(hourly["time"][-1])
    points = []
    for horizon, value in enumerate(np.asarray(predicted, dtype=float), start=1):
        aqi = max(0, min(500, round(float(value))))
        points.append(
            {
                "time": (origin + timedelta(hours=horizon)).isoformat(),
                "aqi": aqi,
                "category": _category(aqi),
            }
        )
    return points