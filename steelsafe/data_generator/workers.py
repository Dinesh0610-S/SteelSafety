"""
Worker location ping generator — Phase 8B: multi-plant parameterised.

Accepts plant_config and tags all WorkerLocation rows with plant_id.
Worker IDs are namespaced per plant to prevent cross-contamination.
"""

import random
from datetime import datetime, timedelta
from typing import List

from db.models import WorkerLocation

PING_INTERVAL_S = 5 * 60  # 5 minutes

# Base worker pool — IDs will be prefixed per plant
BASE_WORKERS = [
    ("W001", "A. Suresh Kumar"),
    ("W002", "B. Rama Krishna"),
    ("W003", "C. Venkata Lakshmi"),
    ("W004", "D. Naga Raju"),
    ("W005", "E. Priya Darshini"),
    ("W006", "F. Kiran Kumar"),
    ("W007", "G. Lakshmi Narayana"),
    ("W008", "H. Satya Sai"),
    ("W009", "I. Anantha Rao"),
    ("W010", "J. Bhavani Prasad"),
    ("W011", "K. Durga Prasad"),
    ("W012", "L. Hemanth Kumar"),
    ("W013", "M. Indira Devi"),
    ("W014", "N. Jagadeesh"),
    ("W015", "O. Komala Vani"),
    ("W016", "P. Lokeswara Rao"),
    ("W017", "Q. Malleswari"),
    ("W018", "R. Narasimha Rao"),
    ("W019", "S. Obulamma"),
    ("W020", "T. Padmavathi"),
]


def _build_workers(plant_id: str):
    """Prefix worker IDs so each plant has its own namespace."""
    prefix = "C" if "coke" in plant_id else "R"
    return [(f"{prefix}{wid}", wname) for wid, wname in BASE_WORKERS]


def _build_adjacency(zone_ids: list) -> dict:
    """
    Build a simple adjacency map: each zone is adjacent to the next two zones
    in the list (wrapping). This gives realistic movement without hardcoding
    zone-specific relationships.
    """
    n = len(zone_ids)
    adj = {}
    for i, zid in enumerate(zone_ids):
        adj[zid] = [zid, zone_ids[(i + 1) % n], zone_ids[(i - 1) % n]]
    return adj


def generate_worker_locations(
    t0: datetime,
    shift_duration_s: int,
    rng: random.Random,
    plant_config: dict,
) -> List[WorkerLocation]:
    """
    Generate worker location pings for the full shift.

    Strategy:
    - Normal pings: every 5 minutes per worker, zone chosen probabilistically
    - Scenario windows: `worker_cluster_size` workers are pinged to the scenario
      zone every 5 minutes during the incident window, tagged with scenario_id
    """
    plant_id  = plant_config["plant_id"]
    zones     = plant_config["zones"]
    scenarios = plant_config["scenarios"]
    zone_ids  = [z["zone_id"] for z in zones]

    workers  = _build_workers(plant_id)
    adjacency = _build_adjacency(zone_ids)

    # Home zone assignment: worker index → preferred zone (round-robin)
    worker_home_zones = {
        wid: zone_ids[i % len(zone_ids)]
        for i, (wid, _) in enumerate(workers)
    }

    def pick_zone(worker_id: str) -> str:
        home = worker_home_zones[worker_id]
        adjacent = adjacency.get(home, [home])
        return home if rng.random() < 0.70 else rng.choice(adjacent)

    records: List[WorkerLocation] = []
    num_pings = shift_duration_s // PING_INTERVAL_S

    # Pre-build scenario window lookup
    scenario_windows = []
    for sc in scenarios:
        sc_start = t0 + timedelta(seconds=sc["start_offset_s"])
        sc_end   = sc_start + timedelta(seconds=sc["duration_s"])
        scenario_windows.append({
            "zone_id":     sc["zone_id"],
            "start":       sc_start,
            "end":         sc_end,
            "scenario_id": sc["scenario_id"],
            "cluster_size": sc["worker_cluster_size"],
        })

    for i in range(num_pings):
        ts = t0 + timedelta(seconds=i * PING_INTERVAL_S)

        active_scenario = None
        for sw in scenario_windows:
            if sw["start"] <= ts <= sw["end"]:
                active_scenario = sw
                break

        if active_scenario:
            cluster_workers   = workers[: active_scenario["cluster_size"]]
            remaining_workers = workers[active_scenario["cluster_size"]:]

            for wid, wname in cluster_workers:
                records.append(WorkerLocation(
                    plant_id    = plant_id,
                    worker_id   = wid,
                    worker_name = wname,
                    zone_id     = active_scenario["zone_id"],
                    timestamp   = ts,
                    scenario_id = active_scenario["scenario_id"],
                ))

            for wid, wname in remaining_workers:
                records.append(WorkerLocation(
                    plant_id    = plant_id,
                    worker_id   = wid,
                    worker_name = wname,
                    zone_id     = pick_zone(wid),
                    timestamp   = ts,
                    scenario_id = None,
                ))
        else:
            for wid, wname in workers:
                records.append(WorkerLocation(
                    plant_id    = plant_id,
                    worker_id   = wid,
                    worker_name = wname,
                    zone_id     = pick_zone(wid),
                    timestamp   = ts,
                    scenario_id = None,
                ))

    return records
