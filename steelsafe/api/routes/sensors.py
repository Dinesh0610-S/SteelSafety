from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime
from typing import List, Optional

from db.database import get_db
from db.models import SensorReading, Zone
from api.schemas import SensorReadingResponse, CurrentSensorResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/sensors", tags=["Sensors"])


@router.get(
    "/current",
    response_model=List[CurrentSensorResponse],
    summary="Latest sensor reading per zone",
)
def get_current_sensors(
    zone_id: Optional[str] = Query(None, description="Filter to a specific zone"),
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter to a specific plant"),
    db: Session = Depends(get_db),
):
    """
    Return the most recent sensor reading for each zone (or a specific zone) of the given plant.
    This gives a real-time snapshot of plant conditions.
    """
    # Subquery: find the max timestamp per zone for the given plant_id
    subq = (
        db.query(
            SensorReading.zone_id,
            func.max(SensorReading.timestamp).label("max_ts"),
        )
        .filter(SensorReading.plant_id == plant_id)
        .group_by(SensorReading.zone_id)
        .subquery()
    )

    query = (
        db.query(SensorReading, Zone.name.label("zone_name"))
        .filter(SensorReading.plant_id == plant_id)
        .join(subq, (SensorReading.zone_id == subq.c.zone_id) &
                    (SensorReading.timestamp == subq.c.max_ts))
        .join(Zone, (Zone.zone_id == SensorReading.zone_id) & (Zone.plant_id == plant_id))
    )

    if zone_id:
        query = query.filter(SensorReading.zone_id == zone_id)

    rows = query.all()

    if not rows:
        raise HTTPException(status_code=404, detail="No sensor data found.")

    return [
        CurrentSensorResponse(
            zone_id       = row.SensorReading.zone_id,
            zone_name     = row.zone_name,
            timestamp     = row.SensorReading.timestamp,
            co_ppm        = row.SensorReading.co_ppm,
            h2s_ppm       = row.SensorReading.h2s_ppm,
            temperature_c = row.SensorReading.temperature_c,
            pressure_kpa  = row.SensorReading.pressure_kpa,
        )
        for row in rows
    ]


@router.get(
    "/history",
    response_model=List[SensorReadingResponse],
    summary="Historical sensor readings for a time range",
)
def get_sensor_history(
    zone_id: Optional[str] = Query(None, description="Filter by zone_id"),
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    start:   Optional[datetime] = Query(None, description="Start datetime (ISO 8601)"),
    end:     Optional[datetime] = Query(None, description="End datetime (ISO 8601)"),
    limit:   int = Query(200, ge=1, le=2000, description="Max rows to return"),
    offset:  int = Query(0, ge=0, description="Row offset for pagination"),
    db: Session = Depends(get_db),
):
    """
    Return historical sensor readings, optionally filtered by zone, plant, and time range.
    Results are ordered chronologically. Use limit/offset for pagination.
    """
    query = db.query(SensorReading).filter(SensorReading.plant_id == plant_id).order_by(
        SensorReading.zone_id, SensorReading.timestamp
    )

    if zone_id:
        query = query.filter(SensorReading.zone_id == zone_id)
    if start:
        query = query.filter(SensorReading.timestamp >= start)
    if end:
        query = query.filter(SensorReading.timestamp <= end)

    return query.offset(offset).limit(limit).all()
