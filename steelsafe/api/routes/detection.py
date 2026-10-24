"""
api/routes/detection.py
========================
FastAPI routes that expose the PPE detection pipeline.

Endpoints:
  POST /api/v1/detection/analyze-frame
      Accepts a frame as a base64 JPEG/PNG and returns FrameAnalysisResult.
      Used by the live webcam frontend (replaces the old boolean-only endpoint).

  POST /api/v1/detection/analyze-demo
      Accepts a file upload (multipart) for demo/offline image testing.

Both endpoints call the same analyze_frame() function — no duplicate pipeline.
Settings are read from the request payload (ppe_detection_enabled, confidence).
"""

from __future__ import annotations
import base64
import logging
from typing import Any, Dict, Optional

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from detection.detection_service import analyze_frame
from detection.models import FrameAnalysisResult

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/detection", tags=["PPE Detection"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------

class AnalyzeFrameRequest(BaseModel):
    """
    Live-webcam payload: base64-encoded JPEG/PNG frame.
    settings mirrors the SystemSettings page toggles.
    """
    camera_id: str
    frame_b64: str                      # base64-encoded image bytes
    image_format: str = "jpeg"          # "jpeg" | "png"
    settings: Optional[Dict[str, Any]] = None


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _b64_to_frame(b64: str) -> np.ndarray:
    """Decode a base64 image string into a BGR numpy array."""
    try:
        img_bytes = base64.b64decode(b64)
        arr       = np.frombuffer(img_bytes, dtype=np.uint8)
        frame     = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise ValueError("cv2.imdecode returned None")
        return frame
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid image data: {e}")


def _file_to_frame(data: bytes) -> np.ndarray:
    """Decode raw image bytes into a BGR numpy array."""
    arr   = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(status_code=400, detail="Could not decode uploaded image.")
    return frame


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post(
    "/analyze-frame",
    response_model=FrameAnalysisResult,
    summary="Analyze a single webcam frame for PPE violations",
)
async def post_analyze_frame(payload: AnalyzeFrameRequest):
    """
    Accepts a base64-encoded frame and runs the full 6-step PPE detection
    pipeline:
      1. Person detection (pretrained YOLO COCO)
      2. Restricted-zone membership (shapely polygon)
      3. Per-person PPE detection (pretrained PPE YOLO + YOLO-World)
      4. Optional VLM fallback (Anthropic, gated by config flag)
      5. Temporal smoothing (5-frame majority vote)
      6. Zone compliance evaluation

    Returns a FrameAnalysisResult with one WorkerRecord per detected person.
    """
    frame = _b64_to_frame(payload.frame_b64)
    try:
        # Respect settings: ppe_detection_enabled, detection_confidence_threshold
        settings = payload.settings or {}
        result = analyze_frame(frame, payload.camera_id, settings)

        # Store latest webcam frame & analysis result in LatestFrameStore
        from detection.camera_sources import LatestFrameStore
        ret, buf = cv2.imencode(".jpg", frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
        if ret:
            LatestFrameStore().update_webcam(payload.camera_id, buf.tobytes(), result)
    except Exception as e:
        logger.exception("[detection] analyze_frame failed")
        raise HTTPException(status_code=500, detail=str(e))
    return result


@router.post(
    "/analyze-demo",
    response_model=FrameAnalysisResult,
    summary="Analyze an uploaded demo image for PPE violations",
)
async def post_analyze_demo(
    camera_id: str = Form("cam_01"),
    ppe_detection_enabled: bool = Form(True),
    detection_confidence_threshold: float = Form(0.35),
    ppe_backend: str = Form("both"),
    file: UploadFile = File(...),
):
    """
    Multipart upload endpoint for offline/demo image testing.
    Uses the same analyze_frame() pipeline as the live webcam endpoint —
    no separate detection path.
    """
    data  = await file.read()
    frame = _file_to_frame(data)
    settings = {
        "ppe_detection_enabled":          ppe_detection_enabled,
        "detection_confidence_threshold": detection_confidence_threshold,
        "ppe_backend":                    ppe_backend,
    }
    try:
        result = analyze_frame(frame, camera_id, settings)
    except Exception as e:
        logger.exception("[detection] analyze_frame (demo) failed")
        raise HTTPException(status_code=500, detail=str(e))
    return result
