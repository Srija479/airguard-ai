from contextlib import asynccontextmanager
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .api_aqi import router as aqi_router
from .api_forecast import router as forecast_router
from .api_officer import router as officer_router
from .api_reports import router as reports_router
from .api_routes import router as routes_router
from .database import Base, engine
from . import models as _report_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    backend_dir = Path(__file__).resolve().parent.parent
    os.makedirs(backend_dir / "uploads", exist_ok=True)
    os.makedirs(backend_dir / "models", exist_ok=True)
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)
allowed_origins = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173").split(",")
    if origin.strip()
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(aqi_router)
app.include_router(forecast_router)
app.include_router(officer_router)
app.include_router(reports_router)
app.include_router(routes_router)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


frontend_dist = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if frontend_dist.is_dir():
    app.mount("/assets", StaticFiles(directory=frontend_dist / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def serve_frontend(full_path: str):
        if full_path == "api" or full_path.startswith("api/"):
            raise HTTPException(status_code=404)
        return FileResponse(frontend_dist / "index.html")
