"""
plants/plant_b.py
=================
Plant B configuration — Rolling Mill Complex.
5 zones with rolling-mill-specific hazards and 4 incident scenarios.
Runs through the identical risk engine, RAG, and compliance stack as Plant A.
"""

PLANT_ID = "plant_rolling_mill"

ZONES = [
    {
        "zone_id":     "zone_rhf",
        "name":        "Reheating Furnace",
        "description": (
            "Walking-beam reheating furnace operating at 1150–1250°C, heating "
            "steel billets prior to rolling. High CO/NOx emissions from combustion. "
            "Risk of furnace pressure excursion and billet ejection. Strict burner "
            "management and PTW required for any internal access."
        ),
        "area_type":   "High Risk",
        "max_workers": 8,
    },
    {
        "zone_id":     "zone_rs",
        "name":        "Rolling Stand",
        "description": (
            "Multi-stand hot rolling mill processing billets at 900–1100°C. "
            "Hydraulic systems under high pressure (~250 bar). Risk of hydraulic "
            "oil fire near hot billet, cobble (runaway billet), and entanglement "
            "hazards around roller gaps. No access during rolling operations."
        ),
        "area_type":   "High Risk",
        "max_workers": 10,
    },
    {
        "zone_id":     "zone_cb",
        "name":        "Cooling Bed",
        "description": (
            "Hot rolled sections are laid on the cooling bed for controlled air "
            "cooling. Scale (iron oxide) accumulates in pits below — confined space "
            "risk for cleaning crews. Temperature of sections 400–600°C at entry. "
            "Burn hazard without thermal PPE."
        ),
        "area_type":   "Medium Risk",
        "max_workers": 12,
    },
    {
        "zone_id":     "zone_fl",
        "name":        "Finishing Line",
        "description": (
            "Straightening, cutting, and bundling of cooled sections. Mechanical "
            "hazards from shears and bundling equipment. Dust accumulation from "
            "scale grinding. Noise levels typically 85–95 dB. Medium mechanical "
            "risk; mandatory hearing and eye protection."
        ),
        "area_type":   "Medium Risk",
        "max_workers": 15,
    },
    {
        "zone_id":     "zone_cr2",
        "name":        "Mill Control Room",
        "description": (
            "Centralised automation and PLC control room for the rolling mill "
            "sequence. Air-conditioned and positive-pressure. Low hazard — "
            "houses rolling schedule, speed control panels, and CCTV feeds."
        ),
        "area_type":   "Low Risk",
        "max_workers": 5,
    },
]

ZONE_SENSOR_BASELINES = {
    "zone_rhf": {
        "co_ppm":        (12.0,  3.0),
        "h2s_ppm":       (0.2,   0.05),
        "temperature_c": (1180.0, 40.0),
        "pressure_kpa":  (101.8,  0.5),
    },
    "zone_rs": {
        "co_ppm":        (6.0,   2.0),
        "h2s_ppm":       (0.1,   0.05),
        "temperature_c": (95.0,  18.0),
        "pressure_kpa":  (100.5,  0.4),
    },
    "zone_cb": {
        "co_ppm":        (4.0,   1.5),
        "h2s_ppm":       (0.15,  0.05),
        "temperature_c": (55.0,  15.0),
        "pressure_kpa":  (100.0,  0.3),
    },
    "zone_fl": {
        "co_ppm":        (3.0,   1.0),
        "h2s_ppm":       (0.1,   0.04),
        "temperature_c": (38.0,   8.0),
        "pressure_kpa":  (100.2,  0.3),
    },
    "zone_cr2": {
        "co_ppm":        (2.0,   0.5),
        "h2s_ppm":       (0.05,  0.02),
        "temperature_c": (23.0,   1.5),
        "pressure_kpa":  (101.5,  0.2),
    },
}

SCENARIOS = [
    # =========================================================================
    # SCENARIO A — Hydraulic Oil Leak + Hot Billet + Open-Flame Permit
    # High-pressure hydraulic line failure adjacent to a hot billet pass.
    # =========================================================================
    {
        "scenario_id":   "rm_scenario_a",
        "zone_id":       "zone_rs",
        "label":         "Hydraulic Oil Leak Near Hot Billet + Hot Work Permit",
        "description": (
            "A hydraulic line ruptures in the rolling stand area, spraying oil onto "
            "a hot billet at 950°C — auto-ignition risk. Simultaneously, a hot-work "
            "permit is active for torch-cutting a bearing housing nearby."
        ),
        "start_offset_s": 2 * 3600,
        "duration_s":     35 * 60,
        "sensor_spike": {
            "co_ppm":       (65.0,  15.0, 1.5),
            "h2s_ppm":      (0.3,    0.1,  0.01),
            "temperature_c":(140.0,  25.0,  2.5),
            "pressure_kpa": (100.2,   0.5,  0.0),
        },
        "permit_type":           "hot_work",
        "maintenance_activity":  "Torch-Cutting — Bearing Housing Replacement",
        "worker_cluster_size":   4,
        "self_resolve":          False,
    },
    # =========================================================================
    # SCENARIO B — Scale Pit Buildup + Confined Space Entry
    # Scale pit beneath cooling bed requires manual cleaning — CS risk.
    # =========================================================================
    {
        "scenario_id":   "rm_scenario_b",
        "zone_id":       "zone_cb",
        "label":         "Scale Pit Buildup + Confined Space Entry",
        "description": (
            "Scale accumulation in the cooling bed pit exceeds safe levels, requiring "
            "crew entry for manual cleaning. CO has built up in the confined pit. "
            "CSE permit active, but atmospheric test was 45 minutes ago."
        ),
        "start_offset_s": 4 * 3600,
        "duration_s":     40 * 60,
        "sensor_spike": {
            "co_ppm":       (38.0,   8.0,  1.2),
            "h2s_ppm":      (0.4,    0.1,  0.02),
            "temperature_c":(68.0,  12.0,  0.0),
            "pressure_kpa": (99.8,   0.4,  0.0),
        },
        "permit_type":           "confined_space_entry",
        "maintenance_activity":  "Scale Pit Manual Clearance",
        "worker_cluster_size":   3,
        "self_resolve":          False,
    },
    # =========================================================================
    # SCENARIO C — Roll Bearing Overheat + Overdue Maintenance
    # Progressive bearing failure during high-load rolling schedule.
    # =========================================================================
    {
        "scenario_id":   "rm_scenario_c",
        "zone_id":       "zone_rs",
        "label":         "Roll Bearing Overheat + Overdue Maintenance",
        "description": (
            "Work-roll bearing temperature exceeds 180°C (normal: 85°C) indicating "
            "lubrication failure. PM for this bearing assembly was 21 days overdue. "
            "Continued operation risks catastrophic bearing seizure and cobble event."
        ),
        "start_offset_s": 5 * 3600 + 30 * 60,
        "duration_s":     45 * 60,
        "sensor_spike": {
            "co_ppm":       (15.0,  4.0,   0.3),
            "h2s_ppm":      (0.2,   0.05,  0.0),
            "temperature_c":(185.0, 30.0,   3.0),
            "pressure_kpa": (100.5,  0.4,   0.0),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Work-Roll Bearing Inspection (21 DAYS OVERDUE)",
        "worker_cluster_size":   5,
        "self_resolve":          False,
    },
    # =========================================================================
    # SCENARIO D — Near-Miss: Furnace Pressure Excursion, Self-Resolves
    # Tests false-positive discipline — hazard builds then dissipates.
    # =========================================================================
    {
        "scenario_id":   "rm_scenario_d",
        "zone_id":       "zone_rhf",
        "label":         "Near-Miss: Furnace Pressure Excursion (Self-Resolving)",
        "description": (
            "Reheating furnace draft control fluctuation causes transient positive "
            "pressure, pushing flue gases into the work area. Recovers after operator "
            "manual intervention within 15 minutes."
        ),
        "start_offset_s": 3 * 3600,
        "duration_s":     25 * 60,
        "sensor_spike": {
            "co_ppm":       (42.0,  10.0,  1.0),
            "h2s_ppm":      (0.3,    0.08,  0.01),
            "temperature_c":(1210.0, 50.0,   0.0),
            "pressure_kpa": (103.5,   0.6,   0.05),
        },
        "permit_type":           "cold_work",
        "maintenance_activity":  "Furnace Draft Damper Adjustment",
        "worker_cluster_size":   2,
        "self_resolve":          True,
    },
]

PLANT_B_CONFIG = {
    "plant_id":   PLANT_ID,
    "name":       "Rolling Mill Complex — Unit 2",
    "short_name": "Rolling Mill",
    "zones":      ZONES,
    "baselines":  ZONE_SENSOR_BASELINES,
    "scenarios":  SCENARIOS,
}
