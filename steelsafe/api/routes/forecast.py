"""
api/routes/forecast.py
========================
Phase 9: Predictive Incident Forecasting endpoints.

GET  /api/v1/forecast/{zone_id}
    Compute Time-To-Danger (TTD) projection for a single zone using
    linear regression on the last 30 sensor readings.

GET  /api/v1/forecast
    Compute TTD projections for all zones of a plant, sorted by urgency
    (most imminent first).
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional

from db.database import get_db
from db.models import Zone
from plants.registry import DEFAULT_PLANT_ID
from risk_engine.forecaster import forecast_zone, forecast_all_zones

router = APIRouter(prefix="/forecast", tags=["Forecast (Phase 9)"])


@router.get(
    "",
    summary="Time-To-Danger forecast for all zones of a plant",
)
def get_plant_forecast(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Plant to forecast"),
    lookback: int = Query(30, ge=5, le=100, description="Number of readings to regress over"),
    db: Session = Depends(get_db),
):
    """
    Returns TTD forecasts for every zone in the specified plant, sorted by
    urgency (imminent → warning → safe). Each item includes:
    - co_ttd_action / h2s_ttd_action: minutes until action-level threshold is breached
    - co_ttd_high / h2s_ttd_high: minutes until high-alarm threshold is breached
    - overall_ttd_minutes: minimum of the action-level TTDs (most urgent)
    - alert_level: 'imminent' (≤10 min), 'warning' (≤30 min), or 'safe'
    - trend_co / trend_h2s: 'rising' | 'stable' | 'falling'
    - confidence: 'high' | 'medium' | 'low' (based on R² of the regression)
    """
    return forecast_all_zones(db, plant_id=plant_id, lookback=lookback)


@router.get(
    "/{zone_id}",
    summary="Time-To-Danger forecast for a single zone",
)
def get_zone_forecast(
    zone_id: str,
    lookback: int = Query(30, ge=5, le=100, description="Number of readings to regress over"),
    db: Session = Depends(get_db),
):
    """
    Runs linear regression on the last `lookback` sensor readings for the zone
    and returns TTD projections for CO and H2S at both the action level and
    high-alarm threshold.

    TTD is returned as minutes until threshold breach at the current rate.
    Returns None when slope is non-positive (not rising) or R² < 0.30
    (insufficient trend signal).
    """
    zone_row = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    if not zone_row:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")

    return forecast_zone(
        zone_id=zone_id,
        db=db,
        plant_id=zone_row.plant_id,
        lookback=lookback,
    )
