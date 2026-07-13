"""
risk_engine/rules.py
====================
Five compound rule functions — R1 through R5.

Each rule:
  - Takes a RiskContext (no DB calls inside)
  - Returns a RuleResult(fired, score_contribution, explanation)
  - Is self-contained and independently readable/testable
  - Embeds actual sensor values in its explanation string

Rules are designed around the "Vizag incident pattern":
  multiple signals converging in the same zone + time window.
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import List, Optional

from risk_engine.context_builder import RiskContext
from risk_engine import thresholds as T


@dataclass
class RuleResult:
    rule_id:            str
    name:               str
    fired:              bool
    score_contribution: float       # 0 if not fired, else RULE_WEIGHTS[rule_id]
    explanation:        str         # plain-language sentence; empty if not fired


# ---------------------------------------------------------------------------
# Helper: compute CO/H2S rising trend from recent readings
# Returns slope in ppm-per-sample (positive = rising)
# ---------------------------------------------------------------------------
def _compute_co_slope(ctx: RiskContext) -> float:
    """Linear slope of CO over the last N samples (ppm/sample). 0 if insufficient data."""
    readings = ctx.recent_readings
    if len(readings) < 2:
        return 0.0
    co_values = [r.co_ppm for r in readings]
    n = len(co_values)
    # Simple linear regression slope
    x_mean = (n - 1) / 2.0
    y_mean = sum(co_values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(co_values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den > 0 else 0.0


def _compute_h2s_slope(ctx: RiskContext) -> float:
    """Linear slope of H2S over the last N samples (ppm/sample). 0 if insufficient data."""
    readings = ctx.recent_readings
    if len(readings) < 2:
        return 0.0
    h2s_values = [r.h2s_ppm for r in readings]
    n = len(h2s_values)
    x_mean = (n - 1) / 2.0
    y_mean = sum(h2s_values) / n
    num = sum((i - x_mean) * (v - y_mean) for i, v in enumerate(h2s_values))
    den = sum((i - x_mean) ** 2 for i in range(n))
    return num / den if den > 0 else 0.0


def _permit_names(ctx: RiskContext) -> str:
    """Comma-separated permit refs for the explanation string."""
    return ", ".join(p.permit_ref for p in ctx.active_permits) or "unknown"


def _permit_types(ctx: RiskContext) -> list:
    return [p.permit_type for p in ctx.active_permits]


# ===========================================================================
# R1 — Rising Gas Trend + Active Hot-Work Permit
# ===========================================================================
def evaluate_R1(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: CO or H2S is rising (positive slope over last N samples)
    AND a hot_work permit is active in this zone.

    Rationale: A rising gas concentration heading toward an ignition source
    (welding, grinding, open flame) is the core mechanism of the 2025 Vizag
    incident. Neither signal alone would alarm; together they are critical.
    """
    RULE_ID   = "R1"
    RULE_NAME = "Rising Gas Trend + Active Hot-Work Permit"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    co_slope  = _compute_co_slope(ctx)
    h2s_slope = _compute_h2s_slope(ctx)
    has_hotwork = any(p.permit_type == "hot_work" for p in ctx.active_permits)

    # Trend is only significant if the current gas level is also elevated above action levels
    co_elevated_above_normal = ctx.current_reading.co_ppm >= T.CO_SECONDARY_PPM
    h2s_elevated_above_normal = ctx.current_reading.h2s_ppm >= T.H2S_SECONDARY_PPM

    gas_rising = (
        (co_slope >= T.CO_TREND_THRESHOLD_PPM_PER_SAMPLE and co_elevated_above_normal) or
        (h2s_slope >= T.CO_TREND_THRESHOLD_PPM_PER_SAMPLE * 0.05 and h2s_elevated_above_normal)
    )

    fired = gas_rising and has_hotwork

    if fired:
        hw_permits = [p.permit_ref for p in ctx.active_permits if p.permit_type == "hot_work"]
        gas_detail = (
            f"CO is rising at {co_slope:+.2f} ppm/sample"
            if co_slope >= T.CO_TREND_THRESHOLD_PPM_PER_SAMPLE
            else f"H2S is rising at {h2s_slope:+.3f} ppm/sample"
        )
        explanation = (
            f"[R1] {gas_detail} in {ctx.zone_name}. "
            f"Hot-work permit(s) active: {', '.join(hw_permits)}. "
            f"Rising gas concentration toward an ignition source is a critical compound hazard. "
            f"Current: CO={ctx.current_reading.co_ppm:.1f} ppm, "
            f"H2S={ctx.current_reading.h2s_ppm:.2f} ppm."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R1"] if fired else 0.0, explanation)


# ===========================================================================
# R2 — Confined Space Entry Permit + Elevated Gas
# ===========================================================================
def evaluate_R2(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: A confined_space_entry permit is active AND gas reading
    is above the secondary (action-level) threshold.

    Rationale: Confined space entry with elevated ambient gas is a
    life-threatening condition. Workers cannot self-rescue from a confined
    space in the event of rapid gas build-up; the permit represents people
    physically inside a hazardous enclosure.
    """
    RULE_ID   = "R2"
    RULE_NAME = "Confined Space Entry + Elevated Gas"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    has_cse = any(p.permit_type == "confined_space_entry" for p in ctx.active_permits)
    co_elevated  = ctx.current_reading.co_ppm  >= T.CO_SECONDARY_PPM
    h2s_elevated = ctx.current_reading.h2s_ppm >= T.H2S_SECONDARY_PPM

    fired = has_cse and (co_elevated or h2s_elevated)

    if fired:
        cse_permits = [p.permit_ref for p in ctx.active_permits if p.permit_type == "confined_space_entry"]
        gas_msg = []
        if co_elevated:
            gas_msg.append(f"CO={ctx.current_reading.co_ppm:.1f} ppm (action level: {T.CO_SECONDARY_PPM} ppm)")
        if h2s_elevated:
            gas_msg.append(f"H2S={ctx.current_reading.h2s_ppm:.2f} ppm (action level: {T.H2S_SECONDARY_PPM} ppm)")
        explanation = (
            f"[R2] Confined space entry permit active in {ctx.zone_name} "
            f"(permit: {', '.join(cse_permits)}) while gas is elevated: "
            f"{'; '.join(gas_msg)}. "
            f"Workers inside a confined space cannot self-rescue if gas concentration escalates rapidly."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R2"] if fired else 0.0, explanation)


# ===========================================================================
# R3 — Any Active Permit + Shift Changeover Window
# ===========================================================================
def evaluate_R3(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: Any active permit in this zone AND the current time is within
    CHANGEOVER_BUFFER_MIN of a shift boundary (start or end).

    Rationale: Shift changeover is a known high-risk window in industrial
    operations. Incoming crew may not be fully briefed on active permits,
    ongoing gas readings, or in-progress maintenance. The 2025 Vizag incident
    report cited handover communication failure as a contributing factor.
    """
    RULE_ID   = "R3"
    RULE_NAME = "Active Permit During Shift Changeover"

    if not ctx.active_permits or ctx.next_shift_start is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    boundary = ctx.next_shift_start
    minutes_to_boundary = abs((boundary - ctx.timestamp).total_seconds()) / 60.0
    in_changeover = minutes_to_boundary <= T.CHANGEOVER_BUFFER_MIN

    fired = bool(ctx.active_permits) and in_changeover

    if fired:
        direction = "before" if boundary > ctx.timestamp else "after"
        permit_refs = _permit_names(ctx)
        explanation = (
            f"[R3] Shift changeover is {minutes_to_boundary:.0f} min {direction} this evaluation "
            f"in {ctx.zone_name}. Active permit(s): {permit_refs}. "
            f"Incoming crew may not be briefed on the current hazard state — "
            f"handover communication gap is a key escalation risk."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R3"] if fired else 0.0, explanation)


# ===========================================================================
# R4 — Gas Above High Threshold + Worker Cluster
# ===========================================================================
def evaluate_R4(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: Gas concentration is above the HIGH threshold AND
    WORKER_CLUSTER_THRESHOLD or more workers are present in the zone.

    Rationale: A single person in elevated gas can self-evacuate; a cluster
    of workers faces mass-casualty risk. The worker density amplifies the
    consequence severity of any gas event.
    """
    RULE_ID   = "R4"
    RULE_NAME = "High Gas Concentration + Worker Cluster"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    co_high  = ctx.current_reading.co_ppm  >= T.CO_HIGH_PPM
    h2s_high = ctx.current_reading.h2s_ppm >= T.H2S_HIGH_PPM
    cluster  = ctx.workers_in_zone >= T.WORKER_CLUSTER_THRESHOLD

    fired = (co_high or h2s_high) and cluster

    if fired:
        gas_msg = []
        if co_high:
            gas_msg.append(f"CO={ctx.current_reading.co_ppm:.1f} ppm (>={T.CO_HIGH_PPM} threshold)")
        if h2s_high:
            gas_msg.append(f"H2S={ctx.current_reading.h2s_ppm:.2f} ppm (>={T.H2S_HIGH_PPM} threshold)")
        explanation = (
            f"[R4] Gas exceeds high threshold in {ctx.zone_name}: {'; '.join(gas_msg)}. "
            f"{ctx.workers_in_zone} workers are present in the zone "
            f"(cluster threshold: {T.WORKER_CLUSTER_THRESHOLD}). "
            f"Mass-exposure risk — immediate evacuation and headcount required."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R4"] if fired else 0.0, explanation)


# ===========================================================================
# R5 — Pressure Drop + Any Active Permit
# ===========================================================================
def evaluate_R5(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: Zone pressure has dropped significantly below its baseline mean
    AND any permit is active in the zone.

    Rationale: In a gas collection main or pressurised oven system, a pressure
    drop below normal operating range indicates a possible upstream leak or
    header integrity failure. Combining this with active permit work (people
    in the zone) creates immediate risk of gas exposure.
    Primarily relevant to zone_gcm (Gas Collection Main).
    """
    RULE_ID   = "R5"
    RULE_NAME = "Pressure Drop Below Baseline + Active Permit"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    pressure_drop = ctx.zone_pressure_mean - ctx.current_reading.pressure_kpa
    significant_drop = pressure_drop >= T.PRESSURE_DROP_FROM_BASELINE_KPA

    fired = significant_drop and bool(ctx.active_permits)

    if fired:
        permit_refs = _permit_names(ctx)
        explanation = (
            f"[R5] Pressure in {ctx.zone_name} has dropped {pressure_drop:.1f} kPa "
            f"below the zone baseline ({ctx.zone_pressure_mean:.1f} kPa). "
            f"Current pressure: {ctx.current_reading.pressure_kpa:.1f} kPa. "
            f"A pressure drop of this magnitude may indicate a gas leak or header failure. "
            f"Active permit(s) in zone: {permit_refs} — personnel are at risk."
        )
    else:
        explanation = ""
    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R5"] if fired else 0.0, explanation)


# ===========================================================================
# R6 — Elevated Gas + Any Active Permit
# ===========================================================================
def evaluate_R6(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: Gas concentration is elevated above action level
    AND any permit-to-work is active in the zone.

    Rationale: Work is active (meaning people are performing hands-on tasks)
    in a zone where gas is elevated. While not as critical as confined space
    or hot work, any permit work in elevated gas presents a heightened risk
    that warrants awareness and closer supervision.
    """
    RULE_ID   = "R6"
    RULE_NAME = "Elevated Gas + Active Permit"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    co_elevated  = ctx.current_reading.co_ppm  >= T.CO_SECONDARY_PPM
    h2s_elevated = ctx.current_reading.h2s_ppm >= T.H2S_SECONDARY_PPM
    has_permit   = len(ctx.active_permits) > 0

    fired = (co_elevated or h2s_elevated) and has_permit

    if fired:
        permit_refs = _permit_names(ctx)
        gas_msg = []
        if co_elevated:
            gas_msg.append(f"CO={ctx.current_reading.co_ppm:.1f} ppm (>={T.CO_SECONDARY_PPM} action level)")
        if h2s_elevated:
            gas_msg.append(f"H2S={ctx.current_reading.h2s_ppm:.2f} ppm (>={T.H2S_SECONDARY_PPM} action level)")
        explanation = (
            f"[R6] Gas concentration is elevated in {ctx.zone_name}: {'; '.join(gas_msg)}. "
            f"Active permit(s) in zone: {permit_refs}. "
            f"Performing active work in elevated gas represents a general exposure hazard."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS["R6"] if fired else 0.0, explanation)


# ===========================================================================
# R7 — CCTV PPE Violation in Elevated Gas Zone
# ===========================================================================
def evaluate_R7(ctx: RiskContext) -> RuleResult:
    """
    COMPOUND: CCTV detects worker presence in zone AND worker is violating PPE
    compliance (no hard hat) AND gas concentration is elevated above action level.

    Rationale: If a worker is detected on CCTV in an elevated gas zone without
    essential PPE (like a hard hat), the risk of acute injury or inhalation
    exposure increases significantly because of the lack of safety discipline
    or emergency preparation.
    """
    RULE_ID   = "R7"
    RULE_NAME = "CCTV PPE Violation in Elevated Gas Zone"

    if ctx.current_reading is None:
        return RuleResult(RULE_ID, RULE_NAME, False, 0.0, "")

    # Check context fields (added in Phase 7C)
    person_detected = getattr(ctx, "cctv_person_detected", False)
    ppe_compliant   = getattr(ctx, "cctv_ppe_compliant", True)

    co_elevated  = ctx.current_reading.co_ppm  >= T.CO_SECONDARY_PPM
    h2s_elevated = ctx.current_reading.h2s_ppm >= T.H2S_SECONDARY_PPM

    # Violation: person is present but not compliant
    violation = person_detected and not ppe_compliant
    fired = violation and (co_elevated or h2s_elevated)

    if fired:
        gas_msg = []
        if co_elevated:
            gas_msg.append(f"CO={ctx.current_reading.co_ppm:.1f} ppm (>={T.CO_SECONDARY_PPM} action level)")
        if h2s_elevated:
            gas_msg.append(f"H2S={ctx.current_reading.h2s_ppm:.2f} ppm (>={T.H2S_SECONDARY_PPM} action level)")

        explanation = (
            f"[R7] CCTV camera in {ctx.zone_name} detected worker(s) present without proper PPE (hard hat) "
            f"while gas is elevated: {'; '.join(gas_msg)}. "
            f"Active worker presence without PPE in a hazardous zone is an immediate safety violation."
        )
    else:
        explanation = ""

    return RuleResult(RULE_ID, RULE_NAME, fired, T.RULE_WEIGHTS.get("R7", 30) if fired else 0.0, explanation)

