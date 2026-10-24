"""
api/routes/live_monitoring_router.py
====================================
Live Monitoring and Camera Feeds router for SteelSafe Intelligence.

Implements:
  - GET /api/live/cameras
  - GET /api/live/frame/{camera_id}
  - GET /api/live/stats
  - GET /api/live/system-health
  - GET /api/dashboard/cameras (compatibility alias for Dashboard)

Refactored to 3 cameras: CAM01 (Laptop Webcam), CAM02 (Video File), CAM03 (Video File).
All camera lists and feeds are derived strictly from CameraRegistry and CAMERAS.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func
from sqlalchemy.orm import Session

from db.database import get_db
from db.models import PPEViolationLog
from detection.camera_sources import CameraRegistry, LatestFrameStore
from detection.constants import CAMERAS, RESTRICTED_ZONES
from detection.models import CameraStatus

router = APIRouter(prefix="/live", tags=["Live Monitoring"])
dashboard_router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


def _build_camera_status(cam_id: str) -> Dict[str, Any]:
    registry = CameraRegistry()
    store = LatestFrameStore()
    cfg = registry.get_camera(cam_id)
    if not cfg:
        raise HTTPException(status_code=404, detail=f"Camera '{cam_id}' not found.")

    data = store.get_data(cam_id)
    zone_cfg = RESTRICTED_ZONES.get(cam_id)
    poly = zone_cfg["polygon"] if (zone_cfg and "polygon" in zone_cfg) else None

    # Determine live status: webcam is live if not stale; video_file is live if status is Online
    if cfg.source_type == "webcam":
        is_live = not store.is_stale(cam_id, max_age_seconds=8.0)
        status = "Online" if is_live else "Offline"
        status_color = "#10b981" if is_live else "#ef4444"
        feed_badge = "LIVE WEBCAM"
    else:
        is_live = False
        status = data.status
        status_color = "#10b981" if status == "Online" else "#ef4444"
        feed_badge = "RECORDED FEED"

    workers_list = []
    tot_persons = 0
    in_zone_persons = 0
    if data.latest_result:
        workers_list = [w.model_dump() for w in data.latest_result.workers]
        tot_persons = data.latest_result.total_persons_detected
        in_zone_persons = data.latest_result.persons_in_restricted_zone

    return {
        "id": cfg.id,
        "label": cfg.label,
        "zone": cfg.zone,
        "source_type": cfg.source_type,
        "is_live": is_live,
        "feed_badge": feed_badge,
        "status": status,
        "status_color": status_color,
        "frame_url": f"/api/live/frame/{cfg.id}",
        "restricted_zone_polygon": poly,
        "workers": workers_list,
        "total_persons_detected": tot_persons,
        "persons_in_restricted_zone": in_zone_persons,
        "fps": round(data.fps, 1),
        "last_updated": data.latest_timestamp.isoformat() if data.latest_timestamp else None,
        "tile_badge": data.tile_badge,
        "smoke_detected": data.smoke_detected,
        "fire_detected": data.fire_detected,
    }


@router.get("/cameras", summary="Get exactly the 3 cameras configured in the system")
@dashboard_router.get("/cameras", summary="Get exactly the 3 cameras for Dashboard")
def get_cameras():
    """
    Returns exactly the 3 cameras from CameraRegistry:
    CAM01 (Live Laptop Webcam), CAM02 (Recorded Feed), CAM03 (Recorded Feed).
    """
    registry = CameraRegistry()
    return [_build_camera_status(c.id) for c in registry.list_cameras()]


@router.get("/frame/{camera_id}", summary="Get latest annotated-ready JPEG for recorded feeds")
def get_camera_frame(camera_id: str):
    store = LatestFrameStore()
    data = store.get_data(camera_id)
    if not data.latest_frame_jpeg:
        # Generate a small fallback placeholder image
        import cv2
        import numpy as np
        placeholder = np.zeros((360, 640, 3), dtype=np.uint8)
        cv2.putText(
            placeholder, f"{camera_id} - Feed Inactive / Connecting...", (60, 180),
            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (200, 200, 200), 2, cv2.LINE_AA
        )
        ret, buf = cv2.imencode(".jpg", placeholder)
        return Response(content=buf.tobytes(), media_type="image/jpeg")

    return Response(content=data.latest_frame_jpeg, media_type="image/jpeg")


@router.get("/stats", summary="Live stats across the 3 cameras")
def get_live_stats(db: Session = Depends(get_db)):
    """
    Active cameras count (max 3), total workers detected, ai alerts today, avg fps.
    """
    registry = CameraRegistry()
    store = LatestFrameStore()
    cams = registry.list_cameras()

    active_count = 0
    total_workers = 0
    fps_sum = 0.0

    for c in cams:
        st = _build_camera_status(c.id)
        if st["status"] == "Online":
            active_count += 1
        total_workers += st["total_persons_detected"]
        fps_sum += st["fps"]

    avg_fps = round(fps_sum / max(1, len(cams)), 1)

    # Real AI alerts today from DB
    today_start = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    alerts_today = (
        db.query(func.count(PPEViolationLog.id))
        .filter(PPEViolationLog.timestamp >= today_start)
        .scalar()
    ) or 0

    return {
        "active_cameras": active_count,
        "total_cameras": 3,
        "workers_detected": total_workers,
        "ai_alerts_today": alerts_today,
        "avg_fps": avg_fps,
    }


@router.get("/system-health", summary="System health percentage based on active cameras")
def get_system_health():
    registry = CameraRegistry()
    cams = registry.list_cameras()
    online_count = 0
    for c in cams:
        st = _build_camera_status(c.id)
        if st["status"] == "Online":
            online_count += 1

    health_pct = round((online_count / 3.0) * 100, 1)
    return {
        "camera_health_pct": health_pct,
        "online_cameras": online_count,
        "total_cameras": 3,
        "status": "healthy" if health_pct >= 66.0 else "degraded",
    }
