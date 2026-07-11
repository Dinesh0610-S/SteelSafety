"""
risk_engine/forecaster.py
==========================
Phase 9: Predictive Incident Forecasting Engine.

Uses linear regression over the last N sensor readings for each zone to
project CO, H2S, Pressure, and Temperature trends forward in time, producing
Time-To-Danger (TTD) estimates — how many minutes until each gas crosses
its action-level threshold at the current rate of change.

Key design decisions
---------------------
- Uses pure NumPy polyfit (degree 1) — zero additional dependencies.
- Only fires a TTD warning when the regression slope is positive (rising).
- TTD is capped at MAX_TTD_MINUTES; beyond that it's reported as None (not imminent).
- Confidence is expressed as R² of the linear fit (0–1).
- Lookback defaults to last 30 readings (≈ 30 minutes in the demo dataset).
"""

from __future__ import annotations
import numpy as np
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any
from sqlalchemy.orm import Session
from sqlalchemy import desc

from db.models import SensorReading, Zone
from risk_engine.thresholds import (
    CO_SECONDARY_PPM  as CO_ACTION_LEVEL,
    CO_HIGH_PPM       as CO_HIGH_THRESHOLD,
    H2S_SECONDARY_PPM as H2S_ACTION_LEVEL,
    H2S_HIGH_PPM      as H2S_HIGH_THRESHOLD,
)

# -------------------------------------------------------------------------
# Configuration
# -------------------------------------------------------------------------
LOOKBACK_READINGS = 30       # Number of recent readings to regress over
MAX_TTD_MINUTES   = 120      # Cap Time-To-Danger estimates at 2 hours
MIN_R2            = 0.30     # Minimum R² to report a meaningful TTD (noise filter)
MIN_SLOPE_CO      = 0.05     # ppm/sample — minimum rising slope to consider
MIN_SLOPE_H2S     = 0.02     # ppm/sample


def _linear_regression(y_vals: np.ndarray) -> tuple[float, float, float]:
    """
    Fit a degree-1 polynomial to the y values indexed by sample number.
    Returns (slope, intercept, r_squared).
    """
    x = np.arange(len(y_vals), dtype=float)
    if len(x) < 3:
        return 0.0, float(y_vals[-1]) if len(y_vals) > 0 else 0.0, 0.0

    coeffs = np.polyfit(x, y_vals, 1)
    slope, intercept = float(coeffs[0]), float(coeffs[1])

    # R² calculation
    y_hat  = np.polyval(coeffs, x)
    ss_res = float(np.sum((y_vals - y_hat) ** 2))
    ss_tot = float(np.sum((y_vals - np.mean(y_vals)) ** 2))
    r2     = 1.0 - (ss_res / ss_tot) if ss_tot > 1e-9 else 0.0

    return slope, intercept, r2


def _ttd_minutes(
    current_value: float,
    slope: float,              # per sample (≈ per minute in demo data)
    threshold: float,
    sample_interval_minutes: float,
) -> Optional[float]:
    """
    Compute how many minutes until `current_value` reaches `threshold`
    given the linear `slope` per sample.
    Returns None if the threshold is already breached or slope is non-positive.
    """
    if slope <= 0:
        return None
    if current_value >= threshold:
        return 0.0  # already breached

    samples_needed = (threshold - current_value) / slope
    minutes_needed = samples_needed * sample_interval_minutes
    if minutes_needed > MAX_TTD_MINUTES:
        return None  # Not imminently dangerous
    return round(minutes_needed, 1)


def forecast_zone(
    zone_id: str,
    db: Session,
    plant_id: Optional[str] = None,
    lookback: int = LOOKBACK_READINGS,
) -> Dict[str, Any]:
    """
    Compute TTD forecasts for a single zone.

    Parameters
    ----------
    zone_id  : Zone identifier.
    db       : SQLAlchemy session.
    plant_id : Optional plant filter.
    lookback : Number of readings to regress over.

    Returns
    -------
    A dict with keys:
        zone_id, zone_name, plant_id, evaluation_time,
        co_ppm_current, h2s_ppm_current,
        co_ttd_action, co_ttd_high,        # minutes | None
        h2s_ttd_action, h2s_ttd_high,      # minutes | None
        co_slope, h2s_slope,               # ppm/sample
        co_r2, h2s_r2,                     # goodness of fit
        trend_co, trend_h2s,               # 'rising' | 'stable' | 'falling'
        sample_interval_minutes,
        confidence,                        # 'high' | 'medium' | 'low'
        overall_ttd_minutes,               # minimum non-None TTD for UI badge
        alert_level,                       # 'imminent' | 'warning' | 'safe'
    """
    # ---- Resolve zone ----
    zone_filter = [Zone.zone_id == zone_id]
    if plant_id:
        zone_filter.append(Zone.plant_id == plant_id)
    zone_row = db.query(Zone).filter(*zone_filter).first()
    zone_name = zone_row.name if zone_row else zone_id
    resolved_plant_id = zone_row.plant_id if zone_row else (plant_id or "unknown")

    # ---- Fetch last N readings ----
    q = (
        db.query(SensorReading)
        .filter(SensorReading.zone_id == zone_id)
    )
    if plant_id:
        q = q.filter(SensorReading.plant_id == plant_id)
    rows: List[SensorReading] = (
        q.order_by(desc(SensorReading.timestamp))
        .limit(lookback)
        .all()
    )

    if not rows:
        return _empty_forecast(zone_id, zone_name, resolved_plant_id)

    # Reverse so oldest-first (left-to-right order for regression)
    rows = list(reversed(rows))

    co_vals   = np.array([r.co_ppm for r in rows],   dtype=float)
    h2s_vals  = np.array([r.h2s_ppm for r in rows],  dtype=float)

    # Estimate sample interval in minutes from timestamps
    if len(rows) >= 2:
        dt_seconds = (rows[-1].timestamp - rows[0].timestamp).total_seconds()
        sample_interval_min = max(0.5, dt_seconds / max(1, len(rows) - 1) / 60)
    else:
        sample_interval_min = 1.0

    # ---- Regression ----
    co_slope,  co_intercept,  co_r2  = _linear_regression(co_vals)
    h2s_slope, h2s_intercept, h2s_r2 = _linear_regression(h2s_vals)

    co_current  = float(co_vals[-1])
    h2s_current = float(h2s_vals[-1])

    # Only compute TTD if slope exceeds noise threshold and R² is meaningful
    co_ttd_action: Optional[float]  = None
    co_ttd_high:   Optional[float]  = None
    h2s_ttd_action: Optional[float] = None
    h2s_ttd_high:   Optional[float] = None

    if co_slope >= MIN_SLOPE_CO and co_r2 >= MIN_R2:
        co_ttd_action = _ttd_minutes(co_current, co_slope, CO_ACTION_LEVEL, sample_interval_min)
        co_ttd_high   = _ttd_minutes(co_current, co_slope, CO_HIGH_THRESHOLD, sample_interval_min)

    if h2s_slope >= MIN_SLOPE_H2S and h2s_r2 >= MIN_R2:
        h2s_ttd_action = _ttd_minutes(h2s_current, h2s_slope, H2S_ACTION_LEVEL, sample_interval_min)
        h2s_ttd_high   = _ttd_minutes(h2s_current, h2s_slope, H2S_HIGH_THRESHOLD, sample_interval_min)

    # Trend labels
    def trend_label(slope: float, min_slope: float) -> str:
        if slope >= min_slope:
            return "rising"
        elif slope <= -min_slope:
            return "falling"
        return "stable"

    trend_co  = trend_label(co_slope, MIN_SLOPE_CO)
    trend_h2s = trend_label(h2s_slope, MIN_SLOPE_H2S)

    # Overall TTD (minimum non-None among action-level TTDs)
    ttd_candidates = [v for v in [co_ttd_action, h2s_ttd_action] if v is not None]
    overall_ttd = round(min(ttd_candidates), 1) if ttd_candidates else None

    # Alert level
    if overall_ttd is not None and overall_ttd <= 10:
        alert_level = "imminent"
    elif overall_ttd is not None and overall_ttd <= 30:
        alert_level = "warning"
    else:
        alert_level = "safe"

    # Confidence
    avg_r2 = (co_r2 + h2s_r2) / 2
    if avg_r2 >= 0.7:
        confidence = "high"
    elif avg_r2 >= 0.4:
        confidence = "medium"
    else:
        confidence = "low"

    return {
        "zone_id":                 zone_id,
        "zone_name":               zone_name,
        "plant_id":                resolved_plant_id,
        "evaluation_time":         rows[-1].timestamp.isoformat(),
        "lookback_readings_used":  len(rows),
        "sample_interval_minutes": round(sample_interval_min, 2),

        # Current sensor values
        "co_ppm_current":   round(co_current, 2),
        "h2s_ppm_current":  round(h2s_current, 3),

        # CO projections
        "co_slope":      round(co_slope, 4),
        "co_r2":         round(co_r2, 3),
        "trend_co":      trend_co,
        "co_ttd_action": co_ttd_action,   # minutes to CO action level (35 ppm)
        "co_ttd_high":   co_ttd_high,     # minutes to CO high alarm (100 ppm)

        # H2S projections
        "h2s_slope":       round(h2s_slope, 4),
        "h2s_r2":          round(h2s_r2, 3),
        "trend_h2s":       trend_h2s,
        "h2s_ttd_action":  h2s_ttd_action,  # minutes to H2S action level (5 ppm)
        "h2s_ttd_high":    h2s_ttd_high,    # minutes to H2S high alarm (10 ppm)

        # Summary
        "overall_ttd_minutes": overall_ttd,
        "alert_level":         alert_level,  # 'imminent' | 'warning' | 'safe'
        "confidence":          confidence,   # 'high' | 'medium' | 'low'
    }


def _empty_forecast(zone_id: str, zone_name: str, plant_id: str) -> Dict[str, Any]:
    """Return a safe-state forecast when no sensor data is available."""
    return {
        "zone_id":                 zone_id,
        "zone_name":               zone_name,
        "plant_id":                plant_id,
        "evaluation_time":         datetime.now().isoformat(),
        "lookback_readings_used":  0,
        "sample_interval_minutes": 1.0,
        "co_ppm_current":          0.0,
        "h2s_ppm_current":         0.0,
        "co_slope":                0.0,
        "co_r2":                   0.0,
        "trend_co":                "stable",
        "co_ttd_action":           None,
        "co_ttd_high":             None,
        "h2s_slope":               0.0,
        "h2s_r2":                  0.0,
        "trend_h2s":               "stable",
        "h2s_ttd_action":          None,
        "h2s_ttd_high":            None,
        "overall_ttd_minutes":     None,
        "alert_level":             "safe",
        "confidence":              "low",
    }


def forecast_all_zones(
    db: Session,
    plant_id: Optional[str] = None,
    lookback: int = LOOKBACK_READINGS,
) -> List[Dict[str, Any]]:
    """
    Compute TTD forecasts for all zones of the specified plant.

    Returns a list of forecast dicts sorted by overall_ttd ascending
    (most urgent first), with None TTDs at the end.
    """
    zone_query = db.query(Zone)
    if plant_id:
        zone_query = zone_query.filter(Zone.plant_id == plant_id)
    zones = zone_query.all()

    results = [
        forecast_zone(z.zone_id, db, plant_id=z.plant_id, lookback=lookback)
        for z in zones
    ]

    # Sort: imminent first, then warning, then safe
    level_order = {"imminent": 0, "warning": 1, "safe": 2}
    results.sort(key=lambda r: (
        level_order.get(r["alert_level"], 9),
        r["overall_ttd_minutes"] if r["overall_ttd_minutes"] is not None else 9999,
    ))

    return results
