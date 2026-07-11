"""
risk_engine/intervention.py
===========================
Calculates hypothetical modified states (counterfactuals) to find the minimum
intervention required to bring a Critical zone's risk score under safety thresholds.
"""

from copy import deepcopy
from datetime import datetime
from typing import Dict, Any
from sqlalchemy.orm import Session

from risk_engine.context_builder import build_context
from risk_engine.scorer import run_scorer

def get_minimum_intervention(zone_id: str, timestamp: datetime, db: Session) -> Dict[str, Any]:
    """
    Simulates counterfactual safety changes for a flagged zone to find the
    smallest single action that reduces the compound risk score below 70 (Critical).
    """
    # 1. Build original context
    ctx = build_context(zone_id, timestamp, db)
    
    # 2. Run original scorer
    orig_res = run_scorer(ctx)
    orig_score = orig_res["risk_score"]
    
    # If the zone is already low/medium risk, no intervention is needed
    if orig_score < 70:
        return {
            "action": "Routine operations. Maintain standard gas safety checklists.",
            "projected_score": orig_score,
            "original_score": orig_score,
            "feasible": True
        }
        
    candidates = []
    
    # ---- Scenario A: Close Active Permits ----
    if ctx.active_permits:
        ctx_a = deepcopy(ctx)
        ctx_a.active_permits = []
        res_a = run_scorer(ctx_a)
        candidates.append({
            "action": "Suspend active permit-to-work (PTW) operations in this zone",
            "projected_score": res_a["risk_score"],
            "complexity": 1
        })
        
    # ---- Scenario B: Suspend Maintenance ----
    if ctx.active_maintenance:
        ctx_b = deepcopy(ctx)
        ctx_b.active_maintenance = []
        res_b = run_scorer(ctx_b)
        candidates.append({
            "action": "Suspend active maintenance activities in this zone",
            "projected_score": res_b["risk_score"],
            "complexity": 2
        })
        
    # ---- Scenario C: Evacuate Workers ----
    if ctx.workers_in_zone > 0:
        ctx_c = deepcopy(ctx)
        ctx_c.workers_in_zone = 0
        res_c = run_scorer(ctx_c)
        candidates.append({
            "action": "Evacuate all personnel from this zone",
            "projected_score": res_c["risk_score"],
            "complexity": 3
        })
        
    # ---- Scenario D: Gas Isolation (restore baseline) ----
    if ctx.current_reading:
        ctx_d = deepcopy(ctx)
        if ctx_d.current_reading:
            ctx_d.current_reading.co_ppm = ctx_d.zone_co_mean
            ctx_d.current_reading.h2s_ppm = ctx_d.zone_h2s_mean
            # Reset pressure and temperature to means
            ctx_d.current_reading.pressure_kpa = ctx_d.zone_pressure_mean
            ctx_d.current_reading.temperature_c = ctx_d.zone_temp_mean
        ctx_d.recent_readings = []  # clear trend
        res_d = run_scorer(ctx_d)
        candidates.append({
            "action": "Isolate gas headers to clear raw leaks and restore baseline atmosphere",
            "projected_score": res_d["risk_score"],
            "complexity": 4
        })

    # Filter candidates that reduce risk score below Critical threshold (70)
    successful = [c for c in candidates if c["projected_score"] < 70]
    
    if not successful:
        # If no single intervention works, recommend the most effective one
        if candidates:
            candidates.sort(key=lambda x: x["projected_score"])
            best = candidates[0]
            return {
                "action": f"Safety Shut Down required: {best['action']}",
                "projected_score": best["projected_score"],
                "original_score": orig_score,
                "feasible": False
            }
        else:
            return {
                "action": "Emergency plant evacuation and battery shutdown required",
                "projected_score": 0.0,
                "original_score": orig_score,
                "feasible": False
            }

    # Sort successful candidates by complexity (lowest first) to find "minimum" intervention
    successful.sort(key=lambda x: (x["complexity"], x["projected_score"]))
    best = successful[0]
    
    return {
        "action": best["action"],
        "projected_score": best["projected_score"],
        "original_score": orig_score,
        "feasible": True
    }
