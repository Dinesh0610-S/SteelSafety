from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List

from db.database import get_db
from db.models import Zone, RiskAssessment, ComplianceDeviation, SensorReading
from api.schemas import PlantResponse, PlantSummaryItem
from plants.registry import PLANT_REGISTRY
from risk_engine.engine import evaluate_all_zones

router = APIRouter(prefix="/plants", tags=["Plants"])


@router.get("", response_model=List[PlantResponse], summary="List all registered plants")
def list_plants():
    """
    Return static definitions for all plants registered in the system config.
    """
    return [
        PlantResponse(
            plant_id   = p["plant_id"],
            name       = p["name"],
            short_name = p["short_name"],
            zone_count = len(p["zones"]),
        )
        for p in PLANT_REGISTRY.values()
    ]


@router.get("/summary", response_model=List[PlantSummaryItem], summary="Cross-plant safety and compliance summary")
def get_plants_summary(db: Session = Depends(get_db)):
    """
    Compute live status metrics for each registered plant:
    - Highest current risk level (low / medium / high / critical)
    - Active high/critical alerts count
    - Compliance score (0-100 based on active compliance deviations)
    """
    summary = []

    for plant_id, plant_config in PLANT_REGISTRY.items():
        # 1. Fetch latest risks per zone for this plant
        # First, find the latest sensor reading timestamp for this plant
        latest_ts = (
            db.query(func.max(SensorReading.timestamp))
            .filter(SensorReading.plant_id == plant_id)
            .scalar()
        )

        highest_level = "low"
        active_alerts = 0

        if latest_ts:
            # Query the stored risk assessments for this plant and timestamp
            assessments = (
                db.query(RiskAssessment)
                .filter(
                    (RiskAssessment.plant_id == plant_id) &
                    (RiskAssessment.timestamp == latest_ts)
                )
                .all()
            )
            
            # If they aren't stored, run live evaluation
            if not assessments:
                assessments = evaluate_all_zones(latest_ts, db, plant_id=plant_id)

            level_weights = {"low": 0, "medium": 1, "high": 2, "critical": 3}
            max_weight = -1

            for a in assessments:
                lvl = a.risk_level
                if level_weights.get(lvl, 0) > max_weight:
                    max_weight = level_weights.get(lvl, 0)
                    highest_level = lvl
                if lvl in ("high", "critical"):
                    active_alerts += 1

        # 2. Compute compliance score based on active deviations
        active_devs = (
            db.query(ComplianceDeviation)
            .filter(
                (ComplianceDeviation.plant_id == plant_id) &
                (ComplianceDeviation.resolved == False)
            )
            .all()
        )

        # Base score of 100, deduct based on active deviations
        deductions = 0
        for dev in active_devs:
            if dev.severity == "high":
                deductions += 15
            elif dev.severity == "medium":
                deductions += 10
            else:
                deductions += 5

        compliance_score = float(max(0, 100 - deductions))

        summary.append(
            PlantSummaryItem(
                plant_id            = plant_id,
                name                = plant_config["name"],
                short_name          = plant_config["short_name"],
                zone_count          = len(plant_config["zones"]),
                highest_risk_level  = highest_level,
                active_alerts_count = active_alerts,
                compliance_score    = compliance_score,
            )
        )

    return summary
