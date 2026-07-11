from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from datetime import datetime
from typing import List, Optional

from db.database import get_db
from db.models import Permit
from api.schemas import PermitResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/permits", tags=["Permits"])


@router.get("", response_model=List[PermitResponse], summary="List permit-to-work records")
def list_permits(
    zone_id:     Optional[str]      = Query(None, description="Filter by zone_id"),
    plant_id:    str                = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    status:      Optional[str]      = Query(None, description="Filter by status: active | closed | cancelled"),
    permit_type: Optional[str]      = Query(None, description="Filter by type: hot_work | cold_work | confined_space_entry"),
    start:       Optional[datetime] = Query(None, description="Permits active after this time"),
    end:         Optional[datetime] = Query(None, description="Permits active before this time"),
    limit:       int                = Query(100, ge=1, le=500),
    offset:      int                = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Return permit-to-work records. Can filter by zone, status, type, plant, and time range.
    Time filters match permits whose [start_time, end_time] window overlaps [start, end].
    """
    query = db.query(Permit).filter(Permit.plant_id == plant_id).order_by(Permit.start_time.desc())

    if zone_id:
        query = query.filter(Permit.zone_id == zone_id)
    if status:
        query = query.filter(Permit.status == status)
    if permit_type:
        query = query.filter(Permit.permit_type == permit_type)
    if start:
        # Overlapping permits: permit.end_time >= filter_start
        query = query.filter(Permit.end_time >= start)
    if end:
        # Overlapping permits: permit.start_time <= filter_end
        query = query.filter(Permit.start_time <= end)

    return query.offset(offset).limit(limit).all()
