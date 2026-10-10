from collections.abc import Generator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api_reports import UPLOAD_DIR, _report_requests
from app.database import Base, get_db
from app.main import app

VALID_REPORT = {
    "category": "construction_dust",
    "activity_status": "ongoing",
    "title": "Dust from active work",
    "description": "Visible dust from a nearby site.",
    "place_name": "Hyderabad",
    "latitude": "17.385",
    "longitude": "78.4867",
}


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    testing_sessions = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    before_uploads = set(UPLOAD_DIR.glob("*")) if UPLOAD_DIR.exists() else set()

    def override_get_db():
        with testing_sessions() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    _report_requests.clear()
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    _report_requests.clear()
    if UPLOAD_DIR.exists():
        for path in set(UPLOAD_DIR.glob("*")) - before_uploads:
            path.unlink(missing_ok=True)
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_valid_report_is_created_as_submitted(client: TestClient):
    response = client.post("/api/reports", data=VALID_REPORT)

    assert response.status_code == 200
    report_code = response.json()["report_code"]
    detail = client.get(f"/api/reports/{report_code}").json()
    assert detail["review_status"] == "submitted"
    assert detail["history"][0]["new_status"] == "submitted"


def test_bad_category_and_activity_status_pair_is_rejected(client: TestClient):
    response = client.post(
        "/api/reports",
        data={**VALID_REPORT, "activity_status": "burning_now"},
    )

    assert response.status_code == 422


def test_non_image_upload_is_rejected(client: TestClient):
    response = client.post(
        "/api/reports",
        data=VALID_REPORT,
        files={"photos": ("report.txt", b"not an image", "text/plain")},
    )

    assert response.status_code == 415


def test_uploaded_photo_is_served_inline(client: TestClient):
    response = client.post(
        "/api/reports",
        data=VALID_REPORT,
        files={"photos": ("report.jpg", b"\xff\xd8\xffphoto", "image/jpeg")},
    )
    report_code = response.json()["report_code"]
    photo_url = client.get(f"/api/reports/{report_code}").json()["photos"][0]["url"]

    photo_response = client.get(photo_url)

    assert photo_response.status_code == 200
    assert photo_response.headers["content-type"] == "image/jpeg"
    assert "content-disposition" not in photo_response.headers


def test_oversize_photo_is_rejected(client: TestClient):
    oversized_jpeg = b"\xff\xd8\xff" + b"0" * (5 * 1024 * 1024)
    response = client.post(
        "/api/reports",
        data=VALID_REPORT,
        files={"photos": ("large.jpg", oversized_jpeg, "image/jpeg")},
    )

    assert response.status_code == 413


def test_rate_limit_allows_ten_reports_per_hour(client: TestClient):
    responses = [client.post("/api/reports", data=VALID_REPORT) for _ in range(11)]

    assert [response.status_code for response in responses] == [200] * 10 + [429]


def test_map_and_by_codes_return_citizen_report_fields(client: TestClient):
    report_code = client.post("/api/reports", data=VALID_REPORT).json()["report_code"]

    map_report = client.get("/api/reports/map").json()[0]
    assert map_report["code"] == report_code
    assert map_report["photo_url"] is None
    assert "first_photo" not in map_report

    saved_report = client.get(f"/api/reports/by-codes?codes={report_code}").json()[0]
    assert saved_report["code"] == report_code
    assert saved_report["photo_urls"] == []
    assert saved_report["place_name"] == VALID_REPORT["place_name"]
    assert saved_report["history"][0]["new_status"] == "submitted"


def test_review_status_is_always_submitted(client: TestClient):
    response = client.post("/api/reports", data={**VALID_REPORT, "review_status": "resolved"})
    report_code = response.json()["report_code"]

    assert response.status_code == 200
    assert client.get(f"/api/reports/{report_code}").json()["review_status"] == "submitted"
