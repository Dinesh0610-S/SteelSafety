"""
risk_engine/rules_config.py
============================
Rule registry — the authoritative list of all compound rules.

The scorer iterates RULE_REGISTRY to decide which rules to evaluate.
To disable a rule: set "enabled": False.
To adjust influence: change "weight" (scorer uses this, not thresholds.py RULE_WEIGHTS,
so you can override here per-rule without touching the shared thresholds file).

This is the "configurable and readable" layer that makes the explainability
story work in the demo — a safety engineer can read this file and understand
exactly what the engine does.
"""

from risk_engine.rules import (
    evaluate_R1, evaluate_R2, evaluate_R3,
    evaluate_R4, evaluate_R5, evaluate_R6,
    evaluate_R7,
)
from risk_engine import thresholds as T


RULE_REGISTRY = [
    {
        "rule_id":   "R1",
        "name":      "Rising Gas Trend + Active Hot-Work Permit",
        "function":  evaluate_R1,
        "weight":    T.RULE_WEIGHTS["R1"],
        "enabled":   True,
        "category":  "gas_permit_compound",
        "summary":   (
            "CO or H2S rising over the last 3 minutes AND a hot-work permit "
            "is active in the same zone. Open ignition sources near rising gas = critical risk."
        ),
    },
    {
        "rule_id":   "R2",
        "name":      "Confined Space Entry + Elevated Gas",
        "function":  evaluate_R2,
        "weight":    T.RULE_WEIGHTS["R2"],
        "enabled":   True,
        "category":  "gas_permit_compound",
        "summary":   (
            "A confined_space_entry permit is active AND gas is above the "
            "action level. Workers inside confined spaces cannot self-rescue rapidly."
        ),
    },
    {
        "rule_id":   "R3",
        "name":      "Active Permit During Shift Changeover",
        "function":  evaluate_R3,
        "weight":    T.RULE_WEIGHTS["R3"],
        "enabled":   True,
        "category":  "operational_compound",
        "summary":   (
            "Any active permit in the zone AND the current time is within "
            f"{T.CHANGEOVER_BUFFER_MIN} minutes of a shift boundary. "
            "Changeover creates supervision gaps and incomplete hazard handover."
        ),
    },
    {
        "rule_id":   "R4",
        "name":      "High Gas Concentration + Worker Cluster",
        "function":  evaluate_R4,
        "weight":    T.RULE_WEIGHTS["R4"],
        "enabled":   True,
        "category":  "gas_exposure_compound",
        "summary":   (
            f"Gas above high threshold (CO>={T.CO_HIGH_PPM} ppm or "
            f"H2S>={T.H2S_HIGH_PPM} ppm) AND >={T.WORKER_CLUSTER_THRESHOLD} "
            "workers present. Amplifies consequence severity to mass-casualty level."
        ),
    },
    {
        "rule_id":   "R5",
        "name":      "Pressure Drop Below Baseline + Active Permit",
        "function":  evaluate_R5,
        "weight":    T.RULE_WEIGHTS["R5"],
        "enabled":   True,
        "category":  "leak_indicator_compound",
        "summary":   (
            f"Zone pressure drops >={T.PRESSURE_DROP_FROM_BASELINE_KPA} kPa below "
            "the zone's normal operating baseline AND a permit is active. "
            "Pressure drop suggests upstream gas leak or header failure."
        ),
    },
    {
        "rule_id":   "R6",
        "name":      "Elevated Gas + Active Permit",
        "function":  evaluate_R6,
        "weight":    T.RULE_WEIGHTS["R6"],
        "enabled":   True,
        "category":  "gas_permit_compound",
        "summary":   (
            "CO or H2S concentration is elevated above the action level "
            "AND any permit-to-work is active in the same zone. General exposure hazard."
        ),
    },
    {
        "rule_id":   "R7",
        "name":      "CCTV PPE Violation in Elevated Gas Zone",
        "function":  evaluate_R7,
        "weight":    T.RULE_WEIGHTS.get("R7", 30),
        "enabled":   True,
        "category":  "gas_permit_compound",
        "summary":   (
            "CCTV detects worker presence without proper PPE (hard hat) in "
            "a zone where gas concentration is elevated above action level."
        ),
    },
]

# Quick lookup: rule_id → registry entry
RULES_BY_ID = {r["rule_id"]: r for r in RULE_REGISTRY}
