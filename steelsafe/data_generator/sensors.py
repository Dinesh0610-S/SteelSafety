"""
Sensor time-series generator — Phase 8B: multi-plant parameterised.

Accepts a plant_config dict (from plants/plant_a.py or plant_b.py) and
generates SensorReading rows tagged with that plant's plant_id.

Normal readings use Gaussian noise + a slow sinusoidal drift to mimic
natural industrial variation. Incident windows inject anomalous values
with a linear trend (escalating readings) and tag rows with scenario_id.

Phase 7A: Added support for `self_resolve=True` scenario flag.
Phase 8B: plant_config injection replaces direct ZONES/SCENARIOS imports.
"""

import numpy as np
from datetime import datetime, timedelta
from typing import List

from db.models import SensorReading

SAMPLE_INTERVAL_S = 30  # seconds between sensor readings


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _in_scenario_window(ts: datetime, t0: datetime, scenario: dict) -> bool:
    """Return True if ts falls within this scenario's active time window."""
    start = t0 + timedelta(seconds=scenario["start_offset_s"])
    end   = start + timedelta(seconds=scenario["duration_s"])
    return start <= ts <= end


def _scenario_progress(ts: datetime, t0: datetime, scenario: dict) -> float:
    """Return a 0.0–1.0 fraction of how far through the scenario window ts is."""
    start = t0 + timedelta(seconds=scenario["start_offset_s"])
    return (ts - start).total_seconds() / scenario["duration_s"]


def _effective_progress(scenario: dict, raw_progress: float) -> float:
    """
    For self-resolving scenarios, map raw progress (0→1) to an effective
    progress value that rises in the first half then falls in the second half.
    """
    if not scenario.get("self_resolve", False):
        return raw_progress

    if raw_progress <= 0.5:
        return raw_progress * 2.0
    else:
        return (1.0 - raw_progress) * 2.0


def generate_sensor_readings(
    t0: datetime,
    shift_duration_s: int,
    rng: np.random.Generator,
    plant_config: dict,
) -> List[SensorReading]:
    """
    Generate all sensor readings for the full shift across all zones
    defined in plant_config.

    Args:
        t0:               Simulation start datetime.
        shift_duration_s: Total simulated duration in seconds.
        rng:              Shared numpy random generator for reproducibility.
        plant_config:     Plant configuration dict from plants/plant_*.py.

    Returns:
        List of SensorReading ORM objects ready for bulk insert.
    """
    plant_id   = plant_config["plant_id"]
    baselines  = plant_config["baselines"]
    scenarios  = plant_config["scenarios"]
    zone_ids   = list(baselines.keys())

    records: List[SensorReading] = []

    # Pre-build lookup: zone_id → list of scenarios in that zone
    zone_scenarios: dict = {}
    for scenario in scenarios:
        zone_scenarios.setdefault(scenario["zone_id"], []).append(scenario)

    num_samples = shift_duration_s // SAMPLE_INTERVAL_S

    for zone_id in zone_ids:
        baseline = baselines[zone_id]
        scenarios_for_zone = zone_scenarios.get(zone_id, [])

        # Slow sinusoidal drift phase — offset per zone so they don't all peak together
        drift_phase = rng.uniform(0, 2 * np.pi)

        for i in range(num_samples):
            ts = t0 + timedelta(seconds=i * SAMPLE_INTERVAL_S)

            # Sinusoidal drift: slow cycle over ~4 hours, amplitude = 0.15 × std
            drift_frac = 0.15 * np.sin(
                2 * np.pi * (i / num_samples) * 2 + drift_phase
            )

            # Check if this timestamp falls inside any scenario window for this zone
            active_scenario = None
            for sc in scenarios_for_zone:
                if _in_scenario_window(ts, t0, sc):
                    active_scenario = sc
                    break

            if active_scenario is None:
                # ---- Normal reading ----------------------------------------
                def sample(key: str) -> float:
                    mean, std = baseline[key]
                    return float(rng.normal(mean + drift_frac * std, std))

                co_ppm        = _clamp(sample("co_ppm"),        0.0,   50.0)
                h2s_ppm       = _clamp(sample("h2s_ppm"),       0.0,    5.0)
                temperature_c = _clamp(sample("temperature_c"), -10.0, 1300.0)
                pressure_kpa  = _clamp(sample("pressure_kpa"),  80.0,  120.0)
                scenario_id   = None

            else:
                # ---- Incident scenario reading ------------------------------
                raw_progress = _scenario_progress(ts, t0, active_scenario)
                progress = _effective_progress(active_scenario, raw_progress)
                spike    = active_scenario["sensor_spike"]

                def spike_sample(key: str) -> float:
                    target_mean, target_std, _ = spike[key]
                    base_mean, base_std = baseline[key]
                    current_mean = base_mean + (target_mean - base_mean) * progress
                    current_std  = base_std  + (target_std  - base_std)  * progress
                    return float(rng.normal(current_mean, current_std))

                co_ppm        = _clamp(spike_sample("co_ppm"),        0.0,   600.0)
                h2s_ppm       = _clamp(spike_sample("h2s_ppm"),       0.0,    80.0)
                temperature_c = _clamp(spike_sample("temperature_c"), -10.0, 1300.0)
                pressure_kpa  = _clamp(spike_sample("pressure_kpa"),  70.0,  130.0)
                scenario_id   = active_scenario["scenario_id"]

            records.append(SensorReading(
                plant_id      = plant_id,
                zone_id       = zone_id,
                timestamp     = ts,
                co_ppm        = round(co_ppm,        2),
                h2s_ppm       = round(h2s_ppm,       3),
                temperature_c = round(temperature_c, 1),
                pressure_kpa  = round(pressure_kpa,  2),
                scenario_id   = scenario_id,
            ))

    return records
