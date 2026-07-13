"""
SteelSafe Intelligence — FastAPI Application Entry Point
Phase 4: RAG Agent Backend

Startup behaviour:
  - Creates DB tables on first run
  - Auto-generates synthetic data if the DB is empty
  - Mounts all API routers under /api/v1

Run with:
    uvicorn main:app --reload --port 8000
"""

import os

# Load .env variables manually to be zero-dependency and cross-platform
for env_dir in [os.path.dirname(os.path.abspath(__file__)), os.path.expanduser("~")]:
    env_file = os.path.join(env_dir, ".env")
    if os.path.exists(env_file):
        try:
            with open(env_file, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith("#") and "=" in line:
                        k, v = line.split("=", 1)
                        os.environ[k.strip()] = v.strip()
        except Exception as e:
            print(f"[Startup] Failed loading .env from {env_file}: {e}")

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db.database import create_all_tables, SessionLocal
from db.models import Zone
from data_generator.generator import run_generation

# Route imports
from api.routes import (
    zones, sensors, permits, maintenance, 
    shifts, workers, admin, risk, chat, metrics, plants,
    forecast, report
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Run startup logic before the server accepts requests."""
    create_all_tables()

    # Auto-seed data if DB is empty (first run)
    db = SessionLocal()
    try:
        count = db.query(Zone).count()
    finally:
        db.close()

    if count == 0:
        print("[Startup] Empty database detected — generating synthetic data...")
        run_generation()
    else:
        print(f"[Startup] Database already seeded ({count} zones found). Skipping generation.")

    yield  # Server runs here
    # (no teardown needed for SQLite)


app = FastAPI(
    title       = "SteelSafe Intelligence API",
    description = (
        "Phase 9 backend for the SteelSafe AI-powered Industrial Safety Intelligence platform. "
        "Adds Predictive Incident Forecasting (TTD), Shift Briefing Reports, and multi-plant analytics."
    ),
    version     = "9.0.0",
    lifespan    = lifespan,
)

# CORS — allow all origins for local hackathon development
app.add_middleware(
    CORSMiddleware,
    allow_origins     = ["*"],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)

# Mount all routers under /api/v1
API_PREFIX = "/api/v1"
app.include_router(zones.router,       prefix=API_PREFIX)
app.include_router(sensors.router,     prefix=API_PREFIX)
app.include_router(permits.router,     prefix=API_PREFIX)
app.include_router(maintenance.router, prefix=API_PREFIX)
app.include_router(shifts.router,      prefix=API_PREFIX)
app.include_router(workers.router,     prefix=API_PREFIX)
app.include_router(admin.router,       prefix=API_PREFIX)
app.include_router(risk.router,        prefix=API_PREFIX)
app.include_router(chat.router,        prefix=API_PREFIX)
app.include_router(metrics.router,     prefix=API_PREFIX)
app.include_router(plants.router,      prefix=API_PREFIX)
app.include_router(forecast.router,    prefix=API_PREFIX)
app.include_router(report.router,      prefix=API_PREFIX)


@app.get("/", tags=["Health"])
def root():
    """Health check — confirms the API is running."""
    return {
        "service": "SteelSafe Intelligence API",
        "version": "9.0.0",
        "phase":   9,
        "status":  "running",
        "docs":    "/docs",
    }


@app.get("/health", tags=["Health"])
def health():
    """Simple health check endpoint."""
    return {"status": "ok"}
