from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone
from pathlib import Path
import secrets
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config_reports import ACTIVE_ACTIVITY_STATUSES, REPORT_CATEGORIES, REVIEW_STATUSES
from .database import get_db
from .models import Report, ReportPhoto, ReportStatusHistory
from .schemas import ReportCreate

router = APIRouter(prefix="/api/reports", tags=["reports"])
UPLOAD_DIR = Path(__file__).resolve().parent.parent / "uploads"
MAX_PHOTO_BYTES = 5 * 1024 * 1024
MAX_PHOTOS = 3
REPORT_LIMIT_PER_HOUR = 10
_report_requests: dict[str, deque[datetime]] = defaultdict(deque)


def _timestamp(value: datetime | None) -> str | None:
    return value.isoformat() if value else None


def _report_data(report: Report) -> dict[str, Any]:
    return {
        "report_code": report.report_code,
        "category": report.category,
        "title": report.title,
        "description": report.description,
        "place_name": report.place_name,
        "latitude": report.latitude,
        "longitude": report.longitude,
        "activity_status": report.activity_status,
        "review_status": report.review_status,
        "created_at": _timestamp(report.created_at),
        "updated_at": _timestamp(report.updated_at),
    }


def _photo_data(photo: ReportPhoto) -> dict[str, str | None]:
    return {
        "filename": photo.filename,
        "url": f"/api/reports/photo/{photo.filename}",
        "created_at": _timestamp(photo.created_at),
    }


def _check_rate_limit(ip_address: str, now: datetime) -> None:
    requests = _report_requests[ip_address]
    cutoff = now - timedelta(hours=1)
    while requests and requests[0] <= cutoff:
        requests.popleft()
    if len(requests) >= REPORT_LIMIT_PER_HOUR:
        raise HTTPException(status_code=429, detail="Report rate limit exceeded")


def _file_type(content: bytes) -> tuple[str, str] | None:
    if content.startswith(b"\xff\xd8\xff"):
        return "image/jpeg", ".jpg"
    if content.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png", ".png"
    if content.startswith(b"RIFF") and content[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


@router.post("")
async def create_report(
    request: Request,
    category: str = Form(...),
    activity_status: str = Form(...),
    title: str = Form(...),
    description: str = Form(default=""),
    place_name: str = Form(...),
    latitude: float | None = Form(default=None),
    longitude: float | None = Form(default=None),
    photos: list[UploadFile] = File(default=[]),
    db: Session = Depends(get_db),
) -> dict[str, str]:
    now = datetime.now(timezone.utc)
    ip_address = request.client.host if request.client else "unknown"
    _check_rate_limit(ip_address, now)
    if len(photos) > MAX_PHOTOS:
        raise HTTPException(status_code=422, detail="At most three photos are allowed")

    try:
        report_input = ReportCreate(
            category=category,
            activity_status=activity_status,
            title=title,
            description=description,
            place_name=place_name,
            latitude=latitude,
            longitude=longitude,
        )
    except ValidationError as exc:
        raise HTTPException(
            status_code=422,
            detail=exc.errors(include_url=False, include_context=False),
        ) from exc

    validated_files: list[tuple[UploadFile, bytes, str]] = []
    for upload in photos:
        content = await upload.read(MAX_PHOTO_BYTES + 1)
        if len(content) > MAX_PHOTO_BYTES:
            raise HTTPException(status_code=413, detail="Each photo must be 5 MB or smaller")
        detected = _file_type(content)
        if detected is None:
            raise HTTPException(status_code=415, detail="Photos must be JPEG, PNG, or WebP images")
        validated_files.append((upload, content, detected[1]))

    report = Report(
        category=report_input.category,
        activity_status=report_input.activity_status,
        title=report_input.title,
        description=report_input.description,
        place_name=report_input.place_name,
        latitude=report_input.latitude,
        longitude=report_input.longitude,
        review_status="submitted",
    )
    report.status_history.append(
        ReportStatusHistory(previous_status=None, new_status="submitted", note=None)
    )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    saved_paths: list[Path] = []
    try:
        for _, content, extension in validated_files:
            filename = f"{secrets.token_hex(20)}{extension}"
            path = UPLOAD_DIR / filename
            path.write_bytes(content)
            saved_paths.append(path)
            report.photos.append(ReportPhoto(filename=filename))
        db.add(report)
        db.commit()
        db.refresh(report)
    except Exception:
        db.rollback()
        for path in saved_paths:
            path.unlink(missing_ok=True)
        raise

    _report_requests[ip_address].append(now)
    return {"report_code": report.report_code}


@router.get("")
def list_reports(
    limit: int = Query(default=50, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    category: str | None = Query(default=None),
    review_status: str | None = Query(default=None),
    active: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    query = select(Report)
    if category:
        if category not in REPORT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown report category")
        query = query.where(Report.category == category)
    if review_status:
        if review_status not in REVIEW_STATUSES:
            raise HTTPException(status_code=422, detail="Unknown review status")
        query = query.where(Report.review_status == review_status)
    if active:
        query = query.where(Report.activity_status.in_(ACTIVE_ACTIVITY_STATUSES))
    reports = db.scalars(query.order_by(Report.created_at.desc()).offset(offset).limit(limit)).all()
    return {"items": [_report_data(report) for report in reports], "limit": limit, "offset": offset}


@router.get("/map")
def map_reports(
    category: str | None = Query(default=None),
    active: bool = Query(default=False),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    query = select(Report).where(Report.latitude.is_not(None), Report.longitude.is_not(None))
    if category:
        if category not in REPORT_CATEGORIES:
            raise HTTPException(status_code=422, detail="Unknown report category")
        query = query.where(Report.category == category)
    if active:
        query = query.where(Report.activity_status.in_(ACTIVE_ACTIVITY_STATUSES))

    results = []
    for report in db.scalars(query.order_by(Report.created_at.desc())).all():
        first_photo = report.photos[0] if report.photos else None
        results.append(
            {
                "code": report.report_code,
                "category": report.category,
                "title": report.title,
                "place_name": report.place_name,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "activity_status": report.activity_status,
                "review_status": report.review_status,
                "created_at": _timestamp(report.created_at),
                "photo_url": f"/api/reports/photo/{first_photo.filename}" if first_photo else None,
            }
        )
    return results


@router.get("/by-codes")
def reports_by_codes(
    codes: str = Query(...),
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    requested_codes = list(dict.fromkeys(code.strip() for code in codes.split(",") if code.strip()))
    if not requested_codes or len(requested_codes) > 20:
        raise HTTPException(status_code=422, detail="Provide between one and 20 report codes")

    reports = db.scalars(select(Report).where(Report.report_code.in_(requested_codes))).all()
    reports_by_code = {report.report_code: report for report in reports}
    results = []
    for code in requested_codes:
        report = reports_by_code.get(code)
        if report is None:
            continue
        photo_urls = [f"/api/reports/photo/{photo.filename}" for photo in report.photos]
        results.append(
            {
                "code": report.report_code,
                "category": report.category,
                "title": report.title,
                "latitude": report.latitude,
                "longitude": report.longitude,
                "activity_status": report.activity_status,
                "review_status": report.review_status,
                "created_at": _timestamp(report.created_at),
                "photo_url": photo_urls[0] if photo_urls else None,
                "photo_urls": photo_urls,
                "place_name": report.place_name,
                "description": report.description,
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
    return results


@router.get("/config")
def reports_config() -> dict[str, Any]:
    return {
        "categories": [
            {"key": category, "activity_statuses": statuses}
            for category, statuses in REPORT_CATEGORIES.items()
        ],
        "review_statuses": REVIEW_STATUSES,
        "active_activity_statuses": sorted(ACTIVE_ACTIVITY_STATUSES),
    }


@router.get("/photo/{filename}")
def get_report_photo(filename: str) -> FileResponse:
    if filename in {".", ".."} or Path(filename).name != filename or "/" in filename or "\\" in filename:
        raise HTTPException(status_code=404, detail="Photo not found")
    path = (UPLOAD_DIR / filename).resolve()
    if path.parent != UPLOAD_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="Photo not found")
    content_type = _file_type(path.read_bytes()[:12])
    if content_type is None:
        raise HTTPException(status_code=404, detail="Photo not found")
    return FileResponse(path, media_type=content_type[0])


@router.get("/{report_code}")
def get_report(report_code: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    report = db.scalar(
        select(Report).where(Report.report_code == report_code)
    )
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return {
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
