"""
api/routes/report.py
======================
Phase 9: Shift Briefing Report endpoint.

GET  /api/v1/report/shift-briefing
    Generates a structured JSON shift handover report aggregating:
    - Current risk status for all zones
    - Active permits (ones open at evaluation time)
    - Active compliance deviations
    - Open PPE violation events
    - TTD forecasts for all zones
    - Knowledge graph incident pattern matches (if any zones are elevated)

The JSON response is designed to be rendered client-side as a printable
summary that shift supervisors can review or print at handover.
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from datetime import datetime

from db.database import get_db
from db.models import (
    SensorReading, Zone, Permit, WorkerLocation,
    ComplianceDeviation, RiskAssessment
)
from plants.registry import DEFAULT_PLANT_ID, get_plant_config
from risk_engine.engine import evaluate_all_zones
from risk_engine.forecaster import forecast_all_zones
from risk_engine.ppe_violations import get_violations

router = APIRouter(prefix="/report", tags=["Report (Phase 9)"])


@router.get(
    "/shift-briefing",
    summary="Generate a structured shift handover safety briefing",
)
def get_shift_briefing(
    plant_id: str = Query(DEFAULT_PLANT_ID, description="Plant to generate report for"),
    db: Session = Depends(get_db),
):
    """
    Returns a complete structured shift handover safety briefing containing:
    - Zone-by-zone risk status
    - Active permits at evaluation time
    - Open compliance deviations
    - Open PPE violation events
    - Predictive TTD forecasts
    - Summary headline and action items
    - Report metadata (generated_at, plant_name, total_workers_on_site)
    """
    plant_config = get_plant_config(plant_id)
    plant_name   = plant_config["name"] if plant_config else plant_id
    now          = datetime.now()

    # ---------- 1. Latest sensor timestamp for this plant ----------
    latest_ts = (
        db.query(func.max(SensorReading.timestamp))
        .filter(SensorReading.plant_id == plant_id)
        .scalar()
    ) or now

    # ---------- 2. Zone risk assessments ----------
    assessments = evaluate_all_zones(latest_ts, db, plant_id=plant_id)
    zone_rows = db.query(Zone).filter(Zone.plant_id == plant_id).all()
    zone_name_map = {z.zone_id: z.name for z in zone_rows}

    zone_risks = []
    critical_zones = []
    high_zones     = []

    for a in assessments:
        entry = {
            "zone_id":         a.zone_id,
            "zone_name":       zone_name_map.get(a.zone_id, a.zone_id),
            "risk_score":      round(a.risk_score, 1),
            "risk_level":      a.risk_level,
            "triggered_rules": a.triggered_rules,
            "explanation":     a.explanation,
        }
        zone_risks.append(entry)
        if a.risk_level == "critical":
            critical_zones.append(zone_name_map.get(a.zone_id, a.zone_id))
        elif a.risk_level == "high":
            high_zones.append(zone_name_map.get(a.zone_id, a.zone_id))

    zone_risks.sort(key=lambda x: x["risk_score"], reverse=True)

    # ---------- 3. Active permits ----------
    active_permits = (
        db.query(Permit)
        .filter(
            (Permit.plant_id  == plant_id) &
            (Permit.start_time <= latest_ts) &
            (Permit.end_time   >= latest_ts) &
            (Permit.status     != "expired")
        )
        .all()
    )

    permits_list = [
        {
            "permit_ref":  p.permit_ref,
            "zone_id":     p.zone_id,
            "zone_name":   zone_name_map.get(p.zone_id, p.zone_id),
            "permit_type": p.permit_type,
            "issued_to":   p.issued_to,
            "status":      p.status,
            "start_time":  p.start_time.isoformat(),
            "end_time":    p.end_time.isoformat(),
        }
        for p in active_permits
    ]

    # ---------- 4. Active compliance deviations ----------
    active_devs = (
        db.query(ComplianceDeviation)
        .filter(
            (ComplianceDeviation.plant_id == plant_id) &
            (ComplianceDeviation.resolved == False)
        )
        .order_by(ComplianceDeviation.timestamp.desc())
        .all()
    )

    compliance_list = [
        {
            "id":                     d.id,
            "category":               d.category,
            "deviation_type":         d.deviation_type,
            "description":            d.description,
            "severity":               d.severity,
            "corrective_action":      d.corrective_action,
            "regulatory_requirement": d.regulatory_requirement,
            "citation":               d.citation,
            "zone_id":                d.zone_id,
            "zone_name":              zone_name_map.get(d.zone_id, d.zone_id) if d.zone_id else "Plant-wide",
        }
        for d in active_devs
    ]

    # Compute compliance score
    deductions = sum(
        15 if d.severity == "high" else 10 if d.severity == "medium" else 5
        for d in active_devs
    )
    compliance_score = max(0, 100 - deductions)

    # ---------- 5. Open PPE violations ----------
    ppe_open = get_violations(plant_id=plant_id, status="open", limit=50)
    ppe_acknowledged = get_violations(plant_id=plant_id, status="acknowledged", limit=20)

    # ---------- 6. Predictive TTD forecasts ----------
    forecasts = forecast_all_zones(db, plant_id=plant_id, lookback=30)
    imminent_forecasts = [f for f in forecasts if f["alert_level"] == "imminent"]
    warning_forecasts  = [f for f in forecasts if f["alert_level"] == "warning"]

    # ---------- 7. Workers on site ----------
    five_min_ago = datetime.fromtimestamp(latest_ts.timestamp() - 300)
    worker_rows = (
        db.query(WorkerLocation)
        .filter(
            (WorkerLocation.plant_id  == plant_id) &
            (WorkerLocation.timestamp >= five_min_ago) &
            (WorkerLocation.timestamp <= latest_ts)
        )
        .all()
    )
    unique_workers = len({w.worker_id for w in worker_rows})

    # ---------- 8. Headline & Action items ----------
    action_items = []

    if critical_zones:
        action_items.append({
            "priority": "CRITICAL",
            "action":   f"Immediate evacuation review required in: {', '.join(critical_zones)}. "
                        "Verify gas levels, suspend active permits, and contact safety officer.",
        })

    if high_zones:
        action_items.append({
            "priority": "HIGH",
            "action":   f"Elevated risk in: {', '.join(high_zones)}. "
                        "Increase monitoring frequency to every 5 minutes.",
        })

    if imminent_forecasts:
        zones_ttd = ", ".join(
            f"{f['zone_name']} ({f['overall_ttd_minutes']:.0f} min)"
            for f in imminent_forecasts
        )
        action_items.append({
            "priority": "CRITICAL",
            "action":   f"Gas trend projections show imminent threshold breach in: {zones_ttd}. "
                        "Initiate preemptive gas isolation and standby evacuation.",
        })

    if ppe_open:
        action_items.append({
            "priority": "HIGH",
            "action":   f"{len(ppe_open)} open PPE violation(s) must be acknowledged "
                        "before incoming shift begins work.",
        })

    high_sev_devs = [d for d in compliance_list if d["severity"] == "high"]
    if high_sev_devs:
        action_items.append({
            "priority": "HIGH",
            "action":   f"{len(high_sev_devs)} high-severity compliance deviation(s) require "
                        "corrective action within 24 hours.",
        })

    if not action_items:
        action_items.append({
            "priority": "INFO",
            "action":   "All systems nominal. Standard monitoring protocols apply.",
        })

    if critical_zones or imminent_forecasts:
        headline = f"⚠️ CRITICAL SAFETY ALERT — Action required before handover."
    elif high_zones or warning_forecasts or ppe_open:
        headline = "⚡ ELEVATED RISK — Enhanced monitoring required. Review action items."
    else:
        headline = "✅ NOMINAL — Plant operating within safe parameters."

    return {
        "report_type":        "shift_briefing",
        "generated_at":       now.isoformat(),
        "evaluation_time":    latest_ts.isoformat(),
        "plant_id":           plant_id,
        "plant_name":         plant_name,
        "workers_on_site":    unique_workers,
        "headline":           headline,
        "compliance_score":   compliance_score,

        "zone_risks":         zone_risks,
        "active_permits":     permits_list,
        "compliance_gaps":    compliance_list,
        "ppe_violations_open":        ppe_open,
        "ppe_violations_acknowledged": ppe_acknowledged,
        "forecasts":          forecasts,
        "action_items":       action_items,

        "summary": {
            "critical_zones":    critical_zones,
            "high_zones":        high_zones,
            "active_permits":    len(permits_list),
            "compliance_gaps":   len(compliance_list),
            "ppe_open":          len(ppe_open),
            "forecast_imminent": len(imminent_forecasts),
            "forecast_warning":  len(warning_forecasts),
            "workers_on_site":   unique_workers,
        }
    }
