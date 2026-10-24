"""
detection/constants.py
======================
All static configuration for the PPE detection pipeline.

Keeping every threshold and zone polygon here means:
  - No magic numbers scattered through the codebase.
  - Operator can tune thresholds without touching model code.
  - Zone polygons can be updated per-camera without code changes.

Coordinate system for polygons:
  All (x, y) values are NORMALISED [0.0 – 1.0] relative to frame width/height.
  (0, 0) = top-left corner; (1, 1) = bottom-right corner.

Person-detect model (Step 1):  pretrained COCO yolo11n/yolov8n, class 0 only.
PPE model (Step 3a):           pretrained Roboflow ppe-detection model.
Zero-shot fallback (Step 3b):  YOLO-World with text prompts.
"""

from __future__ import annotations
from typing import Dict, List, Literal

# ---------------------------------------------------------------------------
# Canonical PPE item names used everywhere in this pipeline.
# Any model's raw class names must be mapped TO these.
# ---------------------------------------------------------------------------
PPE_ITEMS = ["helmet", "vest", "gloves", "boots", "goggles", "mask"]

# ---------------------------------------------------------------------------
# Per-class detection confidence thresholds.
# "worn" requires confidence >= HIGH threshold.
# "uncertain" if LOW <= confidence < HIGH.
# "missing" if clearly absent (negative class detected, or region visible and
#            no positive detection above LOW).
# ---------------------------------------------------------------------------
PPE_THRESHOLDS: Dict[str, Dict[str, float]] = {
    "helmet":  {"low": 0.30, "high": 0.55},
    "vest":    {"low": 0.30, "high": 0.50},
    "gloves":  {"low": 0.25, "high": 0.50},
    "boots":   {"low": 0.25, "high": 0.50},
    "goggles": {"low": 0.25, "high": 0.50},
    "mask":    {"low": 0.25, "high": 0.50},
}

# ---------------------------------------------------------------------------
# Person detection
# ---------------------------------------------------------------------------
PERSON_MIN_CONFIDENCE: float = 0.35   # YOLO confidence for class 0 (person)
PERSON_MIN_WIDTH_PX:   int   = 40     # ignore boxes narrower than this
PERSON_MIN_HEIGHT_PX:  int   = 80     # ignore boxes shorter than this

# Tiling parameters for large/wide frames
TILE_ROWS: int   = 2
TILE_COLS: int   = 2
TILE_OVERLAP: float = 0.15   # fractional overlap between adjacent tiles
TILE_NMS_IOU: float = 0.45   # IOU threshold for tile-merge NMS

# ---------------------------------------------------------------------------
# PPE crop preparation
# ---------------------------------------------------------------------------
PPE_CROP_PADDING: float = 0.10   # 10% padding around person bbox for PPE crop
PPE_CROP_MIN_SIDE: int  = 320    # shorter side of the PPE crop, in pixels

# ---------------------------------------------------------------------------
# Body-region validation (fraction of person box height)
# Items outside their expected band are rejected as false positives.
# ---------------------------------------------------------------------------
BODY_REGIONS: Dict[str, Dict[str, float]] = {
    #  item           top    bottom   left   right
    "helmet":  {"top": 0.00, "bot": 0.25, "lft": 0.15, "rgt": 0.85},
    "goggles": {"top": 0.00, "bot": 0.25, "lft": 0.15, "rgt": 0.85},
    "mask":    {"top": 0.05, "bot": 0.28, "lft": 0.15, "rgt": 0.85},
    "vest":    {"top": 0.20, "bot": 0.60, "lft": 0.05, "rgt": 0.95},
    "gloves":  {"top": 0.35, "bot": 0.65, "lft": 0.00, "rgt": 1.00},
    "boots":   {"top": 0.80, "bot": 1.00, "lft": 0.05, "rgt": 0.95},
}

# ---------------------------------------------------------------------------
# Temporal smoothing (Step 5)
# ---------------------------------------------------------------------------
SMOOTH_WINDOW_SIZE: int = 5   # number of frames to keep per person-track
SMOOTH_MIN_AGREE:   int = 3   # frames that must agree to confirm a status change
SMOOTH_IOU_MATCH:   float = 0.40   # IoU threshold to match a person across frames

# ---------------------------------------------------------------------------
# Optional VLM fallback (Step 4) — ANTHROPIC API
# Set USE_VLM_FALLBACK=True in your .env file or environment to enable.
# This is the ONLY external-API call in the pipeline; all other steps are
# purely local pretrained-model inference or pure geometry.
# ---------------------------------------------------------------------------
USE_VLM_FALLBACK: bool = False   # override via env var; checked at call time
VLM_RATE_LIMIT_PER_MINUTE: int = 5
VLM_CACHE_SECONDS: int = 2   # round bbox to nearest 2 s window for caching

# ---------------------------------------------------------------------------
# Camera Configuration (single source of truth for all cameras across the system)
# Refactored from 6 cameras to exactly 3 cameras:
#   CAM01: Live Laptop Webcam (main)
#   CAM02: Looped Video-File Feed (Blast Furnace Zone, PPE detection)
#   CAM03: Looped Video-File Feed (Gas Cleaning Plant, Fire/Smoke detection)
# ---------------------------------------------------------------------------
CAMERAS = [
    {
        "id": "CAM01",
        "label": "CAM 01 - Coke Oven Battery",
        "zone": "Coke Oven Battery",
        "source_type": "webcam",
        "source": None,
        "is_primary": True,
        "required_ppe": ["helmet", "vest"],
        "capture_interval_s": 2.5,
    },
    {
        "id": "CAM02",
        "label": "CAM 02 - Blast Furnace Zone",
        "zone": "Blast Furnace Zone",
        "source_type": "video_file",
        "source": "media/cam02_workers_ppe.mp4",
        "is_primary": False,
        "required_ppe": ["helmet", "vest", "gloves", "boots"],
        "capture_interval_s": 2.5,
    },
    {
        "id": "CAM03",
        "label": "CAM 03 - Gas Cleaning Plant",
        "zone": "Gas Cleaning Plant",
        "source_type": "video_file",
        "source": "media/cam03_fire_smoke.mp4",
        "is_primary": False,
        "detection_types": ["fire_smoke"],
        "capture_interval_s": 2.5,
    },
]

# ---------------------------------------------------------------------------
# Restricted zone polygons per camera.
# Polygons are normalized 0-1 and editable in one place.
# CAM03 has no PPE zone.
# ---------------------------------------------------------------------------
RESTRICTED_ZONES: Dict[str, Dict] = {
    "CAM01": {
        "zone_name": "Coke Oven Battery",
        "polygon": [(0.5, 0.0), (1.0, 0.0), (1.0, 1.0), (0.5, 1.0)],  # right half of frame
        "required_ppe": ["helmet", "vest"],
        "severity": "critical",
    },
    "CAM02": {
        "zone_name": "Blast Furnace Zone",
        "polygon": [(0.1, 0.1), (0.9, 0.1), (0.9, 0.95), (0.1, 0.95)],
        "required_ppe": ["helmet", "vest", "gloves", "boots"],
        "severity": "critical",
    },
}

# Backward compatibility lookup
CAMERA_BY_ID = {c["id"]: c for c in CAMERAS}

# ---------------------------------------------------------------------------
# Pretrained PPE model — class name → canonical item mapping.
# The Roboflow 'ppe-detection' model (roboflow-universe/ppe-detection)
# uses class names listed below. Update this dict if you swap models.
# Reference: https://universe.roboflow.com/roboflow-universe-projects/ppe-detection-0ne0n
# ---------------------------------------------------------------------------
PPE_MODEL_CLASS_MAP: Dict[str, str] = {
    # positive detections
    "helmet":             "helmet",
    "hard hat":           "helmet",
    "hardhat":            "helmet",
    "hard-hat":           "helmet",
    "safety helmet":      "helmet",
    "vest":               "vest",
    "safety vest":        "vest",
    "high-vis vest":      "vest",
    "high visibility vest": "vest",
    "gloves":             "gloves",
    "safety gloves":      "gloves",
    "boots":              "boots",
    "safety boots":       "boots",
    "goggles":            "goggles",
    "safety goggles":     "goggles",
    "protective goggles": "goggles",
    "mask":               "mask",
    "face mask":          "mask",
    "respirator":         "mask",
    # negative / missing detections (map to "missing" signal for that item)
    "no helmet":          "no_helmet",
    "no-helmet":          "no_helmet",
    "no hard hat":        "no_helmet",
    "no vest":            "no_vest",
    "no-vest":            "no_vest",
    "no gloves":          "no_gloves",
    "no boots":           "no_boots",
    "no goggles":         "no_goggles",
    "no mask":            "no_mask",
}

# Pretrained PPE YOLO model weights path (downloaded on first use by ultralytics).
# The model must be MIT/Apache-licensed for commercial use. 
# "keremberke/yolov8n-hard-hat-detection" is Apache-2.0; map it to "helmet" only.
# For a broader set, use "keremberke/yolov8s-PPE-detection" which covers all items.
PPE_MODEL_WEIGHTS: str = "keremberke/yolov8s-PPE-detection"

# YOLO-World text prompts for zero-shot fallback (Step 3b)
YOLO_WORLD_PROMPTS: List[str] = [
    "hard hat",
    "high-visibility safety vest",
    "safety gloves",
    "safety boots",
    "safety goggles",
    "face mask",
]

# Map YOLO-World prompt text → canonical item
YOLO_WORLD_CLASS_MAP: Dict[str, str] = {
    "hard hat":                    "helmet",
    "high-visibility safety vest": "vest",
    "safety gloves":               "gloves",
    "safety boots":                "boots",
    "safety goggles":              "goggles",
    "face mask":                   "mask",
}

# ---------------------------------------------------------------------------
# Alert integration
# ---------------------------------------------------------------------------
# Zones where missing PPE triggers Critical (not just High) severity
CRITICAL_ZONE_IDS = {"zone_cob1", "zone_ca"}
