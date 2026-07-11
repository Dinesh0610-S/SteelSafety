"""
Maintenance activity log generator — Phase 8B: multi-plant parameterised.

Accepts plant_config and tags all MaintenanceLog rows with plant_id.
Log refs are prefixed per plant to avoid unique-constraint collisions.
Historical compliance-seed logs are now scoped to the first zone of each plant.
"""

import random
from datetime import datetime, timedelta
from typing import List

from db.models import MaintenanceLog

NORMAL_ACTIVITIES = [
    "Routine Gas Detector Calibration",
    "Valve Lubrication and Torque Check",
    "Flange Bolt Tightening Inspection",
    "Fire Hydrant Pressure Test",
    "Electrical Panel Thermography",
    "Conveyor Belt Tension Adjustment",
    "Hydraulic System Leak Check",
    "Cooling Water Line Flush",
    "Pump Bearing Replacement",
    "Control Valve Actuator Test",
    "Pressure Relief Valve Inspection",
    "Instrument Air Compressor Service",
]

TECHNICIANS = [
    "E. Ranga Rao",      "F. Satyanarayana", "G. Murali Krishna",
    "H. Venkateswara",   "I. Surya Rao",     "J. Nageswara",
    "K. Siva Prasad",    "L. Ramesh Babu",   "M. Hari Prasad",
    "N. Krishna Murthy", "O. Satish Kumar",  "P. Rajasekhar",
]


def _make_log_ref(plant_id: str, index: int) -> str:
    prefix = "COK" if "coke" in plant_id else "RML"
    return f"MNT-{prefix}-{index:04d}"


def generate_maintenance_logs(
    t0: datetime,
    shift_duration_s: int,
    rng: random.Random,
    plant_config: dict,
) -> List[MaintenanceLog]:
    """
    Generate maintenance activity logs for a full shift.

    Strategy:
    - 2–4 normal maintenance jobs per zone, random windows within the shift
    - 1 scenario-correlated job per incident scenario, overlapping the window
    - Historical calibration + audit logs seeded for compliance audit (Phase 8A)
    """
    plant_id  = plant_config["plant_id"]
    zones     = plant_config["zones"]
    scenarios = plant_config["scenarios"]

    records: List[MaintenanceLog] = []
    log_index = 1

    # ----- Normal maintenance -----------------------------------------------
    for zone in zones:
        zid = zone["zone_id"]
        num_jobs = rng.randint(2, 4)
        for _ in range(num_jobs):
            start_offset = rng.randint(0, shift_duration_s - 1800)
            duration_s   = rng.randint(20 * 60, 90 * 60)
            start_time   = t0 + timedelta(seconds=start_offset)
            end_time     = start_time + timedelta(seconds=duration_s)

            records.append(MaintenanceLog(
                plant_id      = plant_id,
                log_ref       = _make_log_ref(plant_id, log_index),
                zone_id       = zid,
                activity_type = rng.choice(NORMAL_ACTIVITIES),
                technician    = rng.choice(TECHNICIANS),
                start_time    = start_time,
                end_time      = end_time,
                notes         = None,
                scenario_id   = None,
            ))
            log_index += 1

    # ----- Scenario-tagged maintenance jobs ---------------------------------
    for sc in scenarios:
        sc_start  = t0 + timedelta(seconds=sc["start_offset_s"])
        job_start = sc_start - timedelta(minutes=rng.randint(5, 20))
        job_end   = sc_start + timedelta(seconds=sc["duration_s"]) + timedelta(minutes=rng.randint(10, 30))

        records.append(MaintenanceLog(
            plant_id      = plant_id,
            log_ref       = _make_log_ref(plant_id, log_index),
            zone_id       = sc["zone_id"],
            activity_type = sc["maintenance_activity"],
            technician    = rng.choice(TECHNICIANS),
            start_time    = job_start,
            end_time      = job_end,
            notes         = (
                f"Linked to elevated sensor readings. "
                f"Activity ongoing during {sc['label']}."
            ),
            scenario_id   = sc["scenario_id"],
        ))
        log_index += 1

    # ----- Historical Logs for Compliance Audit (Phase 8A) ------------------
    # Use first 5 zones (or however many the plant has) for compliance seeding.
    zone_ids = [z["zone_id"] for z in zones]
    prefix = "COK" if "coke" in plant_id else "RML"

    # Calibration compliance: mix of compliant and overdue entries
    calibration_ages = [15, 12, 10, 45, 40]  # days ago; >30 = overdue
    for idx, zone_id in enumerate(zone_ids):
        days_ago = calibration_ages[idx % len(calibration_ages)]
        log_time = t0 - timedelta(days=days_ago)
        records.append(MaintenanceLog(
            plant_id      = plant_id,
            log_ref       = f"MNT-HIST-{prefix}-{log_index}",
            zone_id       = zone_id,
            activity_type = "Routine Gas Detector Calibration",
            technician    = rng.choice(TECHNICIANS),
            start_time    = log_time,
            end_time      = log_time + timedelta(hours=1),
            notes         = "Historical calibration check.",
        ))
        log_index += 1

    # Audit compliance: weekly PPE audit — some overdue
    audit_ages = [3, 10]  # days ago; >7 = overdue
    for idx, zone_id in enumerate(zone_ids[:2]):
        days_ago = audit_ages[idx % len(audit_ages)]
        log_time = t0 - timedelta(days=days_ago)
        records.append(MaintenanceLog(
            plant_id      = plant_id,
            log_ref       = f"MNT-HIST-{prefix}-PPE-{log_index}",
            zone_id       = zone_id,
            activity_type = "Weekly PPE Audit",
            technician    = rng.choice(TECHNICIANS),
            start_time    = log_time,
            end_time      = log_time + timedelta(hours=1),
            notes         = "Historical safety audit check.",
        ))
        log_index += 1

    return records
