"""
risk_engine/scorer.py
=====================
Runs all enabled compound rules against a RiskContext, collects results,
applies the anomaly bump, caps at 100, maps to a risk level, and assembles
the full plain-language explanation paragraph.

Phase 7B additions:
  1. Knowledge graph query — surfaces historical pattern matches in the explanation
  2. Shift fatigue amplifier — adds score bump + explanation when workers are deep
     into a long shift AND at least one compound rule has already fired

Output is a dict ready to be persisted as a RiskAssessment ORM row or
returned directly from an API endpoint.
"""

import json
from datetime import datetime
from typing import Any, Dict, List

from risk_engine.context_builder import RiskContext
from risk_engine.rules_config import RULE_REGISTRY
from risk_engine.anomaly import compute_anomaly
from risk_engine import thresholds as T
from risk_engine.knowledge_graph import (
    query_graph,
    format_graph_explanation,
    infer_hazards_from_context,
    NETWORKX_AVAILABLE,
)


def run_scorer(ctx: RiskContext) -> Dict[str, Any]:
    """
    Evaluate all enabled rules + anomaly detector + knowledge graph + fatigue
    against ctx.

    Returns a dict with keys matching the RiskAssessment ORM columns:
      zone_id, timestamp, risk_score, risk_level, triggered_rules,
      anomaly_flagged, anomaly_zscore, explanation, signal_snapshot
    """
    fired_results    = []
    all_rule_results = []

    # ---- Run each enabled rule ----------------------------------------------
    for rule_entry in RULE_REGISTRY:
        if not rule_entry["enabled"]:
            continue
        result = rule_entry["function"](ctx)
        all_rule_results.append(result)
        if result.fired:
            fired_results.append(result)

    # ---- Sum rule scores ----------------------------------------------------
    base_score = sum(r.score_contribution for r in fired_results)

    # ---- Anomaly detector ---------------------------------------------------
    anomaly_flagged, anomaly_zscore, anomaly_explanation = compute_anomaly(ctx)
    if anomaly_flagged:
        base_score += T.ANOMALY_SCORE_BUMP

    # ---- Phase 7B: Shift fatigue amplifier ----------------------------------
    # Only fires when base_score > 0 (amplifier, not standalone alarm).
    # Preserves the false-positive discipline established in Phase 7A.
    fatigue_bump        = 0
    fatigue_explanation = ""

    if (
        base_score > 0
        and ctx.workers_in_zone >= T.FATIGUE_MIN_WORKERS
        and ctx.max_hours_into_shift >= T.FATIGUE_HOURS_THRESHOLD
    ):
        if ctx.max_hours_into_shift >= T.FATIGUE_HIGH_HOURS:
            fatigue_bump = T.FATIGUE_HIGH_SCORE_BUMP
            fatigue_tier = "HIGH"
        else:
            fatigue_bump = T.FATIGUE_SCORE_BUMP
            fatigue_tier = "MILD"

        base_score += fatigue_bump

        fatigue_explanation = (
            f"[FATIGUE] {ctx.workers_in_zone} worker(s) in {ctx.zone_name} "
            f"are {ctx.max_hours_into_shift:.1f}h into their shift "
            f"({fatigue_tier.lower()} fatigue, shift threshold: {T.FATIGUE_HOURS_THRESHOLD:.0f}h). "
            f"Human error probability and evacuation response time increase significantly "
            f"in the final hours of a long shift — risk weighting increased by {fatigue_bump} points."
        )

    # ---- Phase 7B: Knowledge graph query ------------------------------------
    # Runs regardless of base_score (graph matches are informational even at Low risk).
    # But we only ADD the explanation sentence if base_score > 0 (risk is actually elevated).
    graph_matches      = []
    graph_explanation  = ""

    if NETWORKX_AVAILABLE:
        permit_types    = [p.permit_type for p in ctx.active_permits]
        current_hazards = infer_hazards_from_context(ctx)
        graph_matches   = query_graph(ctx.zone_id, permit_types, current_hazards)
        # Only surface graph explanation when there's an active risk to contextualise
        if base_score > 0 and graph_matches:
            graph_explanation = format_graph_explanation(graph_matches)

    # ---- Cap at 100 ---------------------------------------------------------
    risk_score = min(100.0, round(base_score, 1))

    # ---- Map to level -------------------------------------------------------
    risk_level = T.score_to_level(risk_score)

    # ---- Triggered rule IDs (comma-separated) --------------------------------
    triggered_ids = ",".join(r.rule_id for r in fired_results)

    # ---- Build explanation paragraph ----------------------------------------
    if fired_results or anomaly_flagged:
        rule_sentences: List[str] = [r.explanation for r in fired_results if r.explanation]
        if anomaly_explanation:
            rule_sentences.append(anomaly_explanation)
        # Phase 7B: append fatigue sentence (if fired)
        if fatigue_explanation:
            rule_sentences.append(fatigue_explanation)
        # Phase 7B: append graph sentence (if matches and elevated risk)
        if graph_explanation:
            rule_sentences.append(graph_explanation)

        explanation = (
            f"RISK LEVEL: {risk_level.upper()} (score {risk_score}/100) — "
            f"Zone: {ctx.zone_name} at {ctx.timestamp.strftime('%H:%M:%S')}. "
            + " ".join(rule_sentences)
        )
    else:
        explanation = (
            f"No compound risk conditions detected in {ctx.zone_name} "
            f"at {ctx.timestamp.strftime('%H:%M:%S')}. "
            f"All signals within normal operating parameters."
        )

    # ---- Signal snapshot (for API / audit trail) ----------------------------
    snapshot: Dict[str, Any] = {
        "zone_id":          ctx.zone_id,
        "timestamp":        ctx.timestamp.isoformat(),
        "co_ppm":           ctx.current_reading.co_ppm   if ctx.current_reading else None,
        "h2s_ppm":          ctx.current_reading.h2s_ppm  if ctx.current_reading else None,
        "temperature_c":    ctx.current_reading.temperature_c if ctx.current_reading else None,
        "pressure_kpa":     ctx.current_reading.pressure_kpa  if ctx.current_reading else None,
        "workers_in_zone":  ctx.workers_in_zone,
        "active_permits":   [
            {"permit_ref": p.permit_ref, "permit_type": p.permit_type}
            for p in ctx.active_permits
        ],
        "active_maintenance": [
            {"log_ref": m.log_ref, "activity_type": m.activity_type}
            for m in ctx.active_maintenance
        ],
        "shift":           ctx.current_shift.shift_name if ctx.current_shift else None,
        "minutes_to_next_shift_boundary": (
            round(abs((ctx.next_shift_start - ctx.timestamp).total_seconds() / 60.0), 1)
            if ctx.next_shift_start else None
        ),
        "rules_evaluated": [
            {
                "rule_id": r.rule_id,
                "name":    r.name,
                "fired":   r.fired,
                "score":   r.score_contribution,
            }
            for r in all_rule_results
        ],
        "anomaly_z_score": anomaly_zscore,
        # Phase 7B additions
        "fatigue_hours_into_shift": round(ctx.max_hours_into_shift, 2),
        "fatigue_score_bump":       fatigue_bump,
        "fatigue_worker_count":     ctx.fatigue_worker_count,
        "knowledge_graph_matches":  [
            {
                "scenario_id":    m.scenario_id,
                "scenario_label": m.scenario_label,
                "zone_id":        m.zone_id,
                "is_near_miss":   m.is_near_miss,
                "matched_on":     m.matched_on,
                "match_strength": m.match_strength,
                "description":    m.description,
            }
            for m in graph_matches
        ],
        "knowledge_graph_available": NETWORKX_AVAILABLE,
        # Phase 7C additions
        "cctv_person_detected": getattr(ctx, "cctv_person_detected", False),
        "cctv_ppe_compliant":   getattr(ctx, "cctv_ppe_compliant", True),
    }

    return {
        "plant_id":        ctx.plant_id,
        "zone_id":         ctx.zone_id,
        "timestamp":       ctx.timestamp,
        "risk_score":      risk_score,
        "risk_level":      risk_level,
        "triggered_rules": triggered_ids or None,
        "anomaly_flagged": anomaly_flagged,
        "anomaly_zscore":  anomaly_zscore if anomaly_flagged else None,
        "explanation":     explanation,
        "signal_snapshot": json.dumps(snapshot),
    }
