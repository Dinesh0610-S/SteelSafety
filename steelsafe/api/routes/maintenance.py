from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from db.database import get_db
from db.models import MaintenanceLog
from api.schemas import MaintenanceLogResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/maintenance", tags=["Maintenance"])


@router.get("", response_model=List[MaintenanceLogResponse], summary="List maintenance activity logs")
def list_maintenance(
    zone_id: Optional[str]      = Query(None, description="Filter by zone_id"),
    plant_id: str               = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    start:   Optional[datetime] = Query(None, description="Jobs active after this time"),
    end:     Optional[datetime] = Query(None, description="Jobs active before this time"),
    limit:   int                = Query(100, ge=1, le=500),
    offset:  int                = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Return maintenance activity logs. Time filters match jobs whose window
    overlaps [start, end] (same overlap logic as permits).
    """
    query = db.query(MaintenanceLog).filter(MaintenanceLog.plant_id == plant_id).order_by(MaintenanceLog.start_time.desc())

    if zone_id:
        query = query.filter(MaintenanceLog.zone_id == zone_id)
    if start:
        query = query.filter(MaintenanceLog.end_time >= start)
    if end:
        query = query.filter(MaintenanceLog.start_time <= end)

    return query.offset(offset).limit(limit).all()
