from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import List

from db.database import get_db
from db.models import ShiftSchedule
from api.schemas import ShiftScheduleResponse
from plants.registry import DEFAULT_PLANT_ID

router = APIRouter(prefix="/shifts", tags=["Shifts"])


@router.get("", response_model=List[ShiftScheduleResponse], summary="Get shift changeover schedule")
def list_shifts(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter shifts by plant_id"),
    db: Session = Depends(get_db)
):
    """
    Return the full shift schedule (A, B, C shifts) ordered chronologically, filtered by plant.
    """
    return db.query(ShiftSchedule).filter(ShiftSchedule.plant_id == plant_id).order_by(ShiftSchedule.start_time).all()
