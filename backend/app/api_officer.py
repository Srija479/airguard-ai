from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
import hmac
import os
from pathlib import Path
from typing import Any

import jwt
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .api_reports import _photo_data, _report_data, _timestamp
from .config_reports import ACTIVE_ACTIVITY_STATUSES, REPORT_CATEGORIES, REVIEW_STATUSES
from .database import get_db
from .models import Report, ReportStatusHistory

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

router = APIRouter(prefix="/api/officer", tags=["officer"])
_bearer = HTTPBearer(auto_error=False)
_login_requests: dict[str, deque[datetime]] = defaultdict(deque)
_LOGIN_LIMIT = 10
_LOGIN_WINDOW = timedelta(minutes=15)
_TRANSITIONS = {
    "submitted": {"under_review", "rejected"},
    "under_review": {"action_planned", "resolved", "rejected"},
    "action_planned": {"resolved", "under_review"},
    "resolved": {"under_review"},
    "rejected": set(),
}


class OfficerCredentials(BaseModel):
    username: str
    password: str


class StatusUpdate(BaseModel):
    status: str = Field(min_length=1, max_length=40)
    note: str = Field(min_length=1, max_length=2000)


def _configured_credentials() -> tuple[str, str, str] | None:
    username = os.getenv("OFFICER_USERNAME")
    password = os.getenv("OFFICER_PASSWORD")
    secret = os.getenv("JWT_SECRET")
    if not username or not password or not secret:
        return None
    return username, password, secret


def _check_login_limit(ip_address: str, now: datetime) -> None:
    requests = _login_requests[ip_address]
    cutoff = now - _LOGIN_WINDOW
    while requests and requests[0] <= cutoff:
        requests.popleft()
    if len(requests) >= _LOGIN_LIMIT:
        raise HTTPException(status_code=429, detail="Officer login rate limit exceeded")
    requests.append(now)


def require_officer(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Officer authentication required")
    configured = _configured_credentials()
    if configured is None:
        raise HTTPException(status_code=503, detail="Officer login is not configured")
    try:
        claims = jwt.decode(credentials.credentials, configured[2], algorithms=["HS256"])
    except jwt.PyJWTError as exc:
        raise HTTPException(status_code=401, detail="Invalid officer token") from exc
    subject = claims.get("sub")
    if subject != configured[0] or claims.get("role") != "officer":
        raise HTTPException(status_code=403, detail="Officer access required")
    return subject


@router.post("/login")
def officer_login(payload: OfficerCredentials, request: Request) -> dict[str, str]:
    configured = _configured_credentials()
    if configured is None:
        raise HTTPException(status_code=503, detail="Officer login is not configured")
    ip_address = request.client.host if request.client else "unknown"
    _check_login_limit(ip_address, datetime.now(timezone.utc))
    username_matches = hmac.compare_digest(payload.username, configured[0])
    password_matches = hmac.compare_digest(payload.password, configured[1])
    if not username_matches or not password_matches:
        raise HTTPException(status_code=401, detail="Invalid officer credentials")
    now = datetime.now(timezone.utc)
    token = jwt.encode(
        {"sub": configured[0], "role": "officer", "iat": now, "exp": now + timedelta(hours=8)},
        configured[2],
        algorithm="HS256",
    )
    return {"access_token": token, "token_type": "bearer"}


def _filtered_query(
    category: str | None,
    review_status: str | None,
    active: bool | None,
    city: str | None,
):
    query = select(Report)
    if category:
        if category not in REPORT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown report category")
        query = query.where(Report.category == category)
    if review_status:
        if review_status not in REVIEW_STATUSES:
            raise HTTPException(status_code=422, detail="Unknown review status")
        query = query.where(Report.review_status == review_status)
    if active is True:
        query = query.where(Report.activity_status.in_(ACTIVE_ACTIVITY_STATUSES))
    elif active is False:
        query = query.where(~Report.activity_status.in_(ACTIVE_ACTIVITY_STATUSES))
    if city:
        query = query.where(Report.place_name.ilike(f"%{city.strip()}%"))
    return query


@router.get("/reports")
def officer_reports(
    category: str | None = Query(default=None),
    review_status: str | None = Query(default=None),
    active: bool | None = Query(default=None),
    city: str | None = Query(default=None, max_length=100),
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    _officer: str = Depends(require_officer),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = _filtered_query(category, review_status, active, city)
    reports = db.scalars(query.order_by(Report.created_at.desc()).offset(offset).limit(limit)).all()
    counts = {
        status: db.scalar(
            select(func.count()).select_from(Report).where(
                Report.review_status == status,
                *query.whereclause.clauses if query.whereclause is not None else (),
            )
        )
        for status in REVIEW_STATUSES
    }
    items = []
    for report in reports:
        items.append(
            {
                **_report_data(report),
                "photos": [_photo_data(photo) for photo in report.photos],
                "history": [
                    {
                        "previous_status": entry.previous_status,
                        "new_status": entry.new_status,
                        "note": entry.note,
                        "created_at": _timestamp(entry.created_at),
                    }
                    for entry in report.status_history
                ],
            }
        )
    return {"items": items, "counts": counts, "limit": limit, "offset": offset}


@router.patch("/reports/{report_code}/status")
def update_report_status(
    report_code: str,
    payload: StatusUpdate,
    _officer: str = Depends(require_officer),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    note = payload.note.strip()
    if not note:
        raise HTTPException(status_code=422, detail="A status note is required")
    if payload.status not in REVIEW_STATUSES:
        raise HTTPException(status_code=422, detail="Unknown review status")
    report = db.scalar(select(Report).where(Report.report_code == report_code))
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    if payload.status not in _TRANSITIONS[report.review_status]:
        raise HTTPException(status_code=422, detail="This review-status transition is not allowed")

    previous_status = report.review_status
    report.review_status = payload.status
    report.status_history.append(
        ReportStatusHistory(
            previous_status=previous_status,
            new_status=payload.status,
            note=note,
        )
    )
    db.commit()
    return {"code": report.report_code, "review_status": report.review_status}