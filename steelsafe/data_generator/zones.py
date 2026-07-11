"""
Zone definitions — the 5 named areas of the simulated coke oven battery plant.
These are inserted as static reference rows into the `zones` table.
"""

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

# Quick lookup dict — zone_id → zone metadata dict
ZONES_BY_ID: dict = {z["zone_id"]: z for z in ZONES}

# Sensor baseline config per zone — (mean, std) tuples for (CO, H2S, Temp, Pressure)
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
