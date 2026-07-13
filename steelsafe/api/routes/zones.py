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


@router.get("/spatial/layout", summary="Get spatial zone layout coordinates for mapping")
def get_spatial_layout(plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter layout by plant ID")):
    """Return center coordinates and boundary polygons for plant zones on the floor plan."""
    if plant_id == "plant_coke_oven":
        return [
            {"zone_id": "zone_gcm", "name": "Gas Collection Main", "x": 450, "y": 50, "boundary": [[220, 30], [680, 30], [680, 70], [220, 70]]},
            {"zone_id": "zone_ca", "name": "Charging Area", "x": 450, "y": 110, "boundary": [[220, 90], [680, 90], [680, 130], [220, 130]]},
            {"zone_id": "zone_cob1", "name": "Coke Oven Battery 1", "x": 450, "y": 220, "boundary": [[220, 150], [680, 150], [680, 290], [220, 290]]},
            {"zone_id": "zone_cr", "name": "Control Room", "x": 125, "y": 365, "boundary": [[50, 320], [200, 320], [200, 410], [50, 410]]},
            {"zone_id": "zone_qt", "name": "Quenching Tower", "x": 605, "y": 365, "boundary": [[530, 320], [680, 320], [680, 410], [530, 410]]}
        ]
    else:
        return [
            {"zone_id": "zone_rhf", "name": "Reheating Furnace", "x": 125, "y": 170, "boundary": [[50, 50], [200, 50], [200, 290], [50, 290]]},
            {"zone_id": "zone_rs", "name": "Rolling Stand", "x": 300, "y": 170, "boundary": [[240, 100], [360, 100], [360, 240], [240, 240]]},
            {"zone_id": "zone_cb", "name": "Cooling Bed", "x": 470, "y": 170, "boundary": [[400, 50], [540, 50], [540, 290], [400, 290]]},
            {"zone_id": "zone_fl", "name": "Finishing Line", "x": 635, "y": 170, "boundary": [[580, 100], [690, 100], [690, 240], [580, 240]]},
            {"zone_id": "zone_cr2", "name": "Mill Control Room", "x": 465, "y": 350, "boundary": [[240, 300], [690, 300], [690, 400], [240, 400]]}
        ]
