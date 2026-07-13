"""
Pydantic response models for all API endpoints.

NOTE: scenario_id is intentionally absent from all response schemas.
It exists only in the DB and is reserved for Phase 2 ML/risk logic.
"""

from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, ConfigDict


# ---------------------------------------------------------------------------
# Zones
# ---------------------------------------------------------------------------

class ZoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    zone_id:     str
    plant_id:    str
    name:        str
    description: str
    area_type:   str
    max_workers: int


# ---------------------------------------------------------------------------
# Sensor Readings
# ---------------------------------------------------------------------------

class SensorReadingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    plant_id:      str
    zone_id:       str
    timestamp:     datetime
    co_ppm:        float
    h2s_ppm:       float
    temperature_c: float
    pressure_kpa:  float
    # scenario_id deliberately excluded


class CurrentSensorResponse(BaseModel):
    """Latest reading for a single zone."""
    zone_id:       str
    zone_name:     str
    timestamp:     datetime
    co_ppm:        float
    h2s_ppm:       float
    temperature_c: float
    pressure_kpa:  float


# ---------------------------------------------------------------------------
# Permits
# ---------------------------------------------------------------------------

class PermitResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          int
    plant_id:    str
    permit_ref:  str
    zone_id:     str
    permit_type: str
    issued_to:   str
    start_time:  datetime
    end_time:    datetime
    status:      str
    # scenario_id deliberately excluded


# ---------------------------------------------------------------------------
# Maintenance
# ---------------------------------------------------------------------------

class MaintenanceLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:            int
    plant_id:      str
    log_ref:       str
    zone_id:       str
    activity_type: str
    technician:    str
    start_time:    datetime
    end_time:      datetime
    notes:         Optional[str] = None
    # scenario_id deliberately excluded


# ---------------------------------------------------------------------------
# Shifts
# ---------------------------------------------------------------------------

class ShiftScheduleResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:         int
    plant_id:   str
    shift_name: str
    start_time: datetime
    end_time:   datetime
    supervisor: str
    crew_count: int


# ---------------------------------------------------------------------------
# Worker Locations
# ---------------------------------------------------------------------------

class WorkerLocationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:          int
    plant_id:    str
    worker_id:   str
    worker_name: str
    zone_id:     str
    timestamp:   datetime
    # scenario_id deliberately excluded


# ---------------------------------------------------------------------------
# Admin
# ---------------------------------------------------------------------------

class RegenerateResponse(BaseModel):
    model_config = ConfigDict(extra="allow")

    status:            str
    t0_simulated:      str
    shift_duration_h:  int
    risk_assessments:  int
    compliance_deviations: int


# ---------------------------------------------------------------------------
# Generic paginated list wrapper
# ---------------------------------------------------------------------------

class PaginatedResponse(BaseModel):
    total:  int
    limit:  int
    offset: int
    items:  List


# ---------------------------------------------------------------------------
# Phase 2 — Risk Assessment
# ---------------------------------------------------------------------------

class RuleResultSchema(BaseModel):
    """Single rule evaluation result — included in the signal_snapshot."""
    rule_id:            str
    name:               str
    fired:              bool
    score:              float


class RiskAssessmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:              int
    plant_id:        str
    zone_id:         str
    timestamp:       datetime
    risk_score:      float
    risk_level:      str            # low / medium / high / critical
    triggered_rules: Optional[str] = None   # comma-separated rule IDs, e.g. "R1,R5"
    anomaly_flagged: bool
    anomaly_zscore:  Optional[float] = None
    explanation:     Optional[str] = None
    signal_snapshot: Optional[str] = None   # JSON string — parse client-side
    cost_impact:     Optional[Dict[str, Any]] = None


class ZoneRiskSummary(BaseModel):
    """Lightweight current-risk snapshot for the /risk/current list endpoint."""
    zone_id:         str
    zone_name:       str
    timestamp:       datetime
    risk_score:      float
    risk_level:      str
    triggered_rules: Optional[str] = None
    anomaly_flagged: bool
    explanation:     str


# ---------------------------------------------------------------------------
# Chat RAG
# ---------------------------------------------------------------------------

class CitationItem(BaseModel):
    source: str
    title: str
    content: str
    score: float

class ChatRequest(BaseModel):
    query: str
    zone_id: Optional[str] = None

class ChatResponse(BaseModel):
    answer: str
    citations: List[CitationItem]
    zone_snapshot: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# CCTV Camera
# ---------------------------------------------------------------------------

class CameraStateRequest(BaseModel):
    zone_id: str
    person_detected: bool
    ppe_compliant: bool


class PPEViolationRequest(BaseModel):
    """
    Payload sent by the frontend CCTV panel when a PPE violation is detected
    (currently always via manual_override; future model_inferred once a custom
    PPE-trained model is deployed).
    """
    zone_id:           str
    plant_id:          str
    ppe_items_missing: List[str]          # e.g. ['hard_hat']
    confidence_pct:    float = 0.0        # 0 = manual override; 0–100 for model-inferred
    detection_method:  str  = "manual_override"  # 'manual_override' | 'model_inferred'
    risk_score_at_time: Optional[float] = None


class PPEViolationEvent(BaseModel):
    """A single PPE violation event record served by the API."""
    id:                 int
    zone_id:            str
    zone_name:          str
    plant_id:           str
    timestamp:          str               # ISO 8601 string
    ppe_items_missing:  List[str]
    confidence_pct:     float
    detection_method:   str               # 'manual_override' | 'model_inferred'
    status:             str               # 'open' | 'acknowledged' | 'resolved'
    risk_score_at_time: Optional[float] = None


# ---------------------------------------------------------------------------
# Quality & Compliance Audit (Phase 8A)
# ---------------------------------------------------------------------------

class ComplianceDeviationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id:                     int
    plant_id:               str
    zone_id:                Optional[str] = None
    timestamp:              datetime
    category:               str
    deviation_type:         str
    description:            str
    regulatory_requirement: str
    citation:               str
    severity:               str
    corrective_action:      str
    resolved:               bool


# ---------------------------------------------------------------------------
# Plants (Phase 8B)
# ---------------------------------------------------------------------------

class PlantResponse(BaseModel):
    plant_id:    str
    name:        str
    short_name:  str
    zone_count:  int


class PlantSummaryItem(BaseModel):
    plant_id:            str
    name:                str
    short_name:          str
    zone_count:          int
    highest_risk_level:  str
    active_alerts_count: int
    compliance_score:    float
