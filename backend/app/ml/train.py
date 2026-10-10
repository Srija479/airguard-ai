from pathlib import Path
from typing import Any

import joblib
import numpy as np
from sklearn.ensemble import RandomForestRegressor

from .features import FEATURE_COLUMNS, build_feature_rows

HORIZON_BUCKETS = {
    "up_to_6h": (1, 6),
    "7_to_24h": (7, 24),
    "25_to_48h": (25, 48),
}


def calculate_metrics(actual: np.ndarray, predicted: np.ndarray) -> dict[str, float]:
    errors = np.asarray(predicted, dtype=float) - np.asarray(actual, dtype=float)
    return {
        "mae": float(np.mean(np.abs(errors))),
        "rmse": float(np.sqrt(np.mean(np.square(errors)))),
    }


def _baseline_predictions(rows, name: str) -> np.ndarray:
    feature = "aqi_lag_0" if name == "persistence" else "aqi_lag_24"
    return rows[feature].to_numpy(dtype=float)


def train_and_save(hourly: dict[str, Any], model_path: Path) -> dict[str, Any] | None:
    rows = build_feature_rows(hourly)
    if rows.empty:
        return None

    ordered_times = sorted(rows["target_time"].unique())
    if len(ordered_times) < 20:
        return None
    train_end = max(1, int(len(ordered_times) * 0.70))
    validation_end = max(train_end + 1, int(len(ordered_times) * 0.85))
    validation_end = min(validation_end, len(ordered_times) - 1)
    train_times = set(ordered_times[:train_end])
    validation_times = set(ordered_times[train_end:validation_end])
    test_times = set(ordered_times[validation_end:])
    train_rows = rows[rows["target_time"].isin(train_times)]
    validation_rows = rows[rows["target_time"].isin(validation_times)]
    test_rows = rows[rows["target_time"].isin(test_times)]
    if train_rows.empty or validation_rows.empty or test_rows.empty:
        return None

    model = RandomForestRegressor(
        n_estimators=150,
        max_depth=12,
        n_jobs=1,
        random_state=42,
    )
    model.fit(train_rows[list(FEATURE_COLUMNS)], train_rows["target"])
    validation_actual = validation_rows["target"].to_numpy(dtype=float)
    validation_predictions = {
        "model": model.predict(validation_rows[list(FEATURE_COLUMNS)]),
        "persistence": _baseline_predictions(validation_rows, "persistence"),
        "same_hour_yesterday": _baseline_predictions(validation_rows, "same_hour_yesterday"),
    }
    selected_model = min(
        validation_predictions,
        key=lambda name: calculate_metrics(validation_actual, validation_predictions[name])["mae"],
    )

    test_actual = test_rows["target"].to_numpy(dtype=float)
    test_predictions = {
        "model": model.predict(test_rows[list(FEATURE_COLUMNS)]),
        "persistence": _baseline_predictions(test_rows, "persistence"),
        "same_hour_yesterday": _baseline_predictions(test_rows, "same_hour_yesterday"),
    }
    test_metrics = {
        name: calculate_metrics(test_actual, prediction)
        for name, prediction in test_predictions.items()
    }
    mae_by_horizon = {}
    for bucket, (minimum, maximum) in HORIZON_BUCKETS.items():
        bucket_rows = test_rows[test_rows["horizon"].between(minimum, maximum)]
        if bucket_rows.empty:
            mae_by_horizon[bucket] = None
            continue
        bucket_actual = bucket_rows["target"].to_numpy(dtype=float)
        bucket_predictions = model.predict(bucket_rows[list(FEATURE_COLUMNS)])
        mae_by_horizon[bucket] = calculate_metrics(bucket_actual, bucket_predictions)["mae"]

    baseline_mae = min(
        test_metrics["persistence"]["mae"],
        test_metrics["same_hour_yesterday"]["mae"],
    )
    metrics = {
        "test": test_metrics,
        "mae_by_horizon": mae_by_horizon,
        "test_start": min(test_rows["target_time"]),
        "test_end": max(test_rows["target_time"]),
        "test_rows": len(test_rows),
        "selected_model": selected_model,
        "beats_baseline": test_metrics["model"]["mae"] < baseline_mae,
    }
    artifact = {"model": model, "selected_model": selected_model, "metrics": metrics}
    model_path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = model_path.with_name(f".{model_path.name}.tmp")
    joblib.dump(artifact, temporary_path)
    temporary_path.replace(model_path)
    return artifact