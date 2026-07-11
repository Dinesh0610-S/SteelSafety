"""
risk_engine/comparison.py
==========================
Detector comparison engine — runs both the compound risk engine and the
naive single-sensor baseline against all scripted scenarios, then computes
a comparison table suitable for pitch deck presentation.
Scopes queries to the active plant_id.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any

from sqlalchemy.orm import Session
from db.models import SensorReading, RiskAssessment
from plants.registry import get_plant_config, DEFAULT_PLANT_ID
from risk_engine.baseline import evaluate_baseline
from risk_engine import thresholds as T


def _first_compound_flag(
    plant_id:   str,
    zone_id:    str,
    start:      datetime,
    end:        datetime,
    db:         Session,
) -> Optional[datetime]:
    """
    Scan stored RiskAssessment rows for a zone window and return the timestamp
    of the first High or Critical assessment. Returns None if never flagged.
    """
    row: Optional[RiskAssessment] = (
        db.query(RiskAssessment)
        .filter(
            RiskAssessment.plant_id  == plant_id,
            RiskAssessment.zone_id   == zone_id,
            RiskAssessment.timestamp >= start,
            RiskAssessment.timestamp <= end,
            RiskAssessment.risk_level.in_(["high", "critical"]),
        )
        .order_by(RiskAssessment.timestamp)
        .first()
    )
    return row.timestamp if row else None


def _peak_compound_level(
    plant_id: str,
    zone_id: str,
    start:   datetime,
    end:     datetime,
    db:      Session,
) -> tuple[float, str]:
    """
    Return (peak_score, peak_level) for a compound engine evaluation window.
    Used for the near-miss check.
    """
    rows: List[RiskAssessment] = (
        db.query(RiskAssessment)
        .filter(
            RiskAssessment.plant_id  == plant_id,
            RiskAssessment.zone_id   == zone_id,
            RiskAssessment.timestamp >= start,
            RiskAssessment.timestamp <= end,
        )
        .all()
    )
    if not rows:
        return (0.0, "low")
    best = max(rows, key=lambda r: r.risk_score)
    return (best.risk_score, best.risk_level)


def _first_baseline_flag(
    plant_id: str,
    zone_id: str,
    start:   datetime,
    end:     datetime,
    db:      Session,
) -> Optional[datetime]:
    """
    Scan every 30-second sensor timestamp in the scenario window and find
    the first timestamp where the baseline detector fires. Returns None if
    the baseline never fires during the window.
    """
    # Pull all sensor timestamps in the scenario window for this zone
    timestamps: List[SensorReading] = (
        db.query(SensorReading)
        .filter(
            SensorReading.plant_id  == plant_id,
            SensorReading.zone_id   == zone_id,
            SensorReading.timestamp >= start,
            SensorReading.timestamp <= end,
        )
        .order_by(SensorReading.timestamp)
        .all()
    )

    for sr in timestamps:
        result = evaluate_baseline(zone_id, sr.timestamp, db)
        if result.fired:
            return sr.timestamp

    return None


def _count_false_positives(
    plant_id:         str,
    scenario_windows: List[Dict[str, Any]],
    all_timestamps:   List[datetime],
    all_zone_ids:     List[str],
    db:               Session,
) -> Dict[str, int]:
    """
    Count evaluations during "safe" periods (outside all scenario windows)
    that produced false alarms for each detector.
    """
    compound_fp = 0
    baseline_fp = 0
    safe_evals  = 0

    # Build a fast lookup set of (zone_id, timestamp_str) inside scenario windows
    scenario_set: set = set()
    for sw in scenario_windows:
        t = sw["start"]
        while t <= sw["end"]:
            scenario_set.add((sw["zone_id"], t))
            t += timedelta(seconds=30)

    for ts in all_timestamps:
        for zone_id in all_zone_ids:
            if (zone_id, ts) in scenario_set:
                continue  # Skip scenario windows — those are true positives

            safe_evals += 1

            # Compound engine false positive
            row = (
                db.query(RiskAssessment)
                .filter(
                    RiskAssessment.plant_id  == plant_id,
                    RiskAssessment.zone_id   == zone_id,
                    RiskAssessment.timestamp == ts,
                    RiskAssessment.risk_level.in_(["high", "critical"]),
                )
                .first()
            )
            if row:
                compound_fp += 1

            # Baseline false positive
            baseline_result = evaluate_baseline(zone_id, ts, db)
            if baseline_result.fired:
                baseline_fp += 1

    return {
        "compound_false_positives": compound_fp,
        "baseline_false_positives": baseline_fp,
        "safe_evaluations":         safe_evals,
    }


def run_comparison(db: Session, t0: Optional[datetime] = None, plant_id: str = DEFAULT_PLANT_ID) -> Dict[str, Any]:
    """
    Run the full detector comparison across all scripted scenarios for the given plant.
    """
    # Look up plant configuration
    plant_config = get_plant_config(plant_id)
    scenarios = plant_config["scenarios"]
    zones = plant_config["zones"]
    all_zone_ids = [z["zone_id"] for z in zones]

    # --- Infer T0 from the database if not provided -------------------------
    if t0 is None:
        earliest: Optional[SensorReading] = (
            db.query(SensorReading)
            .filter(SensorReading.plant_id == plant_id)
            .order_by(SensorReading.timestamp)
            .first()
        )
        if earliest is None:
            return {"error": f"No sensor data in database for plant '{plant_id}'. Run POST /admin/regenerate first."}
        t0 = earliest.timestamp

    # --- Get all unique timestamps for false-positive counting ---------------
    all_ts_rows = (
        db.query(SensorReading.timestamp)
        .filter(SensorReading.plant_id == plant_id)
        .distinct()
        .order_by(SensorReading.timestamp)
        .all()
    )
    all_timestamps = [row[0] for row in all_ts_rows]

    # --- Build scenario window metadata for false-positive exclusion ---------
    scenario_windows_meta = []
    for sc in scenarios:
        sc_start = t0 + timedelta(seconds=sc["start_offset_s"])
        sc_end   = sc_start + timedelta(seconds=sc["duration_s"])
        scenario_windows_meta.append({
            "zone_id": sc["zone_id"],
            "start":   sc_start,
            "end":     sc_end,
        })

    # --- Per-scenario comparison rows ----------------------------------------
    comparison_rows = []
    for sc in scenarios:
        sc_start = t0 + timedelta(seconds=sc["start_offset_s"])
        sc_end   = sc_start + timedelta(seconds=sc["duration_s"])
        zone_id  = sc["zone_id"]
        is_near_miss = sc.get("self_resolve", False)

        # Compound engine: first High/Critical flag
        compound_first = _first_compound_flag(plant_id, zone_id, sc_start, sc_end, db)

        # Baseline detector: first fire
        baseline_first = _first_baseline_flag(plant_id, zone_id, sc_start, sc_end, db)

        # Lead time calculation (positive = compound was earlier)
        lead_time_minutes: Optional[float] = None
        if compound_first and baseline_first:
            lead_time_minutes = round(
                (baseline_first - compound_first).total_seconds() / 60.0, 1
            )
        elif compound_first and not baseline_first:
            # Compound detected it; baseline NEVER fired → treat as maximum advantage
            lead_time_minutes = round(sc["duration_s"] / 60.0, 1)
        elif not compound_first and baseline_first:
            # Baseline fired first (or compound missed entirely)
            lead_time_minutes = None

        # Near-miss check: what was the peak compound score?
        peak_score, peak_level = _peak_compound_level(plant_id, zone_id, sc_start, sc_end, db)

        # Near-miss discipline result:
        near_miss_result = None
        if is_near_miss:
            near_miss_result = {
                "peak_score":       round(peak_score, 1),
                "peak_level":       peak_level,
                "discipline_pass":  peak_level in ("low", "medium"),
                "compound_flagged": compound_first is not None,
                "baseline_fired":   baseline_first is not None,
            }

        comparison_rows.append({
            "scenario_id":         sc["scenario_id"],
            "label":               sc["label"],
            "zone_id":             zone_id,
            "is_near_miss":        is_near_miss,
            "scenario_start":      sc_start.isoformat(),
            "scenario_end":        sc_end.isoformat(),
            "compound_first_flag": compound_first.isoformat() if compound_first else None,
            "baseline_first_flag": baseline_first.isoformat() if baseline_first else None,
            "lead_time_minutes":   lead_time_minutes,
            "near_miss_result":    near_miss_result,
        })

    # --- False positive summary (computed over safe periods only) -------------
    fp_summary = _count_false_positives(
        plant_id, scenario_windows_meta, all_timestamps, all_zone_ids, db
    )

    safe_evals = fp_summary["safe_evaluations"]
    compound_fp = fp_summary["compound_false_positives"]
    baseline_fp = fp_summary["baseline_false_positives"]

    # --- Aggregate lead time stats -------------------------------------------
    valid_lead_times = [
        row["lead_time_minutes"]
        for row in comparison_rows
        if row["lead_time_minutes"] is not None and not row["is_near_miss"]
    ]
    avg_lead_time = round(sum(valid_lead_times) / len(valid_lead_times), 1) if valid_lead_times else None

    return {
        "t0":                  t0.isoformat(),
        "total_scenarios":     len(scenarios),
        "incident_scenarios":  sum(1 for sc in scenarios if not sc.get("self_resolve", False)),
        "near_miss_scenarios": sum(1 for sc in scenarios if sc.get("self_resolve", False)),
        "comparison_rows":     comparison_rows,
        "aggregate": {
            "avg_compound_lead_time_minutes": avg_lead_time,
            "scenarios_compound_detected":    sum(
                1 for r in comparison_rows
                if r["compound_first_flag"] and not r["is_near_miss"]
            ),
            "scenarios_baseline_missed":      sum(
                1 for r in comparison_rows
                if not r["baseline_first_flag"] and not r["is_near_miss"]
            ),
        },
        "false_positive_summary": {
            "safe_period_evaluations":        safe_evals,
            "compound_false_positives":       compound_fp,
            "baseline_false_positives":       baseline_fp,
            "compound_fp_rate_pct":           round(compound_fp / safe_evals * 100, 3) if safe_evals else 0,
            "baseline_fp_rate_pct":           round(baseline_fp / safe_evals * 100, 3) if safe_evals else 0,
        },
        "near_miss_discipline": [
            r["near_miss_result"]
            for r in comparison_rows
            if r["is_near_miss"] and r["near_miss_result"] is not None
        ],
    }
