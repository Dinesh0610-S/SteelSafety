"""
Incident scenario specifications — Phase 7A: 6-scenario library.

Each scenario defines a time window (offset in seconds from T0) and a zone
where multiple safety signals converge. The raw data is tagged with scenario_id
in the DB but scenario_id is NOT exposed via the API — it exists purely so
Phase 2 ML/risk logic can query and label training windows.

Scenario design inspired by the 2025 Visakhapatnam Steel Plant gas incident
pattern: rising gas concentration + active high-risk permit + operational
pressure (shift change or maintenance activity) + workers present in zone.

Phase 7A additions:
  scenario_4 — Gas leak building slowly during normal operations
  scenario_5 — Equipment overheat combined with overdue maintenance
  scenario_6 — Near-miss pattern: builds up but resolves without crossing
                critical threshold (tests false-positive discipline)
"""

from datetime import timedelta

# ---------------------------------------------------------------------------
# Each scenario entry:
#   scenario_id   — unique string tag written to DB rows
#   zone_id       — which zone the anomaly is in
#   start_offset  — seconds from T0 when the scenario begins
#   duration_s    — how long the scenario lasts (seconds)
#   label         — short human-readable name
#   description   — human-readable summary (for README / documentation)
#   sensor_spike  — dict of sensor overrides during the window
#                     Each value is (mean, std, trend_per_sample) — trend adds
#                     a linear ramp across the scenario window
#   permit_type   — the concurrent permit that makes it dangerous
#   maintenance_activity — what maintenance is concurrently active
#   worker_cluster_size  — how many workers to cluster into this zone
#   self_resolve  — (optional) if True, spike reverses in the second half
#                   to simulate a hazard that naturally dissipates
# ---------------------------------------------------------------------------

SCENARIOS = [
    # ==========================================================================
    # SCENARIO 1 — Gas Main Pressure Drop + Hot Work
    # Original Phase 1 scenario. Direct parallel to the 2025 Vizag incident.
    # ==========================================================================
    {
        "scenario_id":   "scenario_1",
        "zone_id":       "zone_gcm",
        "label":         "Gas Main Pressure Drop + Hot Work",
        "description": (
            "A hairline crack develops in the gas offtake header causing rapid CO "
            "accumulation (150–300 ppm) and a pressure drop of 4–8 kPa. "
            "Simultaneously, a hot-work permit is active for welding on an adjacent "
            "line, and 3 workers are present in the zone — a near-identical pre-cursor "
            "pattern to the 2025 Vizag incident."
        ),
        "start_offset_s": 2 * 3600,           # T0 + 2 hours
        "duration_s":     45 * 60,             # 45 minutes
        "sensor_spike": {
            "co_ppm":       (180.0, 35.0, 2.5),   # (mean, std, ppm rise per sample)
            "h2s_ppm":      (4.5,    0.8, 0.05),
            "temperature_c":(64.0,   6.0, 0.0),
            "pressure_kpa": (97.5,   0.9, -0.04),  # negative trend = pressure dropping
        },
        "permit_type":           "hot_work",
        "maintenance_activity":  "Welding — Gas Offtake Flange Repair",
        "worker_cluster_size":   3,
        "self_resolve":          False,
    },

    # ==========================================================================
    # SCENARIO 2 — H2S Spike + Confined Space Entry + Shift Changeover
    # Original Phase 1 scenario. Blocked gas offtake valve during handover.
    # ==========================================================================
    {
        "scenario_id":   "scenario_2",
        "zone_id":       "zone_cob1",
        "label":         "H2S Spike + Confined Space Entry + Shift Changeover",
        "description": (
            "H2S concentration spikes to 12–25 ppm (IDLH threshold: 50 ppm) in "
            "Coke Oven Battery 1 due to a blocked gas offtake valve during the "
            "B→C shift changeover. A confined space entry permit is active for "
            "inspection of an oven standpipe. Temperature deviation of +80°C "
            "indicates abnormal combustion. Handover communication gap leaves "
            "incoming crew unaware of gas build-up."
        ),
        "start_offset_s": 4 * 3600 + 30 * 60,  # T0 + 4h 30m
        "duration_s":     45 * 60,              # 45 minutes
        "sensor_spike": {
            "co_ppm":       (35.0,  8.0,  0.3),
            "h2s_ppm":      (14.0,  3.5,  0.2),   # rising H2S
            "temperature_c":(1085.0, 20.0, 0.5),  # above-normal temp
            "pressure_kpa": (101.0,  0.7,  0.0),
        },
        "permit_type":           "confined_space_entry",
        "maintenance_activity":  "Oven Standpipe Inspection — Camera Survey",
        "worker_cluster_size":   5,
        "self_resolve":          False,
    },

    # ==========================================================================
    # SCENARIO 3 — CO Build-up + Expired PTW + Worker Cluster
    # Original Phase 1 scenario. Oven lid seal failure during larry car repairs.
    # ==========================================================================
    {
        "scenario_id":   "scenario_3",
        "zone_id":       "zone_ca",
        "label":         "CO Build-up + Expired PTW + Worker Cluster",
        "description": (
            "CO builds from 80 to 200 ppm over 45 minutes in the Charging Area "
            "as an oven lid seal failure allows gas to escape during a charging "
            "cycle. A cold-work permit that should have been closed 30 minutes "
            "ago remains open. An active maintenance crew of 5+ workers is "
            "clustered in the zone performing larry car track repairs, unaware "
            "of the gas build-up due to delayed alarm escalation."
        ),
        "start_offset_s": 6 * 3600 + 15 * 60,  # T0 + 6h 15m
        "duration_s":     45 * 60,              # 45 minutes
        "sensor_spike": {
            "co_ppm":       (120.0, 25.0, 1.8),  # steadily rising CO
            "h2s_ppm":      (1.2,   0.3,  0.01),
            "temperature_c":(52.0,  6.0,  0.1),
            "pressure_kpa": (100.3, 0.4,  0.0),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Larry Car Track Inspection and Repair",
        "worker_cluster_size":   6,
        "self_resolve":          False,
    },

    # ==========================================================================
    # SCENARIO 4 — Gas Leak Building Slowly During Normal Operations (NEW)
    # Demonstrates compound engine catching slow-onset leaks the baseline misses.
    # The CO rises gradually from normal (22 ppm) toward 85 ppm across 60 minutes.
    # Single-sensor alarm at 100 ppm is NEVER reached — baseline fires nothing.
    # Compound engine fires via R1 (rising trend + hot-work) + R5 (pressure drop).
    # ==========================================================================
    {
        "scenario_id":   "scenario_4",
        "zone_id":       "zone_gcm",
        "label":         "Slow Gas Leak During Active Hot-Work Permit",
        "description": (
            "A pinhole leak develops in a gas main flanged joint during routine "
            "operations. CO rises slowly from 22 ppm (baseline) toward 85 ppm over "
            "60 minutes — never reaching the traditional 100 ppm single-sensor alarm "
            "level. Simultaneously a hot-work permit is active for flange bolt tightening, "
            "and a gradual pressure drop of 3 kPa indicates upstream leak propagation. "
            "The compound engine detects the converging trend+pressure+permit pattern "
            "within the first 12 minutes; the baseline detector fires no alarm."
        ),
        "start_offset_s": 1 * 3600,             # T0 + 1 hour
        "duration_s":     60 * 60,              # 60 minutes
        "sensor_spike": {
            "co_ppm":       (55.0, 12.0, 0.9),   # peaks ~85 ppm, never hits 100
            "h2s_ppm":      (3.2,  0.6,  0.02),
            "temperature_c":(63.0,  5.0,  0.0),
            "pressure_kpa": (100.5, 0.8, -0.025), # slow pressure drop; baseline: 103.2
        },
        "permit_type":           "hot_work",
        "maintenance_activity":  "Flanged Joint Bolt Tightening — Preventive Maintenance",
        "worker_cluster_size":   4,
        "self_resolve":          False,
    },

    # ==========================================================================
    # SCENARIO 5 — Equipment Overheat + Overdue Maintenance (NEW)
    # Demonstrates compound engine catching non-gas signals the baseline ignores.
    # Temperature spikes +100°C above baseline, combined with active cold_work permit.
    # No gas exceeds single-sensor thresholds — baseline detects nothing.
    # Compound engine fires via R3 (permit + shift changeover) + R6 (elevated gas).
    # ==========================================================================
    {
        "scenario_id":   "scenario_5",
        "zone_id":       "zone_cob1",
        "label":         "Equipment Overheat + Overdue Maintenance Activity",
        "description": (
            "A blocked combustion flue causes oven temperature to spike from "
            "1020°C (normal) to 1120°C (+100°C above baseline) over 40 minutes. "
            "Abnormal combustion produces slightly elevated CO (38–50 ppm) and H2S "
            "(2.5 ppm) — above action levels but below single-sensor alarm thresholds. "
            "A cold-work permit for oven crown inspection remains active past its "
            "scheduled closure during the shift changeover window, creating a "
            "supervision gap. Compound engine flags High risk via R3+R6+anomaly; "
            "the baseline detector fires no alarm as CO stays below 100 ppm."
        ),
        "start_offset_s": 3 * 3600,             # T0 + 3 hours
        "duration_s":     40 * 60,              # 40 minutes
        "sensor_spike": {
            "co_ppm":       (44.0,  8.0,  0.5),   # above CO_SECONDARY_PPM (35), not CO_HIGH (100)
            "h2s_ppm":      (2.5,   0.5,  0.02),
            "temperature_c":(1100.0, 15.0, 0.8),  # +80°C above baseline mean (1020)
            "pressure_kpa": (100.2,  0.5,  0.0),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Oven Crown Inspection — Thermal Camera Survey",
        "worker_cluster_size":   4,
        "self_resolve":          False,
    },

    # ==========================================================================
    # SCENARIO 6 — Near-Miss: CO Build-up That Self-Resolves (NEW)
    # Tests false-positive discipline. CO rises toward but STAYS BELOW 35 ppm
    # action level. Compound engine should stay ≤ Low/Medium (score < 45).
    # Baseline detector stays silent (CO < 100 ppm, H2S < 10 ppm).
    # This is the critical validation: if the compound engine over-reacts here,
    # it proves it would cause alarm fatigue — the exact problem it's designed to solve.
    # ==========================================================================
    {
        "scenario_id":   "scenario_6",
        "zone_id":       "zone_qt",
        "label":         "Near-Miss: CO Build-up Resolves Without Crossing Critical Threshold",
        "description": (
            "During quench car maintenance, CO readings in the Quenching Tower rise "
            "from baseline (8 ppm) to a peak of approximately 28–32 ppm over 25 minutes, "
            "then naturally decay back to normal levels over the following 25 minutes as "
            "the quench cycle completes and ventilation restores atmospheric balance. "
            "No permit is active and only 2 workers are present. CO never crosses the "
            "35 ppm action level; H2S remains normal (< 2 ppm). "
            "A correctly-calibrated compound engine should stay below Medium risk — "
            "demonstrating it does NOT cause false alarms on transient, self-resolving "
            "gas fluctuations. This validates false-positive discipline critical to "
            "real-world operator trust."
        ),
        "start_offset_s": 5 * 3600 + 30 * 60,  # T0 + 5h 30m
        "duration_s":     50 * 60,              # 50 minutes total (25 rise, 25 decay)
        "sensor_spike": {
            # Peak ~30 ppm CO — stays BELOW CO_SECONDARY_PPM = 35 ppm
            # self_resolve=True causes the spike to invert in the second half
            "co_ppm":       (24.0,  4.0,  0.3),   # peaks ~32 ppm in first half, then decays
            "h2s_ppm":      (1.1,   0.2,  0.01),  # stays entirely normal
            "temperature_c":(56.0,  8.0,  0.0),
            "pressure_kpa": (99.9,  0.4,  0.0),
        },
        "permit_type":           "cold_work",   # a low-risk routine permit (cold work only)
        "maintenance_activity":  "Quench Car Brake Adjustment — Routine",
        "worker_cluster_size":   2,             # small crew, below WORKER_CLUSTER_THRESHOLD (4)
        "self_resolve":          True,          # spike reverses in second half → natural decay
    },
]

# Lookup: zone_id → list of scenarios active in that zone
SCENARIOS_BY_ZONE: dict = {}
for s in SCENARIOS:
    SCENARIOS_BY_ZONE.setdefault(s["zone_id"], []).append(s)
