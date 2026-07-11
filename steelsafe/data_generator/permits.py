"""
Permit-to-work (PTW) log generator — Phase 8B: multi-plant parameterised.

Accepts plant_config and tags all permit rows with plant_id.
Permit refs are prefixed with the plant's short name to avoid unique-constraint
collisions when both plants are seeded into the same DB.
"""

import random
from datetime import datetime, timedelta
from typing import List

from db.models import Permit

# Permit types with realistic probabilities
PERMIT_TYPES = ["hot_work", "cold_work", "confined_space_entry"]

# Workers pool for permit "issued_to" field
PERMIT_HOLDERS = [
    "R. Krishnamurthy", "S. Venkatesh", "P. Narayana Rao",
    "M. Subramaniam",   "T. Balakrishna", "A. Prasad",
    "D. Ramachandran",  "V. Anand Kumar", "B. Srinivasa Rao",
    "K. Nageswara Rao", "G. Apparao",    "L. Vijaya Bhaskar",
]


def _make_permit_ref(plant_id: str, index: int) -> str:
    # Short prefix per plant to ensure DB uniqueness
    prefix = "COK" if "coke" in plant_id else "RML"
    return f"PTW-{prefix}-{index:04d}"


def generate_permits(
    t0: datetime,
    shift_duration_s: int,
    rng: random.Random,
    plant_config: dict,
) -> List[Permit]:
    """
    Generate permit-to-work records for a full shift.

    Strategy:
    - ~3–5 normal permits per zone spread across the shift (random type, random window)
    - 1 scenario-tagged permit per incident scenario, overlapping the scenario window
    """
    plant_id = plant_config["plant_id"]
    zones    = plant_config["zones"]
    scenarios = plant_config["scenarios"]

    records: List[Permit] = []
    permit_index = 1

    # ----- Normal permits ---------------------------------------------------
    for zone in zones:
        zid = zone["zone_id"]
        num_permits = rng.randint(3, 5)
        for _ in range(num_permits):
            ptype = rng.choice(PERMIT_TYPES)
            start_offset = rng.randint(0, shift_duration_s - 3600)
            duration_s   = rng.randint(30 * 60, 2 * 3600)
            start_time   = t0 + timedelta(seconds=start_offset)
            end_time     = start_time + timedelta(seconds=duration_s)

            end_of_shift = t0 + timedelta(seconds=shift_duration_s)
            status = "closed" if end_time <= end_of_shift else "active"

            records.append(Permit(
                plant_id    = plant_id,
                permit_ref  = _make_permit_ref(plant_id, permit_index),
                zone_id     = zid,
                permit_type = ptype,
                issued_to   = rng.choice(PERMIT_HOLDERS),
                start_time  = start_time,
                end_time    = end_time,
                status      = status,
                scenario_id = None,
            ))
            permit_index += 1

    # ----- Scenario-tagged permits ------------------------------------------
    for sc in scenarios:
        sc_start     = t0 + timedelta(seconds=sc["start_offset_s"])
        permit_start = sc_start - timedelta(minutes=rng.randint(10, 30))
        permit_end   = sc_start + timedelta(seconds=sc["duration_s"]) + timedelta(minutes=rng.randint(5, 15))

        records.append(Permit(
            plant_id    = plant_id,
            permit_ref  = _make_permit_ref(plant_id, permit_index),
            zone_id     = sc["zone_id"],
            permit_type = sc["permit_type"],
            issued_to   = rng.choice(PERMIT_HOLDERS),
            start_time  = permit_start,
            end_time    = permit_end,
            status      = "active",
            scenario_id = sc["scenario_id"],
        ))
        permit_index += 1

    return records
