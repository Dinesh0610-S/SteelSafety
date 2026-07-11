"""
plants/plant_a.py
=================
Plant A configuration — Coke Oven Battery Unit (Vizag).
This wraps the existing Zone and Scenario definitions so the engine
can treat them identically to any other plant_config dict.
"""

PLANT_ID = "plant_coke_oven"

ZONES = [
    {
        "zone_id":     "zone_cob1",
        "name":        "Coke Oven Battery 1",
        "description": (
            "Primary carbonisation battery with 67 ovens operating at 1000–1100°C. "
            "High risk of CO and H2S release during charging, pushing, and levelling operations. "
            "Requires continuous gas monitoring and strict PTW enforcement."
        ),
        "area_type":   "High Risk",
        "max_workers": 12,
    },
    {
        "zone_id":     "zone_gcm",
        "name":        "Gas Collection Main",
        "description": (
            "Gas offtake headers and ascension pipes collecting raw coke oven gas "
            "(COG: ~55% H2, ~25% CH4, ~6% CO). Volatile pressure fluctuations common. "
            "Any hot-work in this zone requires special isolation and gas freeing certificate."
        ),
        "area_type":   "High Risk",
        "max_workers": 6,
    },
    {
        "zone_id":     "zone_qt",
        "name":        "Quenching Tower",
        "description": (
            "Wet quenching station where red-hot coke is cooled with water. "
            "Steam plumes carry H2S and particulates. Confined spaces present "
            "in lower drainage channels."
        ),
        "area_type":   "Medium Risk",
        "max_workers": 8,
    },
    {
        "zone_id":     "zone_ca",
        "name":        "Charging Area",
        "description": (
            "Coal charging platform above the ovens. Workers operate larry cars "
            "and charge lids. High dust and CO exposure during charging cycles. "
            "Strict PPE and gas detector requirements."
        ),
        "area_type":   "High Risk",
        "max_workers": 10,
    },
    {
        "zone_id":     "zone_cr",
        "name":        "Control Room",
        "description": (
            "Central monitoring and control facility. Air-pressurised to prevent "
            "gas ingress. Low hazard rating — houses DCS panels, CCTV, and "
            "communication systems for the battery."
        ),
        "area_type":   "Low Risk",
        "max_workers": 6,
    },
]

ZONE_SENSOR_BASELINES = {
    "zone_cob1": {
        "co_ppm":        (18.0,  4.0),
        "h2s_ppm":       (1.8,   0.4),
        "temperature_c": (1020.0, 25.0),
        "pressure_kpa":  (100.5,  0.6),
    },
    "zone_gcm": {
        "co_ppm":        (22.0,  5.0),
        "h2s_ppm":       (2.5,   0.5),
        "temperature_c": (62.0,   8.0),
        "pressure_kpa":  (103.2,  0.8),
    },
    "zone_qt": {
        "co_ppm":        (8.0,   2.0),
        "h2s_ppm":       (0.9,   0.2),
        "temperature_c": (55.0,  10.0),
        "pressure_kpa":  (99.8,   0.5),
    },
    "zone_ca": {
        "co_ppm":        (15.0,  4.0),
        "h2s_ppm":       (0.7,   0.2),
        "temperature_c": (48.0,   8.0),
        "pressure_kpa":  (100.1,  0.4),
    },
    "zone_cr": {
        "co_ppm":        (3.0,   0.8),
        "h2s_ppm":       (0.1,   0.05),
        "temperature_c": (24.0,   1.5),
        "pressure_kpa":  (101.3,  0.2),
    },
}

SCENARIOS = [
    {
        "scenario_id":   "scenario_1",
        "zone_id":       "zone_gcm",
        "label":         "Gas Main Pressure Drop + Hot Work",
        "description": (
            "A hairline crack develops in the gas offtake header causing rapid CO "
            "accumulation (150–300 ppm) and a pressure drop of 4–8 kPa. "
            "Simultaneously, a hot-work permit is active for welding on an adjacent "
            "line, and 3 workers are present in the zone."
        ),
        "start_offset_s": 2 * 3600,
        "duration_s":     45 * 60,
        "sensor_spike": {
            "co_ppm":       (180.0, 35.0, 2.5),
            "h2s_ppm":      (4.5,    0.8, 0.05),
            "temperature_c":(64.0,   6.0, 0.0),
            "pressure_kpa": (97.5,   0.9, -0.04),
        },
        "permit_type":           "hot_work",
        "maintenance_activity":  "Welding — Gas Offtake Flange Repair",
        "worker_cluster_size":   3,
        "self_resolve":          False,
    },
    {
        "scenario_id":   "scenario_2",
        "zone_id":       "zone_cob1",
        "label":         "H2S Spike + Confined Space Entry + Shift Changeover",
        "description": (
            "H2S concentration spikes to 12–25 ppm in Coke Oven Battery 1 due to a "
            "blocked gas offtake valve during the A→B shift handover."
        ),
        "start_offset_s": 4 * 3600,
        "duration_s":     30 * 60,
        "sensor_spike": {
            "co_ppm":       (25.0,  6.0,  0.2),
            "h2s_ppm":      (18.0,  4.0,  0.15),
            "temperature_c":(1025.0, 30.0, 0.0),
            "pressure_kpa": (100.8,  0.6,  0.0),
        },
        "permit_type":           "confined_space_entry",
        "maintenance_activity":  "Gas Offtake Valve Replacement",
        "worker_cluster_size":   5,
        "self_resolve":          False,
    },
    {
        "scenario_id":   "scenario_3",
        "zone_id":       "zone_qt",
        "label":         "Quench Tower Steam Surge + Maintenance Overlap",
        "description": (
            "Unexpected high-temperature coke batch causes steam surge in the quench "
            "tower. Simultaneously, a cold-work permit is active for pump maintenance."
        ),
        "start_offset_s": 6 * 3600,
        "duration_s":     20 * 60,
        "sensor_spike": {
            "co_ppm":       (20.0,  4.0,  0.3),
            "h2s_ppm":      (3.5,   0.7,  0.08),
            "temperature_c":(95.0,  12.0,  0.5),
            "pressure_kpa": (98.5,   0.8, -0.02),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Pump Bearing Replacement",
        "worker_cluster_size":   4,
        "self_resolve":          False,
    },
    {
        "scenario_id":   "scenario_4",
        "zone_id":       "zone_gcm",
        "label":         "Gas Leak Building Slowly During Normal Operations",
        "description": (
            "A slow gas leak develops in a flanged joint, gradually accumulating CO "
            "over a 30-minute window without triggering single-sensor alarms."
        ),
        "start_offset_s": 1 * 3600,
        "duration_s":     30 * 60,
        "sensor_spike": {
            "co_ppm":       (45.0,  10.0, 1.8),
            "h2s_ppm":      (1.8,    0.4,  0.02),
            "temperature_c":(63.0,   7.0,  0.0),
            "pressure_kpa": (102.5,   0.7, -0.02),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Pipe Insulation Inspection",
        "worker_cluster_size":   2,
        "self_resolve":          False,
    },
    {
        "scenario_id":   "scenario_5",
        "zone_id":       "zone_ca",
        "label":         "Equipment Overheat + Overdue Maintenance",
        "description": (
            "Larry car motor overheats during charging operations. The preventive "
            "maintenance for this equipment was 14 days overdue."
        ),
        "start_offset_s": 5 * 3600,
        "duration_s":     40 * 60,
        "sensor_spike": {
            "co_ppm":       (30.0,  8.0,  0.4),
            "h2s_ppm":      (1.2,   0.3,  0.01),
            "temperature_c":(85.0,  15.0,  1.2),
            "pressure_kpa": (100.3,  0.5,  0.0),
        },
        "permit_type":           "hot_work",
        "maintenance_activity":  "Larry Car Motor Overhaul (OVERDUE)",
        "worker_cluster_size":   6,
        "self_resolve":          False,
    },
    {
        "scenario_id":   "scenario_6",
        "zone_id":       "zone_cob1",
        "label":         "Near-Miss: Builds Up But Resolves Without Crossing Critical",
        "description": (
            "CO rises steadily but remains below critical threshold. Self-resolves "
            "after 15 min — tests false-positive discipline of the compound engine."
        ),
        "start_offset_s": 3 * 3600,
        "duration_s":     30 * 60,
        "sensor_spike": {
            "co_ppm":       (38.0,  6.0,  0.8),
            "h2s_ppm":      (2.0,   0.4,  0.01),
            "temperature_c":(1022.0, 22.0,  0.0),
            "pressure_kpa": (100.4,  0.5,  0.0),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Routine Inspection",
        "worker_cluster_size":   2,
        "self_resolve":          True,
    },
]

PLANT_A_CONFIG = {
    "plant_id":   PLANT_ID,
    "name":       "Coke Oven Battery Unit — Vizag",
    "short_name": "Coke Oven Unit",
    "zones":      ZONES,
    "baselines":  ZONE_SENSOR_BASELINES,
    "scenarios":  SCENARIOS,
}
