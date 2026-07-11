"""
risk_engine/baseline.py
=======================
Naive single-sensor baseline detector.

This is the traditional alarm approach that SteelSafe's compound engine
is benchmarked against. It evaluates individual sensor thresholds in
isolation — no cross-signal correlation, no trend analysis, no operational
context (permits, workers, shift boundaries).

Scopes queries to the zone's active plant_id.
"""

from __future__ import annotations
from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List

from sqlalchemy.orm import Session
from db.models import SensorReading, Permit, Zone
from risk_engine import thresholds as T

# Baseline thresholds — what a traditional alarm system would use
BASELINE_CO_ALARM_PPM  = T.SINGLE_SENSOR_ALARM_CO_PPM    # 100 ppm
BASELINE_H2S_ALARM_PPM = T.SINGLE_SENSOR_ALARM_H2S_PPM   # 10 ppm

# High-risk permit types that trigger the permit-only alarm branch
HIGH_RISK_PERMIT_TYPES = {"hot_work", "confined_space_entry"}

# Threshold for permit-only alarm: gas must also be at least "elevated"
BASELINE_PERMIT_CO_PPM  = 50.0   # CO action level for permit-only branch
BASELINE_PERMIT_H2S_PPM = 8.0    # H2S action level for permit-only branch


@dataclass
class BaselineResult:
    """Result of a single-sensor baseline evaluation at one (zone, timestamp)."""
    zone_id:       str
    timestamp:     datetime
    fired:         bool          # True if any single threshold was exceeded
    alarm_type:    str           # e.g. "CO_ALARM", "H2S_ALARM", "PERMIT_GAS_ALARM", ""
    sensor_value:  Optional[float]  # The value that triggered the alarm
    threshold:     Optional[float]  # The threshold it exceeded
    detail:        str           # Human-readable explanation


def evaluate_baseline(
    zone_id:   str,
    timestamp: datetime,
    db:        Session,
) -> BaselineResult:
    """
    Evaluate single-sensor baseline logic for a zone at a specific timestamp.

    This queries the DB for the most recent sensor reading at or before
    `timestamp` and checks hard alarm thresholds in isolation.
    """
    # ---- Find the plant_id for this zone ------------------------------------
    zone_row = db.query(Zone).filter(Zone.zone_id == zone_id).first()
    plant_id = zone_row.plant_id if zone_row else "plant_coke_oven"

    # ---- Get latest sensor reading at or before this timestamp --------------
    reading: Optional[SensorReading] = (
        db.query(SensorReading)
        .filter(
            SensorReading.plant_id  == plant_id,
            SensorReading.zone_id   == zone_id,
            SensorReading.timestamp <= timestamp,
        )
        .order_by(SensorReading.timestamp.desc())
        .first()
    )

    if reading is None:
        return BaselineResult(
            zone_id=zone_id, timestamp=timestamp, fired=False,
            alarm_type="", sensor_value=None, threshold=None,
            detail="No sensor data available."
        )

    # ---- Check CO hard alarm ------------------------------------------------
    if reading.co_ppm >= BASELINE_CO_ALARM_PPM:
        return BaselineResult(
            zone_id=zone_id,
            timestamp=timestamp,
            fired=True,
            alarm_type="CO_ALARM",
            sensor_value=reading.co_ppm,
            threshold=BASELINE_CO_ALARM_PPM,
            detail=(
                f"CO={reading.co_ppm:.1f} ppm exceeded single-sensor alarm threshold "
                f"of {BASELINE_CO_ALARM_PPM:.0f} ppm."
            ),
        )

    # ---- Check H2S hard alarm -----------------------------------------------
    if reading.h2s_ppm >= BASELINE_H2S_ALARM_PPM:
        return BaselineResult(
            zone_id=zone_id,
            timestamp=timestamp,
            fired=True,
            alarm_type="H2S_ALARM",
            sensor_value=reading.h2s_ppm,
            threshold=BASELINE_H2S_ALARM_PPM,
            detail=(
                f"H2S={reading.h2s_ppm:.3f} ppm exceeded single-sensor alarm threshold "
                f"of {BASELINE_H2S_ALARM_PPM:.0f} ppm."
            ),
        )

    # ---- Permit + elevated gas check (most generous version of naive) -------
    active_permits: List[Permit] = (
        db.query(Permit)
        .filter(
            Permit.plant_id   == plant_id,
            Permit.zone_id    == zone_id,
            Permit.start_time <= timestamp,
            Permit.end_time   >= timestamp,
            Permit.permit_type.in_(HIGH_RISK_PERMIT_TYPES),
        )
        .all()
    )

    if active_permits:
        co_elevated  = reading.co_ppm  >= BASELINE_PERMIT_CO_PPM
        h2s_elevated = reading.h2s_ppm >= BASELINE_PERMIT_H2S_PPM
        if co_elevated or h2s_elevated:
            gas_detail = (
                f"CO={reading.co_ppm:.1f} ppm" if co_elevated
                else f"H2S={reading.h2s_ppm:.3f} ppm"
            )
            threshold = BASELINE_PERMIT_CO_PPM if co_elevated else BASELINE_PERMIT_H2S_PPM
            return BaselineResult(
                zone_id=zone_id,
                timestamp=timestamp,
                fired=True,
                alarm_type="PERMIT_GAS_ALARM",
                sensor_value=reading.co_ppm if co_elevated else reading.h2s_ppm,
                threshold=threshold,
                detail=(
                    f"High-risk permit active and gas elevated: {gas_detail} "
                    f"(threshold: {threshold:.0f} ppm)."
                ),
            )

    # ---- No alarm -----------------------------------------------------------
    return BaselineResult(
        zone_id=zone_id,
        timestamp=timestamp,
        fired=False,
        alarm_type="",
        sensor_value=None,
        threshold=None,
        detail=(
            f"No single-sensor threshold exceeded. CO={reading.co_ppm:.1f} ppm, "
            f"H2S={reading.h2s_ppm:.3f} ppm."
        ),
    )
