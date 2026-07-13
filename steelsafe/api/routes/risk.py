"""
api/routes/risk.py
==================
Phase 2 risk assessment endpoints.

GET  /api/v1/risk/current
    Runs the engine NOW for all zones of the specified plant (real-time evaluation).
    Returns one ZoneRiskSummary per zone.

GET  /api/v1/risk/history
    Returns stored RiskAssessment rows from risk_assessments table,
    filterable by plant_id, zone_id, risk_level, and time range.

GET  /api/v1/risk/zone/{zone_id}
    Returns the most recent full RiskAssessment for a specific zone,
    including the explanation paragraph and full signal_snapshot JSON.

GET  /api/v1/risk/rules
    Returns the rule registry — names, weights, categories, summaries.
    Useful for the demo's "how does this work?" explainability story.
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session, defer
from sqlalchemy import func
from datetime import datetime
from typing import List, Optional

from db.database import get_db
from db.models import RiskAssessment, Zone
from api.schemas import RiskAssessmentResponse, ZoneRiskSummary, CameraStateRequest, ComplianceDeviationResponse, PPEViolationRequest, PPEViolationEvent
from risk_engine.engine import evaluate_all_zones, evaluate_zone_at
from risk_engine.rules_config import RULE_REGISTRY
from risk_engine.intervention import get_minimum_intervention
from risk_engine.cost_impact import get_cost_impact
from risk_engine.cctv_state import LIVE_CCTV_STATE
from plants.registry import DEFAULT_PLANT_ID, get_plant_config

router = APIRouter(prefix="/risk", tags=["Risk Engine"])


@router.get(
    "/current",
    response_model=List[ZoneRiskSummary],
    summary="Real-time compound risk score for all zones of a plant",
)
def get_current_risk(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter to a specific plant"),
    zone_id: Optional[str] = Query(None, description="Filter to a specific zone"),
    db: Session = Depends(get_db),
):
    """
    Run the compound risk engine against the latest available sensor readings
    for each zone of the specified plant. Returns a risk score, level, and explanation per zone.

    This endpoint runs a live evaluation — it does NOT require a prior sweep.
    Results are NOT stored to the DB (use /admin/regenerate to sweep + store).
    """
    now = datetime.now()

    # Use the latest sensor timestamp in the DB for the given plant as the evaluation point
    # so results are grounded in the actual simulated data
    from db.models import SensorReading
    latest_ts_row = (
        db.query(func.max(SensorReading.timestamp))
        .filter(SensorReading.plant_id == plant_id)
        .scalar()
    )
    eval_ts = latest_ts_row if latest_ts_row else now

    if zone_id:
        zone_row = db.query(Zone).filter((Zone.zone_id == zone_id) & (Zone.plant_id == plant_id)).first()
        if not zone_row:
            raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found for plant '{plant_id}'.")
        assessments = [evaluate_zone_at(zone_id, eval_ts, db)]
        zone_names  = {zone_id: zone_row.name}
    else:
        assessments = evaluate_all_zones(eval_ts, db, plant_id=plant_id)
        zone_rows   = db.query(Zone).filter(Zone.plant_id == plant_id).all()
        zone_names  = {z.zone_id: z.name for z in zone_rows}

    return [
        ZoneRiskSummary(
            zone_id         = a.zone_id,
            zone_name       = zone_names.get(a.zone_id, a.zone_id),
            timestamp       = a.timestamp,
            risk_score      = a.risk_score,
            risk_level      = a.risk_level,
            triggered_rules = a.triggered_rules,
            anomaly_flagged = a.anomaly_flagged,
            explanation     = a.explanation,
        )
        for a in assessments
    ]


@router.get(
    "/history",
    response_model=List[RiskAssessmentResponse],
    summary="Historical risk assessment records",
)
def get_risk_history(
    plant_id:   str                = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    zone_id:    Optional[str]      = Query(None, description="Filter by zone_id"),
    risk_level: Optional[str]      = Query(None, description="Filter by level: low|medium|high|critical"),
    start:      Optional[datetime] = Query(None, description="Start datetime (ISO 8601)"),
    end:        Optional[datetime] = Query(None, description="End datetime (ISO 8601)"),
    limit:      int                = Query(200, ge=1, le=2000),
    offset:     int                = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """
    Return stored risk assessment rows from the risk_assessments table for the specified plant.
    Populate this table by running POST /admin/regenerate, which triggers
    a full timeline sweep and stores results.
    """
    # Query only lightweight columns to optimize speed and payload size
    assessments = (
        db.query(
            RiskAssessment.id,
            RiskAssessment.plant_id,
            RiskAssessment.zone_id,
            RiskAssessment.timestamp,
            RiskAssessment.risk_score,
            RiskAssessment.risk_level,
            RiskAssessment.triggered_rules,
            RiskAssessment.anomaly_flagged,
            RiskAssessment.anomaly_zscore,
        )
        .filter(RiskAssessment.plant_id == plant_id)
    )

    if zone_id:
        assessments = assessments.filter(RiskAssessment.zone_id == zone_id)
    if risk_level:
        assessments = assessments.filter(RiskAssessment.risk_level == risk_level)
    if start:
        assessments = assessments.filter(RiskAssessment.timestamp >= start)
    if end:
        assessments = assessments.filter(RiskAssessment.timestamp <= end)

    results = (
        assessments.order_by(RiskAssessment.zone_id, RiskAssessment.timestamp)
        .offset(offset)
        .limit(limit)
        .all()
    )

    if not results:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No risk assessment history found for plant '{plant_id}'. "
                "Run POST /api/v1/admin/regenerate to populate risk history."
            ),
        )

    # Return structured lightweight responses
    return [
        RiskAssessmentResponse(
            id=r.id,
            plant_id=r.plant_id,
            zone_id=r.zone_id,
            timestamp=r.timestamp,
            risk_score=r.risk_score,
            risk_level=r.risk_level,
            triggered_rules=r.triggered_rules,
            anomaly_flagged=r.anomaly_flagged,
            anomaly_zscore=r.anomaly_zscore,
            explanation="",
            signal_snapshot=None,
            cost_impact=None,
        )
        for r in results
    ]


@router.get(
    "/zone/{zone_id}",
    response_model=RiskAssessmentResponse,
    summary="Latest full risk assessment for a specific zone",
)
def get_zone_risk(zone_id: str, db: Session = Depends(get_db)):
    """
    Return the most recent stored risk assessment for a specific zone,
    including the full explanation and signal_snapshot JSON.
    If no stored assessment exists, runs a live evaluation.
    """
    # Look up zone to find its plant_id
    zone_row = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    if not zone_row:
        raise HTTPException(status_code=404, detail=f"Zone '{zone_id}' not found.")
    plant_id = zone_row.plant_id

    # Try stored first
    stored = (
        db.query(RiskAssessment)
        .filter((RiskAssessment.zone_id == zone_id) & (RiskAssessment.plant_id == plant_id))
        .order_by(RiskAssessment.timestamp.desc())
        .first()
    )

    if stored:
        result = RiskAssessmentResponse.model_validate(stored)
        result.cost_impact = get_cost_impact(stored.zone_id, stored.risk_level)
        return result

    # Fall back to live evaluation at latest available timestamp
    from db.models import SensorReading
    latest_ts = (
        db.query(func.max(SensorReading.timestamp))
        .filter((SensorReading.zone_id == zone_id) & (SensorReading.plant_id == plant_id))
        .scalar()
    )
    if not latest_ts:
        raise HTTPException(status_code=404, detail=f"No data found for zone '{zone_id}'.")

    assessment = evaluate_zone_at(zone_id, latest_ts, db)
    assessment.id = -1
    result = RiskAssessmentResponse.model_validate(assessment)
    result.cost_impact = get_cost_impact(assessment.zone_id, assessment.risk_level)
    return result


@router.get(
    "/rules",
    summary="Rule registry — all compound rules with descriptions",
)
def get_rules():
    """
    Return the full rule registry: rule IDs, names, weights, categories,
    and plain-English summaries.
    """
    return [
        {
            "rule_id":  r["rule_id"],
            "name":     r["name"],
            "weight":   r["weight"],
            "enabled":  r["enabled"],
            "category": r["category"],
            "summary":  r["summary"],
        }
        for r in RULE_REGISTRY
    ]


@router.get(
    "/intervention/{zone_id}",
    summary="Compute counterfactual minimum intervention to resolve Critical risk",
)
def get_intervention(
    zone_id: str,
    timestamp: Optional[datetime] = Query(None, description="ISO timestamp to evaluate. Defaults to latest reading time."),
    db: Session = Depends(get_db)
):
    try:
        if not timestamp:
            # Resolve zone's plant_id
            zone_row = db.query(Zone).filter(Zone.zone_id == zone_id).first()
            plant_id = zone_row.plant_id if zone_row else DEFAULT_PLANT_ID

            from db.models import SensorReading
            latest = (
                db.query(SensorReading)
                .filter((SensorReading.zone_id == zone_id) & (SensorReading.plant_id == plant_id))
                .order_by(SensorReading.timestamp.desc())
                .first()
            )
            if latest:
                timestamp = latest.timestamp
            else:
                timestamp = datetime.now()

        res = get_minimum_intervention(zone_id, timestamp, db)
        return res
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Intervention engine failed: {str(e)}"
        )


@router.post(
    "/camera/state",
    response_model=RiskAssessmentResponse,
    summary="Update live camera state for a zone and get updated risk assessment",
)
def post_camera_state(state: CameraStateRequest, db: Session = Depends(get_db)):
    # Find zone's plant_id
    zone_row = db.query(Zone).filter(Zone.zone_id == state.zone_id).first()
    if not zone_row:
        raise HTTPException(status_code=404, detail=f"Zone '{state.zone_id}' not found.")
    plant_id = zone_row.plant_id

    LIVE_CCTV_STATE["zone_id"] = state.zone_id
    LIVE_CCTV_STATE["person_detected"] = state.person_detected
    LIVE_CCTV_STATE["ppe_compliant"] = state.ppe_compliant
    LIVE_CCTV_STATE["timestamp"] = datetime.now()

    # Find the latest sensor reading timestamp in the DB for this zone
    from db.models import SensorReading
    latest_row = (
        db.query(SensorReading.timestamp)
        .filter((SensorReading.zone_id == state.zone_id) & (SensorReading.plant_id == plant_id))
        .order_by(SensorReading.timestamp.desc())
        .first()
    )
    eval_ts = latest_row[0] if latest_row else datetime.now()

    # Run the live evaluation
    assessment = evaluate_zone_at(state.zone_id, eval_ts, db)
    assessment.id = -1

    # Inject cost impact
    result = RiskAssessmentResponse.model_validate(assessment)
    result.cost_impact = get_cost_impact(assessment.zone_id, assessment.risk_level)
    return result


@router.get(
    "/compliance/deviations",
    response_model=List[ComplianceDeviationResponse],
    summary="Get active and resolved compliance deviations",
)
def get_compliance_deviations(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Filter by plant_id"),
    db: Session = Depends(get_db)
):
    """
    Check current compliance state against RAG references and return deviation logs.
    """
    from db.models import SensorReading
    latest_ts = db.query(func.max(SensorReading.timestamp)).filter(SensorReading.plant_id == plant_id).scalar()
    if not latest_ts:
        latest_ts = datetime.now()

    # Trigger checker to update DB with any newly drifted deviations
    from risk_engine.compliance import run_compliance_check
    plant_config = get_plant_config(plant_id)
    run_compliance_check(db, latest_ts, plant_config=plant_config)

    from db.models import ComplianceDeviation
    return (
        db.query(ComplianceDeviation)
        .filter(ComplianceDeviation.plant_id == plant_id)
        .order_by(ComplianceDeviation.timestamp.desc())
        .all()
    )


@router.post(
    "/compliance/deviations/{deviation_id}/resolve",
    summary="Mark a compliance audit deviation as resolved",
)
def resolve_compliance_deviation(deviation_id: int, db: Session = Depends(get_db)):
    """
    Mark a flagged deviation as resolved.
    """
    from db.models import ComplianceDeviation
    dev = db.query(ComplianceDeviation).filter(ComplianceDeviation.id == deviation_id).first()
    if not dev:
        raise HTTPException(status_code=404, detail=f"Deviation with ID {deviation_id} not found.")

    dev.resolved = True
    db.commit()
    return {"status": "ok", "message": f"Deviation {deviation_id} resolved successfully."}


# ===========================================================================
# PPE Violation Endpoints (Phase 7C Extension)
# ===========================================================================
from risk_engine.ppe_violations import record_violation, get_violations, update_status as _update_ppe_status


@router.post(
    "/ppe/violation",
    response_model=PPEViolationEvent,
    summary="Record a new PPE violation event from the CCTV panel",
)
def post_ppe_violation(payload: PPEViolationRequest, db: Session = Depends(get_db)):
    """
    Called by the frontend CCTV panel whenever a PPE violation is detected
    (currently manual_override via the toggle; model_inferred once a custom
    PPE model is deployed).

    Looks up the zone name from the DB and stores the event in the in-memory
    violation store.
    """
    zone_row = db.query(Zone).filter(Zone.zone_id == payload.zone_id).first()
    zone_name = zone_row.name if zone_row else payload.zone_id

    event = record_violation(
        zone_id=payload.zone_id,
        zone_name=zone_name,
        plant_id=payload.plant_id,
        ppe_items_missing=payload.ppe_items_missing,
        confidence_pct=payload.confidence_pct,
        detection_method=payload.detection_method,
        risk_score_at_time=payload.risk_score_at_time,
    )
    return event


@router.get(
    "/ppe/violations",
    response_model=List[PPEViolationEvent],
    summary="Get PPE violation events, newest first",
)
def list_ppe_violations(
    plant_id: Optional[str] = Query(None, description="Filter by plant_id"),
    status:   Optional[str] = Query(None, description="Filter by status: open|acknowledged|resolved"),
    limit:    int           = Query(100, ge=1, le=200),
):
    """
    Return the in-memory PPE violation event list, newest first.
    Poll this endpoint from the Main Office frontend panel.
    """
    return get_violations(plant_id=plant_id, status=status, limit=limit)


@router.post(
    "/ppe/violations/{event_id}/acknowledge",
    response_model=PPEViolationEvent,
    summary="Acknowledge a PPE violation event",
)
def acknowledge_ppe_violation(event_id: int):
    """
    Mark a PPE violation as acknowledged (status: open → acknowledged).
    Called by the Main Office panel when a manager reviews the event.
    """
    updated = _update_ppe_status(event_id, "acknowledged")
    if not updated:
        raise HTTPException(status_code=404, detail=f"PPE violation event {event_id} not found.")
    return updated


@router.post(
    "/ppe/violations/{event_id}/resolve",
    response_model=PPEViolationEvent,
    summary="Resolve a PPE violation event",
)
def resolve_ppe_violation(event_id: int):
    """
    Mark a PPE violation as resolved (status: acknowledged|open → resolved).
    Called by the Main Office panel when the violation has been corrected on-site.
    """
    updated = _update_ppe_status(event_id, "resolved")
    if not updated:
        raise HTTPException(status_code=404, detail=f"PPE violation event {event_id} not found.")
    return updated
