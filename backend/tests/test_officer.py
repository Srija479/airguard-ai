from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app import api_officer
from app.api_reports import _report_requests
from app.database import Base, get_db
from app.main import app


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    def override_get_db():
        with testing_sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    api_officer._login_requests.clear()
    _report_requests.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    api_officer._login_requests.clear()
    _report_requests.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def _configure_officer(monkeypatch):
    monkeypatch.setenv("OFFICER_USERNAME", "reviewer")
    monkeypatch.setenv("OFFICER_PASSWORD", "test-password")
    monkeypatch.setenv("JWT_SECRET", "test-secret-for-officer-jwt-at-least-32")


def test_login_returns_503_when_not_configured(client: TestClient, monkeypatch):
    monkeypatch.delenv("OFFICER_USERNAME", raising=False)
    monkeypatch.delenv("OFFICER_PASSWORD", raising=False)
    monkeypatch.delenv("JWT_SECRET", raising=False)

    response = client.post("/api/officer/login", json={"username": "any", "password": "any"})

    assert response.status_code == 503
    assert response.json()["detail"] == "Officer login is not configured"


def test_anonymous_cannot_change_citizen_report_status(client: TestClient, monkeypatch):
    _configure_officer(monkeypatch)
    report_response = client.post(
        "/api/reports",
        data={
            "category": "construction_dust",
            "activity_status": "ongoing",
            "title": "Dust from work",
            "description": "Visible dust",
            "place_name": "Hyderabad",
            "latitude": "17.385",
            "longitude": "78.4867",
        },
    )
    code = report_response.json()["report_code"]

    assert client.get("/api/officer/reports").status_code == 401
    denied = client.patch(
        f"/api/officer/reports/{code}/status",
        json={"status": "under_review", "note": "Reviewed"},
    )
    assert denied.status_code == 401
    assert client.get(f"/api/reports/{code}").json()["review_status"] == "submitted"

    login = client.post(
        "/api/officer/login",
        json={"username": "reviewer", "password": "test-password"},
    )
    token = login.json()["access_token"]
    queue = client.get(
        "/api/officer/reports",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert queue.status_code == 200
    assert queue.json()["counts"]["submitted"] == 1
    assert len(queue.json()["items"]) == 1
    changed = client.patch(
        f"/api/officer/reports/{code}/status",
        json={"status": "under_review", "note": "Officer checked the location"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert changed.status_code == 200
    citizen_detail = client.get(f"/api/reports/{code}").json()
    assert citizen_detail["review_status"] == "under_review"
    assert citizen_detail["history"][-1]["note"] == "Officer checked the location"


def test_login_is_limited_to_ten_attempts_per_fifteen_minutes(client: TestClient, monkeypatch):
    _configure_officer(monkeypatch)
    responses = [
        client.post("/api/officer/login", json={"username": "wrong", "password": "wrong"})
        for _ in range(11)
    ]

    assert [response.status_code for response in responses[:10]] == [401] * 10
    assert responses[10].status_code == 429