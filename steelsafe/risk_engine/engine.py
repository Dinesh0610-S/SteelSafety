"""
risk_engine/engine.py
=====================
Top-level entry points for the risk engine.

  evaluate_zone_at(zone_id, timestamp, db)
      → builds context, runs scorer, returns a RiskAssessment ORM object
        (not yet committed — caller decides whether to persist)

  evaluate_all_zones(timestamp, db, plant_id)
      → calls evaluate_zone_at for all zones of the specified plant in parallel-ish fashion

  sweep_full_timeline(db, store=True, plant_config=None)
      → evaluates every sensor timestamp in the DB for the specified plant across all its zones,
        optionally bulk-inserting results into risk_assessments.
        Used by the validation script and POST /admin/regenerate.
"""

from datetime import datetime
from typing import List, Optional

from sqlalchemy.orm import Session

from db.models import RiskAssessment, SensorReading
from plants.registry import get_plant_config, DEFAULT_PLANT_ID
from risk_engine.context_builder import build_context
from risk_engine.scorer import run_scorer


def evaluate_zone_at(
    zone_id:   str,
    timestamp: datetime,
    db:        Session,
) -> RiskAssessment:
    """
    Evaluate compound risk for a single zone at a specific timestamp.

    Returns an unsaved RiskAssessment ORM object.
    The caller is responsible for db.add() / db.commit() if persistence is desired.
    """
    ctx    = build_context(zone_id, timestamp, db)
    result = run_scorer(ctx)
    return RiskAssessment(**result)


def evaluate_all_zones(timestamp: datetime, db: Session, plant_id: str = DEFAULT_PLANT_ID) -> List[RiskAssessment]:
    """
    Evaluate all zones for the given plant_id at the given timestamp.
    Returns a list of unsaved RiskAssessment objects.
    """
    plant_config = get_plant_config(plant_id)
    zones = plant_config["zones"]
    assessments = []
    for zone in zones:
        assessment = evaluate_zone_at(zone["zone_id"], timestamp, db)
        assessments.append(assessment)
    return assessments


def sweep_full_timeline(db: Session, store: bool = True, plant_config: dict = None) -> dict:
    """
    Evaluate risk at every sensor reading timestamp across all zones for the given plant.

    This is the batch evaluation mode used by:
      - POST /admin/regenerate  (to pre-populate risk history)
      - tests/validate_scenarios.py  (to compute lead times)

    Args:
        db:           Active SQLAlchemy session
        store:        If True, bulk-inserts all RiskAssessment rows into the DB.
                      If False, returns results without persisting (validation mode).
        plant_config: The configuration of the plant to sweep. If None, default plant is used.

    Returns:
        dict with summary stats: total evaluations, high/critical count,
        and list of all assessment dicts for caller to inspect.
    """
    if plant_config is None:
        plant_config = get_plant_config(DEFAULT_PLANT_ID)

    plant_id = plant_config["plant_id"]

    # Get all unique timestamps from sensor_readings for this plant
    timestamps = (
        db.query(SensorReading.timestamp)
        .filter(SensorReading.plant_id == plant_id)
        .distinct()
        .order_by(SensorReading.timestamp)
        .all()
    )
    timestamps = [row[0] for row in timestamps]

    zone_ids = [z["zone_id"] for z in plant_config["zones"]]
    all_assessments: List[RiskAssessment] = []
    high_critical_count = 0

    print(f"[Engine] Sweeping {len(timestamps)} timestamps x {len(zone_ids)} zones "
          f"= {len(timestamps) * len(zone_ids)} evaluations for plant '{plant_id}'...")

    for i, ts in enumerate(timestamps):
        for zone_id in zone_ids:
            assessment = evaluate_zone_at(zone_id, ts, db)
            all_assessments.append(assessment)
            if assessment.risk_level in ("high", "critical"):
                high_critical_count += 1

        if (i + 1) % 100 == 0:
            print(f"[Engine] ...{i+1}/{len(timestamps)} timestamps processed")

    if store and all_assessments:
        print(f"[Engine] Storing {len(all_assessments)} risk assessments to DB...")
        # Clear existing risk_assessments for this plant before bulk insert
        db.query(RiskAssessment).filter(RiskAssessment.plant_id == plant_id).delete()
        db.bulk_save_objects(all_assessments)
        db.commit()
        print(f"[Engine] Sweep complete and stored for plant '{plant_id}'.")

    return {
        "total_evaluations":    len(all_assessments),
        "high_critical_count":  high_critical_count,
        "timestamps_evaluated": len(timestamps),
        "zones_evaluated":      len(zone_ids),
    }
