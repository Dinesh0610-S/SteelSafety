"""
Shift schedule generator.

Generates 3 shifts covering a 24-hour period centred around T0.
The simulated 8-hour working shift corresponds to "B Shift".
A shift changeover overlaps with Scenario 2 (scenario_2 is designed to
coincide with the B→C handover at T0 + 4.5h).
"""

from datetime import datetime, timedelta
from typing import List

from db.models import ShiftSchedule

SHIFT_DEFINITIONS = [
    {
        "shift_name":  "A Shift",
        "offset_from_t0_s": -8 * 3600,   # Ended at T0
        "duration_s":   8 * 3600,
        "supervisor":  "P. Venkata Rao",
        "crew_count":  28,
    },
    {
        "shift_name":  "B Shift",
        "offset_from_t0_s": 0,            # Starts at T0 — this is the simulated shift
        "duration_s":   8 * 3600,
        "supervisor":  "K. Srinivasulu",
        "crew_count":  31,
    },
    {
        "shift_name":  "C Shift",
        "offset_from_t0_s": 8 * 3600,    # Starts at end of simulated shift
        "duration_s":   8 * 3600,
        "supervisor":  "N. Bala Krishnan",
        "crew_count":  27,
    },
]


def generate_shift_schedule(t0: datetime) -> List[ShiftSchedule]:
    """Generate 3-shift schedule covering A/B/C shifts around the simulated window."""
    records: List[ShiftSchedule] = []
    for defn in SHIFT_DEFINITIONS:
        start = t0 + timedelta(seconds=defn["offset_from_t0_s"])
        end   = start + timedelta(seconds=defn["duration_s"])
        records.append(ShiftSchedule(
            shift_name = defn["shift_name"],
            start_time = start,
            end_time   = end,
            supervisor = defn["supervisor"],
            crew_count = defn["crew_count"],
        ))
    return records
