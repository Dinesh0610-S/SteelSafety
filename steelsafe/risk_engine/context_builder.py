"""
risk_engine/context_builder.py
==============================
Assembles a RiskContext snapshot by querying all Phase 1 tables for a
given (zone_id, timestamp). Scopes queries to the plant_id associated with the zone.

The context window is:
  - sensor_readings: exact timestamp match (or nearest earlier sample)
  - recent_readings: last TREND_LOOKBACK_SAMPLES readings before timestamp
  - permits / maintenance_logs: rows whose [start_time, end_time] overlaps ts
  - worker_locations: pings within WORKER_PING_WINDOW_S of ts (default ±5 min)
  - shift_schedule: shift that contains ts; also captures the next shift boundary
"""

from __future__ import annotations
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import List, Optional

from sqlalchemy.orm import Session

from db.models import (
    SensorReading, Permit, MaintenanceLog,
    ShiftSchedule, WorkerLocation, Zone,
)
from plants.registry import get_plant_config, DEFAULT_PLANT_ID
from risk_engine.thresholds import TREND_LOOKBACK_SAMPLES

# Window around eval timestamp to count worker pings
WORKER_PING_WINDOW_S = 10 * 60   # ±10 minutes


@dataclass
class RiskContext:
    """
    All signal data for one zone at one point in time.
    Built by build_context(); consumed by rule functions and the anomaly detector.
    """
    zone_id:          str
    zone_name:        str
    area_type:        str
    max_workers:      int
    timestamp:        datetime
    plant_id:         str = DEFAULT_PLANT_ID

    # Sensor data
    current_reading:  Optional[SensorReading] = None      # nearest reading at or before ts
    recent_readings:  List[SensorReading] = field(default_factory=list)  # for trend

    # Operational data
    active_permits:       List[Permit]          = field(default_factory=list)
    active_maintenance:   List[MaintenanceLog]  = field(default_factory=list)
    workers_in_zone:      int                   = 0
    current_shift:        Optional[ShiftSchedule] = None
    next_shift_start:     Optional[datetime]      = None   # nearest future shift boundary

    # Zone baselines (from plant baselines — used by rules + anomaly)
    zone_co_mean:       float = 0.0
    zone_co_std:        float = 1.0
    zone_h2s_mean:      float = 0.0
    zone_h2s_std:       float = 1.0
    zone_temp_mean:     float = 0.0
    zone_temp_std:      float = 1.0
    zone_pressure_mean: float = 0.0
    zone_pressure_std:  float = 1.0

    # Phase 7B: Shift fatigue data
    max_hours_into_shift: float = 0.0   # hours elapsed since current shift started
    fatigue_worker_count: int   = 0     # workers currently in this zone

    # Phase 7C: Live CCTV camera signals
    cctv_person_detected: bool = False
    cctv_ppe_compliant: bool = True


def build_context(zone_id: str, timestamp: datetime, db: Session) -> RiskContext:
    """
    Query all Phase 1 tables and assemble a RiskContext for
    (zone_id, timestamp). Scopes all queries by plant_id to keep plants isolated.
    """
    if timestamp and timestamp.tzinfo is not None:
        timestamp = timestamp.replace(tzinfo=None)

    # ---- Zone metadata -------------------------------------------------------
    zone_row = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    if zone_row:
        plant_id = zone_row.plant_id
        zone_name  = zone_row.name
        area_type  = zone_row.area_type
        max_workers = zone_row.max_workers
    else:
        plant_id = DEFAULT_PLANT_ID
        zone_name  = zone_id
        area_type  = "Unknown"
        max_workers = 10

    # Retrieve plant configuration for dynamic baselines
    try:
        plant_config = get_plant_config(plant_id)
        baselines = plant_config["baselines"]
    except ValueError:
        baselines = {}

    # ---- Current sensor reading: nearest at-or-before ts (filtered by plant_id) --------------------
    current_reading = (
        db.query(SensorReading)
        .filter(
            SensorReading.plant_id  == plant_id,
            SensorReading.zone_id   == zone_id,
            SensorReading.timestamp <= timestamp,
        )
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    # ---- Recent readings for trend analysis (filtered by plant_id) ---------------------------------
    recent_readings = (
        db.query(SensorReading)
        .filter(
            SensorReading.plant_id  == plant_id,
            SensorReading.zone_id   == zone_id,
            SensorReading.timestamp <= timestamp,
        )
        .order_by(SensorReading.timestamp.desc())
        .limit(TREND_LOOKBACK_SAMPLES)
        .all()
    )
    # Reverse so oldest→newest (needed for slope calculation)
    recent_readings = list(reversed(recent_readings))

    # ---- Active permits: window overlaps ts (filtered by plant_id) ---------------------------------
    active_permits = (
        db.query(Permit)
        .filter(
            Permit.plant_id   == plant_id,
            Permit.zone_id    == zone_id,
            Permit.start_time <= timestamp,
            Permit.end_time   >= timestamp,
        )
        .all()
    )

    # ---- Active maintenance: window overlaps ts (filtered by plant_id) ------------------------------
    active_maintenance = (
        db.query(MaintenanceLog)
        .filter(
            MaintenanceLog.plant_id   == plant_id,
            MaintenanceLog.zone_id    == zone_id,
            MaintenanceLog.start_time <= timestamp,
            MaintenanceLog.end_time   >= timestamp,
        )
        .all()
    )

    # ---- Worker count: pings within ±10 min of ts (filtered by plant_id) ---------------------------
    window_start = timestamp - timedelta(seconds=WORKER_PING_WINDOW_S)
    window_end   = timestamp + timedelta(seconds=WORKER_PING_WINDOW_S)
    worker_count = (
        db.query(WorkerLocation.worker_id)
        .filter(
            WorkerLocation.plant_id  == plant_id,
            WorkerLocation.zone_id   == zone_id,
            WorkerLocation.timestamp >= window_start,
            WorkerLocation.timestamp <= window_end,
        )
        .distinct()
        .count()
    )

    # ---- Shift: which shift contains ts + next boundary (filtered by plant_id) ---------------------
    current_shift = (
        db.query(ShiftSchedule)
        .filter(
            ShiftSchedule.plant_id   == plant_id,
            ShiftSchedule.start_time <= timestamp,
            ShiftSchedule.end_time   >= timestamp,
        )
        .first()
    )

    # Find the next shift boundary (start of the next shift after ts)
    next_shift = (
        db.query(ShiftSchedule)
        .filter(
            ShiftSchedule.plant_id   == plant_id,
            ShiftSchedule.start_time > timestamp
        )
        .order_by(ShiftSchedule.start_time)
        .first()
    )
    next_shift_start = next_shift.start_time if next_shift else None

    # Also check previous shift end (changeover could be behind us)
    # We want the nearest boundary (start or end of any shift) to ts
    prev_shift_end = current_shift.end_time if current_shift else None

    # Pick whichever boundary (prev end or next start) is closest to ts
    boundaries = [b for b in [prev_shift_end, next_shift_start] if b is not None]
    nearest_boundary = min(boundaries, key=lambda b: abs((b - timestamp).total_seconds())) if boundaries else None

    # ---- Zone sensor baselines ----------------------------------------------
    bl = baselines.get(zone_id, {})
    co_mean,   co_std   = bl.get("co_ppm",        (10.0, 5.0))
    h2s_mean,  h2s_std  = bl.get("h2s_ppm",       (1.0,  0.5))
    temp_mean, temp_std = bl.get("temperature_c",  (50.0, 10.0))
    pres_mean, pres_std = bl.get("pressure_kpa",   (101.0, 1.0))

    # ---- Phase 7B: Shift fatigue computation --------------------------------
    # Use ShiftSchedule.start_time as the shift start for all workers on this
    # crew — consistent with reality (everyone started at T even if badge-scanned in later).
    hours_into_shift = 0.0
    if current_shift is not None:
        elapsed_s = (timestamp - current_shift.start_time).total_seconds()
        hours_into_shift = max(0.0, elapsed_s / 3600.0)
    # Cap at a sane maximum (a shift should not exceed 16 hours in simulation)
    hours_into_shift = min(hours_into_shift, 16.0)

    # ---- Phase 7C: Live CCTV camera signals ---------------------------------
    cctv_person = False
    cctv_ppe = True
    from risk_engine.cctv_state import LIVE_CCTV_STATE
    if LIVE_CCTV_STATE["zone_id"] == zone_id and LIVE_CCTV_STATE["timestamp"] is not None:
        time_diff = (datetime.now() - LIVE_CCTV_STATE["timestamp"]).total_seconds()
        if abs(time_diff) < 15.0:
            cctv_person = LIVE_CCTV_STATE["person_detected"]
            cctv_ppe = LIVE_CCTV_STATE["ppe_compliant"]

    return RiskContext(
        plant_id         = plant_id,
        zone_id          = zone_id,
        zone_name        = zone_name,
        area_type        = area_type,
        max_workers      = max_workers,
        timestamp        = timestamp,
        current_reading  = current_reading,
        recent_readings  = recent_readings,
        active_permits   = active_permits,
        active_maintenance = active_maintenance,
        workers_in_zone  = worker_count,
        current_shift    = current_shift,
        next_shift_start = nearest_boundary,
        zone_co_mean     = co_mean,
        zone_co_std      = max(co_std, 0.1),
        zone_h2s_mean    = h2s_mean,
        zone_h2s_std     = max(h2s_std, 0.01),
        zone_temp_mean   = temp_mean,
        zone_temp_std    = max(temp_std, 0.1),
        zone_pressure_mean = pres_mean,
        zone_pressure_std  = max(pres_std, 0.1),
        max_hours_into_shift = hours_into_shift,
        fatigue_worker_count = worker_count,
        cctv_person_detected = cctv_person,
        cctv_ppe_compliant   = cctv_ppe,
    )
