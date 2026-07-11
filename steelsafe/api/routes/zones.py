from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Optional

from db.database import get_db
from db.models import Zone
from api.schemas import ZoneResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/zones", tags=["Zones"])


@router.get("", response_model=List[ZoneResponse], summary="List all plant zones")
def list_zones(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter zones by plant ID"),
    db: Session = Depends(get_db)
):
    """Return plant zone definitions with metadata, filtered by plant_id."""
    return db.query(Zone).filter(Zone.plant_id == plant_id).order_by(Zone.zone_id).all()


@router.get("/{zone_id}", response_model=ZoneResponse, summary="Get a single zone by ID")
def get_zone(zone_id: str, db: Session = Depends(get_db)):
    """Return metadata for a specific zone by its zone_id."""
    zone = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    if not zone:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    return zone
