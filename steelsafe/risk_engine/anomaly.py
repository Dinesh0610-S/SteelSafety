"""
risk_engine/anomaly.py
======================
Z-score based statistical anomaly detector.

Uses a compound z-score (L2-norm across CO and H2S z-scores) relative to
each zone's known normal baseline (from ZONE_SENSOR_BASELINES).

Why z-score instead of Isolation Forest:
  - No training step or saved model file required
  - Fully explainable: "CO reading is 4.3 standard deviations above this
    zone's normal" is something a safety officer understands immediately
  - Works with zero additional dependencies (numpy already installed)
  - Phase 3 can upgrade to Isolation Forest once real historical data exists

The detector is additive: it bumps the rule-based score by ANOMALY_SCORE_BUMP
if triggered. It never overrides the rule explanations — it adds a sentence.
"""

import math
from risk_engine.context_builder import RiskContext
from risk_engine import thresholds as T


def compute_anomaly(ctx: RiskContext) -> tuple[bool, float, str]:
    """
    Compute compound z-score anomaly for the current sensor reading.

    Returns:
        (flagged: bool, z_score: float, explanation: str)
        - flagged: True if compound z-score >= Z_THRESHOLD
        - z_score: the computed compound z-score (0.0 if no reading)
        - explanation: sentence to append to the main explanation, or ""
    """
    if not T.ANOMALY_ENABLED or ctx.current_reading is None:
        return False, 0.0, ""

    reading = ctx.current_reading

    # Individual z-scores for CO and H2S
    z_co  = (reading.co_ppm  - ctx.zone_co_mean)  / ctx.zone_co_std
    z_h2s = (reading.h2s_ppm - ctx.zone_h2s_mean) / ctx.zone_h2s_std

    # Compound z-score: L2-norm (Euclidean distance from the normal operating point)
    compound_z = math.sqrt(z_co ** 2 + z_h2s ** 2)

    flagged = compound_z >= T.Z_THRESHOLD

    if flagged:
        explanation = (
            f"[Anomaly] Statistical detector flagged this reading: compound z-score={compound_z:.2f} "
            f"(threshold={T.Z_THRESHOLD}). "
            f"CO is {z_co:+.1f} standard deviations from zone mean "
            f"({reading.co_ppm:.1f} ppm vs normal {ctx.zone_co_mean:.1f} ppm); "
            f"H2S is {z_h2s:+.1f} sigma "
            f"({reading.h2s_ppm:.2f} ppm vs normal {ctx.zone_h2s_mean:.2f} ppm)."
        )
    else:
        explanation = ""

    return flagged, round(compound_z, 3), explanation
