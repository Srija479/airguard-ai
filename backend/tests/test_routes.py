from collections.abc import Generator

import httpx
import pytest
from fastapi.testclient import TestClient

from app import api_routes
from app.main import app


def test_route_samples_are_spaced_about_five_kilometres():
    samples = api_routes._sample_coordinates([[0, 0], [0.1, 0]])

    assert len(samples) == 4
    distances = [
        api_routes._distance_meters(start, end)
        for start, end in zip(samples, samples[1:])
    ]
    assert all(distance <= api_routes.SAMPLE_DISTANCE_METERS for distance in distances)


def test_route_api_returns_exposure_metrics_and_osrm_order(monkeypatch):
    captured_url = ""

    class FakeResponse:
        def raise_for_status(self):
            return None

        def json(self):
            return {
                "code": "Ok",
                "routes": [{
                    "duration": 3600,
                    "distance": 12_000,
                    "geometry": {"coordinates": [[78.0, 17.0], [78.1, 17.0]]},
                }],
            }

    class FakeClient:
        def __init__(self, timeout):
            assert timeout == 10

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, url):
            nonlocal captured_url
            captured_url = url
            return FakeResponse()

    async def fake_aqi(*_args):
        return 80

    monkeypatch.setattr(api_routes.httpx, "AsyncClient", FakeClient)
    monkeypatch.setattr(api_routes, "_aqi_at", fake_aqi)
    with TestClient(app) as client:
        response = client.get(
            "/api/routes?from_lat=17&from_lon=78&to_lat=17&to_lon=78.1"
        )

    assert response.status_code == 200
    assert "/78.0,17.0;78.1,17.0?alternatives=true" in captured_url
    route = response.json()["routes"][0]
    assert route["average_aqi"] == 80
    assert route["exposure_score"] == 80
    assert route["exposure_level"] == "Low"
    assert route["lowest_exposure"] is True


def test_route_api_describes_demo_service_failure(monkeypatch):
    class FailedClient:
        def __init__(self, timeout):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url):
            raise httpx.ConnectError("offline")

    monkeypatch.setattr(api_routes.httpx, "AsyncClient", FailedClient)
    with TestClient(app) as client:
        response = client.get(
            "/api/routes?from_lat=17&from_lon=78&to_lat=17&to_lon=78.1"
        )

    assert response.status_code == 502
    assert "demo routing service" in response.json()["detail"]