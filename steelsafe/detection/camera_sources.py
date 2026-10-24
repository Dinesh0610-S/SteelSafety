"""
detection/camera_sources.py
===========================
Frame sources and CameraRegistry for SteelSafe Intelligence.

Manages the 3 configured cameras:
  - CAM01: Laptop Webcam (WebcamFrameSource)
  - CAM02: Blast Furnace Zone Video File (VideoFileFrameSource)
  - CAM03: Gas Cleaning Plant Video File (VideoFileFrameSource, fire & smoke)

Provides LatestFrameStore and background tick processing for recorded video feeds.
"""

from __future__ import annotations

import logging
import os
import threading
import time
from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np

from detection.constants import CAMERAS, RESTRICTED_ZONES
from detection.detection_service import analyze_frame
from detection.models import CameraConfig, CameraStatus, FrameAnalysisResult, WorkerRecord
from risk_engine.ppe_violations import record_violation

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# In-Memory Latest Frame & Analysis Store
# ---------------------------------------------------------------------------

class StoredCameraData:
    def __init__(self, camera_id: str, default_status: str = "Online"):
        self.camera_id: str = camera_id
        self.latest_frame_jpeg: Optional[bytes] = None
        self.latest_result: Optional[FrameAnalysisResult] = None
        self.latest_timestamp: Optional[datetime] = None
        self.fps: float = 0.0
        self.status: str = default_status
        self.tile_badge: Optional[str] = "STANDBY" if default_status == "Online" else "OFFLINE"
        self.smoke_detected: bool = False
        self.fire_detected: bool = False


class LatestFrameStore:
    """Thread-safe store for latest processed frames and analysis results."""
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._store: Dict[str, StoredCameraData] = {}
                for c in CAMERAS:
                    # Video file cameras default to Offline until verified available
                    default_st = "Online" if c["source_type"] == "webcam" else "Offline"
                    cls._instance._store[c["id"]] = StoredCameraData(c["id"], default_status=default_st)
            return cls._instance

    def update_webcam(self, camera_id: str, frame_jpeg: bytes, result: FrameAnalysisResult):
        with self._lock:
            data = self._store.setdefault(camera_id, StoredCameraData(camera_id))
            data.latest_frame_jpeg = frame_jpeg
            data.latest_result = result
            data.latest_timestamp = datetime.now()
            data.status = "Online"

            # Compute tile badge
            if result.persons_in_restricted_zone > 0:
                has_viol = any(w.in_restricted_zone and not w.is_compliant for w in result.workers)
                data.tile_badge = "RESTRICTED - VIOLATION" if has_viol else "RESTRICTED - OK"
            else:
                data.tile_badge = "NO ONE IN ZONE"

            data.fps = 1000.0 / result.inference_ms if (result.inference_ms and result.inference_ms > 0) else 15.0

    def update_video_feed(
        self,
        camera_id: str,
        frame_jpeg: bytes,
        result: FrameAnalysisResult,
        smoke_detected: bool = False,
        fire_detected: bool = False,
    ):
        with self._lock:
            data = self._store.setdefault(camera_id, StoredCameraData(camera_id))
            data.latest_frame_jpeg = frame_jpeg
            data.latest_result = result
            data.latest_timestamp = datetime.now()
            data.status = "Online"
            data.smoke_detected = smoke_detected
            data.fire_detected = fire_detected

            if camera_id == "CAM03":
                if fire_detected:
                    data.tile_badge = "FIRE DETECTED"
                elif smoke_detected:
                    data.tile_badge = "SMOKE DETECTED"
                else:
                    data.tile_badge = "SAFE"
            else:
                if result.persons_in_restricted_zone > 0:
                    has_viol = any(w.in_restricted_zone and not w.is_compliant for w in result.workers)
                    data.tile_badge = "RESTRICTED - VIOLATION" if has_viol else "RESTRICTED - OK"
                else:
                    data.tile_badge = "NO ONE IN ZONE"

            data.fps = 1000.0 / result.inference_ms if (result.inference_ms and result.inference_ms > 0) else 12.0

    def set_offline(self, camera_id: str):
        with self._lock:
            data = self._store.setdefault(camera_id, StoredCameraData(camera_id))
            data.status = "Offline"
            data.tile_badge = "OFFLINE"

    def get_data(self, camera_id: str) -> StoredCameraData:
        with self._lock:
            return self._store.setdefault(camera_id, StoredCameraData(camera_id))

    def is_stale(self, camera_id: str, max_age_seconds: float = 8.0) -> bool:
        with self._lock:
            data = self._store.get(camera_id)
            if not data or not data.latest_timestamp:
                return True
            return (datetime.now() - data.latest_timestamp).total_seconds() > max_age_seconds


# ---------------------------------------------------------------------------
# FrameSource Interface & Implementations
# ---------------------------------------------------------------------------

class FrameSource(ABC):
    @abstractmethod
    def get_frame(self) -> Optional[np.ndarray]:
        """Fetch next BGR frame as numpy array."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Return True if source is active and ready."""
        pass


class WebcamFrameSource(FrameSource):
    """
    Laptop Webcam source.
    Does NOT open the OS camera on the server.
    The browser captures frames and POSTs them to /api/detection/analyze-frame.
    """
    def __init__(self, camera_id: str):
        self.camera_id = camera_id
        self.store = LatestFrameStore()

    def get_frame(self) -> Optional[np.ndarray]:
        data = self.store.get_data(self.camera_id)
        if data.latest_frame_jpeg:
            arr = np.frombuffer(data.latest_frame_jpeg, dtype=np.uint8)
            return cv2.imdecode(arr, cv2.IMREAD_COLOR)
        return None

    def is_available(self) -> bool:
        return not self.store.is_stale(self.camera_id, max_age_seconds=8.0)


class VideoFileFrameSource(FrameSource):
    """
    Looped video file frame source using OpenCV VideoCapture.
    Skips frames according to capture_interval_s and loops at end.
    Degrades gracefully to Offline if the file is missing without crashing.
    """
    def __init__(self, camera_id: str, file_path: str, capture_interval_s: float = 2.5):
        self.camera_id = camera_id
        self.file_path = file_path
        self.capture_interval_s = capture_interval_s
        self.cap: Optional[cv2.VideoCapture] = None
        self.fps: float = 25.0
        self.total_frames: int = 0
        self._lock = threading.Lock()
        self._init_capture()

    def _init_capture(self):
        with self._lock:
            if not os.path.exists(self.file_path):
                # Check relative to repo root if path is relative
                alt_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), self.file_path)
                if os.path.exists(alt_path):
                    self.file_path = alt_path
                else:
                    logger.warning(f"[camera_sources] Video file missing for {self.camera_id}: {self.file_path}. Setting status Offline.")
                    LatestFrameStore().set_offline(self.camera_id)
                    self.cap = None
                    return

            try:
                self.cap = cv2.VideoCapture(self.file_path)
                if not self.cap.isOpened():
                    logger.warning(f"[camera_sources] Could not open video file {self.file_path}")
                    LatestFrameStore().set_offline(self.camera_id)
                    self.cap = None
                    return

                self.fps = self.cap.get(cv2.CAP_PROP_FPS) or 25.0
                self.total_frames = int(self.cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
                logger.info(f"[camera_sources] Initialized {self.camera_id} from {self.file_path} ({self.fps} fps, {self.total_frames} frames)")
            except Exception as e:
                logger.warning(f"[camera_sources] Error initializing capture for {self.camera_id}: {e}")
                self.cap = None

    def get_frame(self) -> Optional[np.ndarray]:
        with self._lock:
            if self.cap is None or not self.cap.isOpened():
                return None

            # Advance by skip frames based on capture_interval_s
            skip_frames = max(1, int(self.fps * self.capture_interval_s))
            current_pos = int(self.cap.get(cv2.CAP_PROP_POS_FRAMES))

            if self.total_frames > 0 and (current_pos + skip_frames >= self.total_frames):
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
            elif skip_frames > 1:
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, current_pos + skip_frames - 1)

            ret, frame = self.cap.read()
            if not ret or frame is None:
                # Loop back to 0
                self.cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                ret, frame = self.cap.read()

            return frame if ret else None

    def is_available(self) -> bool:
        return self.cap is not None and self.cap.isOpened()


# ---------------------------------------------------------------------------
# Simple Fast Fire & Smoke Heuristics for CAM03 (Pretrained/Color rules)
# ---------------------------------------------------------------------------

def detect_fire_and_smoke(frame: np.ndarray) -> Tuple[bool, bool]:
    """
    Color and intensity heuristics on the frame to detect fire or smoke without training.
    Fire: bright yellow-orange regions in HSV.
    Smoke: grayish diffuse low-saturation high-value regions.
    """
    if frame is None or frame.size == 0:
        return False, False

    hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)

    # Fire mask: Hue 0-25 & 160-180, High Saturation, High Value
    fire_mask1 = cv2.inRange(hsv, np.array([0, 120, 180]), np.array([25, 255, 255]))
    fire_mask2 = cv2.inRange(hsv, np.array([160, 120, 180]), np.array([180, 255, 255]))
    fire_mask = cv2.bitwise_or(fire_mask1, fire_mask2)
    fire_ratio = np.count_nonzero(fire_mask) / (frame.shape[0] * frame.shape[1])

    # Smoke mask: low saturation, medium-high value
    smoke_mask = cv2.inRange(hsv, np.array([0, 0, 140]), np.array([180, 45, 230]))
    smoke_ratio = np.count_nonzero(smoke_mask) / (frame.shape[0] * frame.shape[1])

    fire_detected = bool(fire_ratio > 0.015)
    smoke_detected = bool(smoke_ratio > 0.12)
    return fire_detected, smoke_detected


# ---------------------------------------------------------------------------
# Camera Registry
# ---------------------------------------------------------------------------

class CameraRegistry:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance.sources: Dict[str, FrameSource] = {}
                cls._instance.configs: Dict[str, CameraConfig] = {}
                cls._instance._init_cameras()
            return cls._instance

    def _init_cameras(self):
        for c in CAMERAS:
            cfg = CameraConfig(**c)
            self.configs[cfg.id] = cfg
            if cfg.source_type == "webcam":
                self.sources[cfg.id] = WebcamFrameSource(cfg.id)
            elif cfg.source_type == "video_file":
                self.sources[cfg.id] = VideoFileFrameSource(
                    cfg.id, cfg.source or "", cfg.capture_interval_s
                )

    def get_camera(self, camera_id: str) -> Optional[CameraConfig]:
        return self.configs.get(camera_id)

    def list_cameras(self) -> List[CameraConfig]:
        return list(self.configs.values())

    def get_source(self, camera_id: str) -> Optional[FrameSource]:
        return self.sources.get(camera_id)


# ---------------------------------------------------------------------------
# Background Video Feed Worker Loop
# ---------------------------------------------------------------------------

_worker_thread: Optional[threading.Thread] = None
_worker_running: bool = False

def _annotate_frame(frame: np.ndarray, result: FrameAnalysisResult, camera_id: str) -> np.ndarray:
    """Draw polygon and worker bounding boxes onto frame for recorded feed endpoint."""
    out = frame.copy()
    h, w = out.shape[:2]

    # Draw polygon if configured
    zone_cfg = RESTRICTED_ZONES.get(camera_id)
    if zone_cfg and "polygon" in zone_cfg:
        poly_pts = [
            (int(x * w), int(y * h)) for (x, y) in zone_cfg["polygon"]
        ]
        pts_arr = np.array(poly_pts, np.int32).reshape((-1, 1, 2))
        overlay = out.copy()
        cv2.fillPoly(overlay, [pts_arr], (0, 0, 255))
        cv2.addWeighted(overlay, 0.15, out, 0.85, 0, out)
        cv2.polylines(out, [pts_arr], True, (0, 0, 255), 2, cv2.LINE_AA)

    # Draw bounding boxes per person
    for worker in result.workers:
        x1, y1, x2, y2 = [int(v) for v in worker.bbox]
        if not worker.in_restricted_zone:
            color = (160, 160, 160) # Grey: outside zone
            label = "Outside Zone"
        elif worker.is_compliant:
            color = (0, 220, 100) # Green: in zone and compliant
            label = "Compliant"
        elif worker.violations:
            color = (0, 0, 255) # Red: violation
            label = f"Violation: {', '.join(worker.violations)}"
        else:
            color = (0, 180, 255) # Amber: needs review
            label = "Check PPE"

        cv2.rectangle(out, (x1, y1), (x2, y2), color, 2)
        cv2.putText(
            out, label, (x1, max(15, y1 - 8)),
            cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2, cv2.LINE_AA
        )

    return out


def _video_feeds_worker():
    global _worker_running
    registry = CameraRegistry()
    store = LatestFrameStore()
    logger.info("[camera_sources] Background video feed worker started.")

    while _worker_running:
        for cam_cfg in registry.list_cameras():
            if cam_cfg.source_type != "video_file":
                continue

            source = registry.get_source(cam_cfg.id)
            if not source or not source.is_available():
                store.set_offline(cam_cfg.id)
                continue

            frame = source.get_frame()
            if frame is None:
                continue

            try:
                # CAM01 = real live inference on laptop webcam
                # CAM02/CAM03 = real inference on recorded footage (same pipeline, different input source)
                smoke_detected, fire_detected = False, False
                if cam_cfg.id == "CAM03":
                    fire_detected, smoke_detected = detect_fire_and_smoke(frame)
                    result = analyze_frame(frame, cam_cfg.id, {"ppe_detection_enabled": False})
                    result.fire_detected = fire_detected
                    result.smoke_detected = smoke_detected
                else:
                    result = analyze_frame(frame, cam_cfg.id, {
                        "ppe_detection_enabled": True,
                        "detection_confidence_threshold": 0.35,
                    })

                # Annotate ready JPEG
                annotated = _annotate_frame(frame, result, cam_cfg.id)
                ret, buf = cv2.imencode(".jpg", annotated, [int(cv2.IMWRITE_JPEG_QUALITY), 80])
                if ret:
                    store.update_video_feed(
                        cam_cfg.id,
                        buf.tobytes(),
                        result,
                        smoke_detected=smoke_detected,
                        fire_detected=fire_detected,
                    )
            except Exception as e:
                logger.warning(f"[camera_sources] Error in video feed loop for {cam_cfg.id}: {e}")

        time.sleep(1.5)


def start_video_feeds_worker():
    global _worker_thread, _worker_running
    if _worker_running:
        return
    _worker_running = True
    _worker_thread = threading.Thread(target=_video_feeds_worker, daemon=True, name="VideoFeedsWorker")
    _worker_thread.start()


def stop_video_feeds_worker():
    global _worker_running
    _worker_running = False
