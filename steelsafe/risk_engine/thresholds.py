"""
risk_engine/thresholds.py
=========================
Single source of truth for every threshold and weight used by the risk engine.

Edit this file to tune the engine without touching rule logic:
  - Raise CO_SECONDARY_PPM to reduce sensitivity in dusty zones
  - Lower RULE_WEIGHTS to reduce a rule's influence on the final score
  - Set ANOMALY_ENABLED = False to disable the statistical layer entirely
  - Adjust CHANGEOVER_BUFFER_MIN if shift handovers take longer/shorter

All values are grounded in OSHA/ACGIH guidelines adapted for coke oven
battery operations at Visakhapatnam Steel Plant conditions.
"""

# ---------------------------------------------------------------------------
# CARBON MONOXIDE thresholds (ppm)
# OSHA PEL: 50 ppm (8-hr TWA); ACGIH TLV-TWA: 25 ppm; IDLH: 1200 ppm
# Coke oven gas contains ~6% CO; local zone levels can spike rapidly.
# ---------------------------------------------------------------------------
CO_SECONDARY_PPM  = 35.0    # "Action level" — above normal but not alarming alone
CO_HIGH_PPM       = 100.0   # Significant exposure risk, especially with permit work
CO_CRITICAL_PPM   = 200.0   # Serious short-exposure risk; warrants evacuation planning
CO_TREND_THRESHOLD_PPM_PER_SAMPLE = 0.4   # ppm rise per 30-s sample = "rising trend"
CO_TREND_WINDOW_SAMPLES = 6              # evaluate slope over last 6 samples (3 minutes)

# ---------------------------------------------------------------------------
# HYDROGEN SULPHIDE thresholds (ppm)
# OSHA ceiling: 20 ppm; ACGIH TLV-TWA: 1 ppm; IDLH: 50 ppm
# H2S is odour-fatiguing — workers stop smelling it before danger passes.
# ---------------------------------------------------------------------------
H2S_SECONDARY_PPM = 5.0     # Above baseline, demands investigation
H2S_HIGH_PPM      = 10.0    # OSHA short-exposure ceiling
H2S_CRITICAL_PPM  = 20.0    # OSHA absolute ceiling; evacuation territory

# ---------------------------------------------------------------------------
# PRESSURE (kPa) — zone_gcm baseline: 103.2 ± 0.8 kPa
# A drop suggests upstream gas leak or header integrity failure.
# ---------------------------------------------------------------------------
PRESSURE_DROP_FROM_BASELINE_KPA = 2.5   # drop below zone mean by this → suspect leak

# ---------------------------------------------------------------------------
# TEMPERATURE deviation — zone_cob1 baseline: 1020°C ± 25°C
# A large deviation from the zone's normal operating temp signals
# abnormal combustion, blocked flue, or oven structural issue.
# ---------------------------------------------------------------------------
TEMP_HIGH_DELTA_C = 50.0    # deviation above zone mean → abnormal combustion

# ---------------------------------------------------------------------------
# WORKER DENSITY — threshold for "cluster" in a gas-affected zone
# ---------------------------------------------------------------------------
WORKER_CLUSTER_THRESHOLD = 4   # workers present in zone within 10 min of eval time

# ---------------------------------------------------------------------------
# SHIFT CHANGEOVER buffer (minutes around each shift boundary)
# During this window, supervision transfers and communication gaps occur.
# ---------------------------------------------------------------------------
CHANGEOVER_BUFFER_MIN = 15

# ---------------------------------------------------------------------------
# TREND DETECTION — window for recent readings used by R1
# ---------------------------------------------------------------------------
TREND_LOOKBACK_SAMPLES = 6   # last 6 × 30s = last 3 minutes

# ---------------------------------------------------------------------------
# COMPOUND Z-SCORE ANOMALY DETECTOR
# Uses L2-norm across (CO, H2S) z-scores. A score above Z_THRESHOLD means
# the combined gas reading is statistically unusual for this zone.
# ---------------------------------------------------------------------------
ANOMALY_ENABLED   = True
Z_THRESHOLD       = 3.0     # flag as anomaly if compound z-score exceeds this
ANOMALY_SCORE_BUMP = 15     # score points added when anomaly detector fires

# ---------------------------------------------------------------------------
# RISK SCORE LEVEL BANDS (0–100 scale)
# ---------------------------------------------------------------------------
LEVEL_LOW      = (0.0,  20.0)   # inclusive lower, exclusive upper
LEVEL_MEDIUM   = (20.0, 45.0)
LEVEL_HIGH     = (45.0, 70.0)
LEVEL_CRITICAL = (70.0, 100.0)

def score_to_level(score: float) -> str:
    """Map a 0–100 score to a risk level label."""
    if score < 20.0:
        return "low"
    elif score < 45.0:
        return "medium"
    elif score < 70.0:
        return "high"
    else:
        return "critical"

# ---------------------------------------------------------------------------
# RULE WEIGHTS
# Each rule contributes this many points if it fires.
# Total max from rules alone: 35+30+20+25+20 = 130 → capped at 100 after
# anomaly bump is added. Weights can be tuned here without touching rule logic.
# ---------------------------------------------------------------------------
RULE_WEIGHTS = {
    "R1": 35,   # Rising gas trend + active hot-work permit   (highest weight — direct ignition risk)
    "R2": 30,   # Confined space entry + elevated gas          (life-safety critical)
    "R3": 20,   # Any active permit + shift changeover          (supervision gap multiplier)
    "R4": 25,   # Gas above high threshold + worker cluster     (mass-exposure risk)
    "R5": 20,   # Pressure drop + any active permit             (leak indicator)
    "R6": 20,   # Elevated gas + any active permit              (general exposure risk)
    "R7": 30,   # CCTV PPE Violation in Elevated Gas Zone       (CCTV safety violation)
}

# ---------------------------------------------------------------------------
# SINGLE-SENSOR ALARM THRESHOLDS
# These are what a traditional system would use. The compound engine is
# evaluated against these to compute "lead time before single-sensor alarm."
# ---------------------------------------------------------------------------
SINGLE_SENSOR_ALARM_CO_PPM  = 100.0   # traditional CO alarm level
SINGLE_SENSOR_ALARM_H2S_PPM = 10.0    # traditional H2S alarm level

# ---------------------------------------------------------------------------
# SHIFT FATIGUE — hours-into-shift risk amplifier (Phase 7B)
# Human error rates and evacuation response times degrade significantly
# beyond 7–8 hours of continuous work in high-hazard industrial settings.
# NIOSH and HSE research confirms fatigue as a leading incident contributing factor.
#
# Design: fatigue is a RISK AMPLIFIER — it only adds score when at least one
# compound rule has already fired. It never creates an alarm on its own.
# This preserves the false-positive discipline established in Phase 7A.
# ---------------------------------------------------------------------------
FATIGUE_HOURS_THRESHOLD  = 7.0   # hours into shift → mild fatigue flag (7–9h)
FATIGUE_HIGH_HOURS       = 9.0   # hours into shift → high fatigue flag (9h+)
FATIGUE_SCORE_BUMP       = 10    # score points added for 7–9h shift depth
FATIGUE_HIGH_SCORE_BUMP  = 20    # score points added for 9h+ shift depth
FATIGUE_MIN_WORKERS      = 1     # min workers in zone for fatigue check to apply

