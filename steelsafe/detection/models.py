"""
detection/models.py
====================
Shared Pydantic models for the PPE detection pipeline.

These extend the existing FrameAnalysisResult concept from the earlier
combined person+PPE prompt into a single authoritative schema.

RULE: "uncertain" is NEVER silently promoted to "worn". Any code that
      reads a PPEItemState must explicitly handle all three values.
      This prevents missed violations from being silently swallowed.
"""

from __future__ import annotations
from datetime import datetime
from typing import Dict, List, Literal, Optional, Tuple
from pydantic import BaseModel, Field

# ---------------------------------------------------------------------------
# Three-state PPE status (per item, per person, per frame)
# ---------------------------------------------------------------------------
PPEItemState = Literal["worn", "missing", "uncertain"]

# ---------------------------------------------------------------------------
# Bounding box: [x1, y1, x2, y2] in absolute pixel coordinates.
# All pipeline functions work in pixel space; normalisation only happens
# at polygon membership tests where the polygon is stored normalised.
# ---------------------------------------------------------------------------
BBox = Tuple[float, float, float, float]   # x1, y1, x2, y2


class PersonBox(BaseModel):
    """A detected person bounding box with confidence."""
    person_index: int              # 0-based index in this frame
    bbox: BBox                     # (x1, y1, x2, y2) absolute pixels
    confidence: float              # YOLO class-0 confidence score
    in_restricted_zone: bool = False
    zone_name: Optional[str] = None


class PPEItemResult(BaseModel):
    """Raw single-item result from one PPE backend before merging."""
    item: str                      # canonical name from PPE_ITEMS
    state: PPEItemState
    confidence: float              # 0.0 if state is "missing" (no positive detection)
    source: str                    # "pretrained_ppe" | "zero_shot" | "vlm" | "geometry"


class PersonPPEStatus(BaseModel):
    """
    Per-person PPE status after:
      1. PPE backend inference
      2. Body-region geometry validation
      3. Optional VLM fallback (uncertain items in restricted zone only)
      4. Temporal smoothing over the last N frames

    Each item is one of: "worn" | "missing" | "uncertain"
    RULE: Never promote "uncertain" → "worn" implicitly.
    """
    person_index: int
    bbox: BBox
    in_restricted_zone: bool = False
    zone_name: Optional[str] = None

    # One entry per canonical PPE item
    helmet:  PPEItemState = "uncertain"
    vest:    PPEItemState = "uncertain"
    gloves:  PPEItemState = "uncertain"
    boots:   PPEItemState = "uncertain"
    goggles: PPEItemState = "uncertain"
    mask:    PPEItemState = "uncertain"

    # Raw per-item confidences (for logging/evaluation)
    confidences: Dict[str, float] = Field(default_factory=dict)


class ZoneComplianceResult(BaseModel):
    """
    Compliance evaluation for one person against their zone's required PPE list.
    """
    person_index: int
    in_restricted_zone: bool
    zone_name: Optional[str]
    required_ppe: List[str]
    # items required that are definitively "missing"
    violations: List[str] = Field(default_factory=list)
    # items required but status is "uncertain" — needs manual review
    needs_review: List[str] = Field(default_factory=list)
    # True only when violations == [] AND needs_review == []
    is_compliant: bool = True


class WorkerRecord(BaseModel):
    """Full per-worker record in the FrameAnalysisResult."""
    person_index: int
    bbox: BBox
    in_restricted_zone: bool
    zone_name: Optional[str]
    ppe: Dict[str, PPEItemState]         # {item: state}
    required_ppe: List[str]
    violations: List[str]
    needs_review: List[str]
    is_compliant: bool


class FrameAnalysisResult(BaseModel):
    """
    Top-level output of analyze_frame().
    This is the single canonical schema used by:
      - /api/detection/analyze-frame  (live webcam)
      - Video file feeds (CAM02, CAM03)
      - The demo-image path
    No duplicate pipeline; both paths call analyze_frame() and return this.
    """
    camera_id: str
    timestamp: datetime = Field(default_factory=datetime.now)

    total_persons_detected: int = 0
    persons_in_restricted_zone: int = 0

    workers: List[WorkerRecord] = Field(default_factory=list)

    # Percentage of in-zone workers who are fully compliant.
    # Undefined (None) when no workers are in restricted zones.
    zone_compliance_pct: Optional[float] = None

    # Pipeline diagnostics
    inference_ms: Optional[float] = None   # wall-clock inference time
    model_backend: Optional[str] = None    # which PPE backend was used

    # Detection flags (e.g. for CAM03 fire/smoke)
    smoke_detected: bool = False
    fire_detected: bool = False
    tile_badge: Optional[str] = None  # e.g. "RESTRICTED - VIOLATION", "RESTRICTED - OK", "NO ONE IN ZONE", "SAFE", "FIRE DETECTED", "SMOKE DETECTED"


class CameraConfig(BaseModel):
    id: str
    label: str
    zone: str
    source_type: Literal["webcam", "video_file"]
    source: Optional[str] = None
    is_primary: bool = False
    required_ppe: Optional[List[str]] = None
    detection_types: Optional[List[str]] = None
    capture_interval_s: float = 2.5


class CameraStatus(BaseModel):
    id: str
    label: str
    zone: str
    source_type: Literal["webcam", "video_file"]
    is_live: bool
    feed_badge: str  # "LIVE WEBCAM" | "RECORDED FEED"
    status: Literal["Online", "Offline"]
    status_color: str  # e.g. "#10b981" | "#ef4444"
    frame_url: str
    restricted_zone_polygon: Optional[List[Tuple[float, float]]] = None
    workers: List[WorkerRecord] = Field(default_factory=list)
    total_persons_detected: int = 0
    persons_in_restricted_zone: int = 0
    fps: float = 0.0
    last_updated: Optional[datetime] = None
    tile_badge: Optional[str] = None
    smoke_detected: bool = False
    fire_detected: bool = False
