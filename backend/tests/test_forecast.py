from copy import deepcopy
from datetime import datetime, timedelta

import numpy as np
from fastapi.testclient import TestClient

from app import api_forecast
from app.ml.features import FEATURE_COLUMNS, build_feature_rows
from app.ml.train import calculate_metrics
from app.main import app


def _hourly_data(count: int = 100):
    start = datetime(2026, 1, 1)
    return {
        "time": [(start + timedelta(hours=index)).isoformat() for index in range(count)],
        "pm2_5": [10.0] * count,
    }


def test_feature_rows_do_not_use_pollutants_after_their_origin_time():
    original = _hourly_data()
    changed_future = deepcopy(original)
    origin_index = 50
    changed_future["pm2_5"][origin_index + 1 :] = [500.0] * (len(original["time"]) - origin_index - 1)

    original_rows = build_feature_rows(original, horizons=(1,))
    changed_rows = build_feature_rows(changed_future, horizons=(1,))
    origin_time = original["time"][origin_index]
    original_row = original_rows[original_rows["origin_time"] == origin_time].iloc[0]
    changed_row = changed_rows[changed_rows["origin_time"] == origin_time].iloc[0]

    assert original_row[list(FEATURE_COLUMNS)].to_dict() == changed_row[list(FEATURE_COLUMNS)].to_dict()
    assert original_row["target"] != changed_row["target"]


def test_metric_calculation_returns_mae_and_rmse():
    metrics = calculate_metrics(np.array([0.0, 3.0, 4.0]), np.array([0.0, 0.0, 0.0]))

    assert metrics["mae"] == 7 / 3
    assert np.isclose(metrics["rmse"], np.sqrt(25 / 3))


def test_forecast_status_tracks_training_and_ready_states(monkeypatch, tmp_path):
    async def fake_history(*_args, **_kwargs):
        return {"hourly": {"time": ["2026-01-01T00:00"] * (14 * 24)}}

    monkeypatch.setattr(api_forecast, "MODEL_DIR", tmp_path)
    monkeypatch.setattr(api_forecast, "get_history", fake_history)
    key = api_forecast._model_key(17.38, 78.48)
    client = TestClient(app)
    try:
        assert client.get("/api/forecast/status?lat=17.38&lon=78.48").json() == {"status": "not_ready"}
        with api_forecast._training_lock:
            api_forecast._training.add(key)
        assert client.get("/api/forecast/status?lat=17.38&lon=78.48").json() == {"status": "training"}
        with api_forecast._training_lock:
            api_forecast._training.discard(key)
        api_forecast._model_path(17.38, 78.48).touch()
        assert client.get("/api/forecast/status?lat=17.38&lon=78.48").json() == {"status": "ready"}
    finally:
        client.close()
        with api_forecast._training_lock:
            api_forecast._training.discard(key)


def test_forecast_returns_not_ready_with_less_than_fourteen_days(monkeypatch):
    async def fake_history(*_args, **_kwargs):
        return {"hourly": {"time": ["2026-01-01T00:00"] * 100}}

    monkeypatch.setattr(api_forecast, "get_history", fake_history)
    with TestClient(app) as client:
        response = client.get("/api/forecast?lat=17.38&lon=78.48")

    assert response.status_code == 200
    assert response.json() == {"status": "not_ready"}