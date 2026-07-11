from sqlalchemy import Column, String, Float, DateTime, Integer, Text, Boolean, Index
from db.database import Base

DEFAULT_PLANT_ID = "plant_coke_oven"


class Zone(Base):
    """Static reference data — named plant zones, scoped by plant_id."""
    __tablename__ = "zones"

    zone_id     = Column(String(32), primary_key=True)
    plant_id    = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    name        = Column(String(128), nullable=False)
    description = Column(Text, nullable=False)
    area_type   = Column(String(64), nullable=False)   # e.g. "High Risk", "Medium Risk"
    max_workers = Column(Integer, nullable=False)


class SensorReading(Base):
    """
    Time-series sensor readings per zone.
    scenario_id is NULL for normal data; set to 'scenario_N' during incident windows.
    scenario_id is intentionally omitted from API response schemas (Phase 2 use only).
    """
    __tablename__ = "sensor_readings"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    plant_id      = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    zone_id       = Column(String(32), nullable=False, index=True)
    timestamp     = Column(DateTime, nullable=False, index=True)
    co_ppm        = Column(Float, nullable=False)      # Carbon Monoxide, ppm
    h2s_ppm       = Column(Float, nullable=False)      # Hydrogen Sulphide, ppm
    temperature_c = Column(Float, nullable=False)      # Temperature, °C
    pressure_kpa  = Column(Float, nullable=False)      # Pressure, kPa
    scenario_id   = Column(String(32), nullable=True)  # Hidden from API — Phase 2 only

    __table_args__ = (
        Index("ix_sensor_plant_zone_ts", "plant_id", "zone_id", "timestamp"),
    )


class Permit(Base):
    """
    Permit-to-work (PTW) records.
    Types: 'hot_work', 'confined_space_entry', 'cold_work'
    Status: 'active', 'closed', 'cancelled'
    """
    __tablename__ = "permits"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    plant_id    = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    permit_ref  = Column(String(32), nullable=False, unique=True)  # e.g. PTW-2025-0001
    zone_id     = Column(String(32), nullable=False, index=True)
    permit_type = Column(String(64), nullable=False)
    issued_to   = Column(String(128), nullable=False)
    start_time  = Column(DateTime, nullable=False)
    end_time    = Column(DateTime, nullable=False)
    status      = Column(String(32), nullable=False)
    scenario_id = Column(String(32), nullable=True)


class MaintenanceLog(Base):
    """Maintenance activity logs per zone."""
    __tablename__ = "maintenance_logs"

    id            = Column(Integer, primary_key=True, autoincrement=True)
    plant_id      = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    log_ref       = Column(String(32), nullable=False, unique=True)  # e.g. MNT-2025-0001
    zone_id       = Column(String(32), nullable=False, index=True)
    activity_type = Column(String(128), nullable=False)
    technician    = Column(String(128), nullable=False)
    start_time    = Column(DateTime, nullable=False)
    end_time      = Column(DateTime, nullable=False)
    notes         = Column(Text, nullable=True)
    scenario_id   = Column(String(32), nullable=True)


class ShiftSchedule(Base):
    """Shift changeover schedule for the plant."""
    __tablename__ = "shift_schedule"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    plant_id   = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    shift_name = Column(String(64), nullable=False)   # e.g. "A Shift", "B Shift"
    start_time = Column(DateTime, nullable=False)
    end_time   = Column(DateTime, nullable=False)
    supervisor = Column(String(128), nullable=False)
    crew_count = Column(Integer, nullable=False)


class WorkerLocation(Base):
    """
    Zone-based worker location pings (not GPS — zone-level granularity only).
    Sampled every few minutes per worker.
    """
    __tablename__ = "worker_locations"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    plant_id    = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    worker_id   = Column(String(32), nullable=False, index=True)
    worker_name = Column(String(128), nullable=False)
    zone_id     = Column(String(32), nullable=False, index=True)
    timestamp   = Column(DateTime, nullable=False, index=True)
    scenario_id = Column(String(32), nullable=True)

    __table_args__ = (
        Index("ix_worker_plant_zone_ts", "plant_id", "zone_id", "timestamp"),
    )


class RiskAssessment(Base):
    """
    Phase 2 — Compound risk assessment result for a single zone at a point in time.

    One row per (plant_id, zone_id, timestamp) evaluation.
    Served by /api/v1/risk/* endpoints.

    Fields:
      risk_score      — 0.0–100.0 composite score (sum of fired rule weights + anomaly bump)
      risk_level      — band: low / medium / high / critical
      triggered_rules — comma-separated rule IDs that fired, e.g. "R1,R5"
      anomaly_flagged — True if z-score detector also flagged this sample
      anomaly_zscore  — compound z-score value (None if clean)
      explanation     — plain-language paragraph for a safety officer
      signal_snapshot — JSON string of sensor + context values at evaluation time
    """
    __tablename__ = "risk_assessments"

    id              = Column(Integer,    primary_key=True, autoincrement=True)
    plant_id        = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    zone_id         = Column(String(32), nullable=False, index=True)
    timestamp       = Column(DateTime,   nullable=False, index=True)

    risk_score      = Column(Float,       nullable=False)
    risk_level      = Column(String(16),  nullable=False)   # low/medium/high/critical
    triggered_rules = Column(String(256), nullable=True)    # e.g. "R1,R5"

    anomaly_flagged = Column(Boolean, nullable=False, default=False)
    anomaly_zscore  = Column(Float,   nullable=True)

    explanation     = Column(Text,    nullable=False)
    signal_snapshot = Column(Text,    nullable=True)        # JSON string

    __table_args__ = (
        Index("ix_risk_plant_zone_ts", "plant_id", "zone_id", "timestamp"),
    )


class ComplianceDeviation(Base):
    """
    Phase 8A — Compliance Audit deviation records found during safety inspections.
    """
    __tablename__ = "compliance_deviations"

    id                     = Column(Integer, primary_key=True, autoincrement=True)
    plant_id               = Column(String(32), nullable=False, index=True, default=DEFAULT_PLANT_ID)
    zone_id                = Column(String(32), nullable=True, index=True)  # None means global
    timestamp              = Column(DateTime, nullable=False, index=True)
    category               = Column(String(64), nullable=False)  # "Maintenance", "Permit", "Statutory"
    deviation_type         = Column(String(128), nullable=False)
    description            = Column(Text, nullable=False)
    regulatory_requirement = Column(Text, nullable=False)
    citation               = Column(String(256), nullable=False)
    severity               = Column(String(16), nullable=False)  # high/medium/low
    corrective_action      = Column(Text, nullable=False)
    resolved               = Column(Boolean, nullable=False, default=False)
