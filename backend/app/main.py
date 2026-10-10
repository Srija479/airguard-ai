from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .api_aqi import router as aqi_router
from .api_forecast import router as forecast_router
from .api_officer import router as officer_router
from .api_reports import router as reports_router
from .api_routes import router as routes_router
from .database import Base, engine
from . import models as _report_models


@asynccontextmanager
async def lifespan(app: FastAPI):
    Base.metadata.create_all(bind=engine)
    yield


app = FastAPI(lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
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
