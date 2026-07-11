"""
Master data generation orchestrator — Phase 8B: multi-plant parameterised.

Calling `run_generation()` will drop and recreate all DB tables,
then seed data for ALL registered plants sequentially.
This is called on startup (if DB is empty) and via POST /admin/regenerate.
"""

import random
import numpy as np
from datetime import datetime, timedelta
from sqlalchemy.orm import Session

from db.database import SessionLocal, create_all_tables, drop_all_tables
from db.models import Zone
from plants.registry import PLANT_REGISTRY, DEFAULT_PLANT_ID
from data_generator.sensors import generate_sensor_readings
from data_generator.permits import generate_permits
from data_generator.maintenance import generate_maintenance_logs
from data_generator.shifts import generate_shift_schedule
from data_generator.workers import generate_worker_locations

SHIFT_DURATION_S = 8 * 3600  # 8-hour shift = 28,800 seconds
RANDOM_SEED      = 42         # Fixed seed for reproducible demo data


def generate_plant_data(db: Session, plant_config: dict, seed: int, t0: datetime) -> dict:
    """
    Generate and insert all telemetry & operational rows for a single plant configuration.
    """
    plant_id = plant_config["plant_id"]
    print(f"[Generator] Generating data for plant '{plant_id}' ({plant_config['name']})...")

    # Shared RNG instances — numpy for sensor maths, stdlib random for choices
    np_rng  = np.random.default_rng(seed)
    py_rng  = random.Random(seed)

    zones       = [Zone(plant_id=plant_id, **z) for z in plant_config["zones"]]
    # Shifts don't have zone_id but they have plant_id in Phase 8B
    shifts      = generate_shift_schedule(t0)
    for s in shifts:
        s.plant_id = plant_id

    sensors     = generate_sensor_readings(t0, SHIFT_DURATION_S, np_rng, plant_config)
    permits     = generate_permits(t0, SHIFT_DURATION_S, py_rng, plant_config)
    maintenance = generate_maintenance_logs(t0, SHIFT_DURATION_S, py_rng, plant_config)
    workers     = generate_worker_locations(t0, SHIFT_DURATION_S, py_rng, plant_config)

    db.bulk_save_objects(zones)
    db.bulk_save_objects(shifts)
    db.bulk_save_objects(sensors)
    db.bulk_save_objects(permits)
    db.bulk_save_objects(maintenance)
    db.bulk_save_objects(workers)
    db.commit()

    return {
        "zones":             len(zones),
        "shifts":            len(shifts),
        "sensor_readings":   len(sensors),
        "permits":           len(permits),
        "maintenance_logs":  len(maintenance),
        "worker_pings":      len(workers),
    }


def run_generation(seed: int = RANDOM_SEED) -> dict:
    """
    Drop all data, recreate schema, and generate a full shift of
    synthetic data for all registered plants.
    """
    print("[Generator] Dropping existing tables...")
    drop_all_tables()

    print("[Generator] Creating tables...")
    create_all_tables()

    # T0 = now - 8h so that "current" readings feel live (last sample ≈ now)
    t0 = datetime.now() - timedelta(seconds=SHIFT_DURATION_S)

    db = SessionLocal()
    summary = {
        "status": "ok",
        "t0_simulated": t0.isoformat(),
        "shift_duration_h": SHIFT_DURATION_S // 3600,
        "plants": {},
        "risk_assessments": 0,
        "compliance_deviations": 0,
    }

    try:
        # Loop through all plants in the registry and generate data
        for plant_id, plant_config in PLANT_REGISTRY.items():
            # Use different seeds to make data distinct
            plant_seed = seed + (1000 if plant_id != DEFAULT_PLANT_ID else 0)
            plant_summary = generate_plant_data(db, plant_config, plant_seed, t0)
            summary["plants"][plant_id] = plant_summary

            # Run full risk engine sweep to pre-populate risk_assessments table for this plant
            print(f"[Generator] Running risk engine sweep for plant '{plant_id}'...")
            from risk_engine.engine import sweep_full_timeline
            sweep_summary = sweep_full_timeline(db, store=True, plant_config=plant_config)
            summary["risk_assessments"] += sweep_summary["total_evaluations"]

            # Run compliance check (Phase 8A) for this plant
            print(f"[Generator] Running compliance check for plant '{plant_id}'...")
            from risk_engine.compliance import run_compliance_check
            devs = run_compliance_check(db, datetime.now(), plant_config=plant_config)
            summary["compliance_deviations"] += len(devs)

    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    print(f"[Generator] Done. Summary: {summary}")
    return summary
