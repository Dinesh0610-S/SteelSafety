from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from db.database import get_db
from db.models import WorkerLocation
from api.schemas import WorkerLocationResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/workers", tags=["Workers"])


@router.get(
    "/locations",
    response_model=List[WorkerLocationResponse],
    summary="Worker zone-based location pings",
)
def list_worker_locations(
    zone_id:   Optional[str]      = Query(None, description="Filter by zone_id"),
    plant_id:  str                = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    worker_id: Optional[str]      = Query(None, description="Filter by worker_id (e.g. W001)"),
    start:     Optional[datetime] = Query(None, description="Pings from this time onwards"),
    end:       Optional[datetime] = Query(None, description="Pings up to this time"),
    limit:     int                = Query(200, ge=1, le=2000),
    offset:    int                = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Return worker location pings filtered by zone, plant, worker, and/or time range.
    Locations are zone-level only (no GPS coordinates).
    """
    query = db.query(WorkerLocation).filter(WorkerLocation.plant_id == plant_id).order_by(WorkerLocation.timestamp.desc())

    if zone_id:
        query = query.filter(WorkerLocation.zone_id == zone_id)
    if worker_id:
        query = query.filter(WorkerLocation.worker_id == worker_id)
    if start:
        query = query.filter(WorkerLocation.timestamp >= start)
    if end:
        query = query.filter(WorkerLocation.timestamp <= end)

    return query.offset(offset).limit(limit).all()
