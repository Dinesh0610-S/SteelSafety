"""
detection/detection_service.py
===============================
Core PPE detection pipeline for SteelSafe Intelligence.

All six pipeline steps are implemented as independent, testable functions:

  Step 1 — detect_persons()           pretrained YOLO, COCO weights, class 0
  Step 2 — filter_by_restricted_zone() polygon membership via shapely
  Step 3 — detect_ppe_for_person()    pretrained PPE YOLO + optional zero-shot
  Step 4 — verify_with_vlm()          optional Anthropic API fallback (gated)
  Step 5 — smooth_over_time()         5-frame majority-vote smoothing
  Step 6 — evaluate_zone_compliance() compares PPE status vs. zone requirements

Public entry point:
  analyze_frame(frame, camera_id, settings) -> FrameAnalysisResult

Integration notes:
  - Writes one PPEDetectionLog row per person per processed frame.
  - Creates an Alert via record_violation() when a zone violation is found.
  - Reads ppe_detection_enabled and detection_confidence_threshold from
    settings dict at call time — never cached.
  - If zero persons are detected, returns zeros + empty workers list (no error).
"""

from __future__ import annotations

import json
import logging
import os
import time
from collections import defaultdict, deque
from datetime import datetime
from typing import Dict, List, Optional, Tuple, Any

import cv2
import numpy as np

from detection.constants import (
    BODY_REGIONS,
    CRITICAL_ZONE_IDS,
    PERSON_MIN_CONFIDENCE,
    PERSON_MIN_HEIGHT_PX,
    PERSON_MIN_WIDTH_PX,
    PPE_CROP_MIN_SIDE,
    PPE_CROP_PADDING,
    PPE_ITEMS,
    PPE_MODEL_CLASS_MAP,
    PPE_MODEL_WEIGHTS,
    PPE_THRESHOLDS,
    RESTRICTED_ZONES,
    SMOOTH_IOU_MATCH,
    SMOOTH_MIN_AGREE,
    SMOOTH_WINDOW_SIZE,
    TILE_COLS,
    TILE_NMS_IOU,
    TILE_OVERLAP,
    TILE_ROWS,
    USE_VLM_FALLBACK,
    VLM_CACHE_SECONDS,
    VLM_RATE_LIMIT_PER_MINUTE,
    YOLO_WORLD_CLASS_MAP,
    YOLO_WORLD_PROMPTS,
)
from detection.models import (
    BBox,
    FrameAnalysisResult,
    PPEItemResult,
    PPEItemState,
    PersonBox,
    PersonPPEStatus,
    WorkerRecord,
    ZoneComplianceResult,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Lazy model loaders — models are loaded once and cached in module globals.
# Using lazy loading means the API server starts fast even if GPU isn't ready.
# ---------------------------------------------------------------------------

_person_model = None   # YOLO person detector (COCO weights)
_ppe_model    = None   # pretrained PPE YOLO model
_yw_model     = None   # YOLO-World zero-shot model

def _load_person_model():
    """Step 1 — PRETRAINED-MODEL INFERENCE: YOLOv8n on COCO (no fine-tuning)."""
    global _person_model
    if _person_model is None:
        from ultralytics import YOLO
        _person_model = YOLO("yolo11n.pt")   # auto-downloads on first use
        logger.info("[detection] Person model loaded: yolo11n.pt (COCO)")
    return _person_model

def _load_ppe_model():
    """Step 3a — PRETRAINED-MODEL INFERENCE: pretrained PPE YOLO (no fine-tuning)."""
    global _ppe_model
    if _ppe_model is None:
        try:
            from ultralytics import YOLO
            # keremberke/yolov8s-PPE-detection is MIT-licensed and covers
            # helmet, vest, gloves, boots, goggles, mask, plus negative classes.
            _ppe_model = YOLO(PPE_MODEL_WEIGHTS)
            logger.info(f"[detection] PPE model loaded: {PPE_MODEL_WEIGHTS}")
        except Exception as e:
            logger.warning(f"[detection] Could not load PPE model '{PPE_MODEL_WEIGHTS}': {e}")
            _ppe_model = None
    return _ppe_model

def _load_yolo_world():
    """Step 3b — PRETRAINED-MODEL INFERENCE: YOLO-World for zero-shot text prompts."""
    global _yw_model
    if _yw_model is None:
        try:
            from ultralytics import YOLOWorld
            _yw_model = YOLOWorld("yolov8s-world.pt")
            _yw_model.set_classes(YOLO_WORLD_PROMPTS)
            logger.info("[detection] YOLO-World model loaded for zero-shot PPE detection")
        except Exception as e:
            logger.warning(f"[detection] Could not load YOLO-World: {e}")
            _yw_model = None
    return _yw_model


# ---------------------------------------------------------------------------
# In-memory stores (lightweight; cleared on server restart — intentional)
# ---------------------------------------------------------------------------

# Temporal smoothing history: camera_id → track_key → deque of {item: state}
_smooth_history: Dict[str, Dict[str, deque]] = defaultdict(lambda: defaultdict(
    lambda: deque(maxlen=SMOOTH_WINDOW_SIZE)
))

# Per-camera last-frame person tracks for IoU matching
_last_tracks: Dict[str, List[BBox]] = {}

# VLM rate-limit state
_vlm_call_times: deque = deque(maxlen=VLM_RATE_LIMIT_PER_MINUTE)
_vlm_cache: Dict[str, Dict[str, PPEItemState]] = {}


# ===========================================================================
# STEP 1 — detect_persons(frame) -> List[PersonBox]
# PRETRAINED-MODEL INFERENCE: YOLO COCO weights, class 0 (person) only.
# ===========================================================================

def _nms(boxes: List[BBox], scores: List[float], iou_threshold: float) -> List[int]:
    """Pure-NumPy non-maximum suppression. Returns kept indices."""
    if not boxes:
        return []
    arr = np.array(boxes, dtype=float)
    sc  = np.array(scores, dtype=float)
    x1, y1, x2, y2 = arr[:,0], arr[:,1], arr[:,2], arr[:,3]
    areas = (x2 - x1) * (y2 - y1)
    order = sc.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        iou   = inter / (areas[i] + areas[order[1:]] - inter + 1e-6)
        order = order[np.where(iou <= iou_threshold)[0] + 1]
    return keep


def _run_yolo_on_frame(model, frame: np.ndarray, conf: float) -> Tuple[List[BBox], List[float]]:
    """
    Run YOLO on a single frame (or tile).
    Returns (boxes, scores) for class 0 (person) only.
    PRETRAINED-MODEL INFERENCE — no training, no fine-tuning.
    """
    results = model(frame, conf=conf, classes=[0], verbose=False)
    boxes, scores = [], []
    for r in results:
        for box in r.boxes:
            x1, y1, x2, y2 = box.xyxy[0].tolist()
            boxes.append((x1, y1, x2, y2))
            scores.append(float(box.conf[0]))
    return boxes, scores


def detect_persons(
    frame: np.ndarray, 
    conf_threshold: float = PERSON_MIN_CONFIDENCE,
    disable_tiling: bool = False
) -> List[PersonBox]:
    """
    STEP 1 — PRETRAINED-MODEL INFERENCE (YOLO COCO, class 0 only).

    For large frames (unless disable_tiling=True, e.g. for CAM01 laptop webcam),
    splits into a TILE_ROWS×TILE_COLS grid with TILE_OVERLAP
    fraction overlap, runs inference on each tile, maps detections back to
    full-frame coordinates, then merges with NMS so distant/small people
    near the frame edge are not missed.

    Boxes smaller than PERSON_MIN_WIDTH_PX × PERSON_MIN_HEIGHT_PX are
    discarded because they are too small to judge PPE reliably.

    Returns a list of PersonBox objects sorted by x1 (left-to-right).
    """
    model = _load_person_model()
    h, w  = frame.shape[:2]

    all_boxes:  List[BBox]  = []
    all_scores: List[float] = []

    # Decide whether to tile — disabled for CAM01 or if frame is small
    use_tiling = not disable_tiling and (w > 800 or h > 800)

    if use_tiling:
        # Build tile start coordinates
        tile_h = h / TILE_ROWS
        tile_w = w / TILE_COLS
        overlap_h = int(tile_h * TILE_OVERLAP)
        overlap_w = int(tile_w * TILE_OVERLAP)

        for row in range(TILE_ROWS):
            for col in range(TILE_COLS):
                y1_t = max(0, int(row * tile_h) - overlap_h)
                y2_t = min(h, int((row + 1) * tile_h) + overlap_h)
                x1_t = max(0, int(col * tile_w) - overlap_w)
                x2_t = min(w, int((col + 1) * tile_w) + overlap_w)

                tile = frame[y1_t:y2_t, x1_t:x2_t]
                if tile.size == 0:
                    continue

                # PRETRAINED-MODEL INFERENCE on tile
                t_boxes, t_scores = _run_yolo_on_frame(model, tile, conf_threshold)

                # Map tile coordinates → full-frame coordinates
                for (bx1, by1, bx2, by2), sc in zip(t_boxes, t_scores):
                    all_boxes.append((bx1 + x1_t, by1 + y1_t, bx2 + x1_t, by2 + y1_t))
                    all_scores.append(sc)
    else:
        # PRETRAINED-MODEL INFERENCE on full frame
        all_boxes, all_scores = _run_yolo_on_frame(model, frame, conf_threshold)

    # Merge tiles with NMS
    keep_idxs = _nms(all_boxes, all_scores, TILE_NMS_IOU)

    persons: List[PersonBox] = []
    for idx_i, idx in enumerate(keep_idxs):
        x1, y1, x2, y2 = all_boxes[idx]
        box_w = x2 - x1
        box_h = y2 - y1
        # Discard tiny boxes — too small to assess PPE reliably
        if box_w < PERSON_MIN_WIDTH_PX or box_h < PERSON_MIN_HEIGHT_PX:
            continue
        persons.append(PersonBox(
            person_index=idx_i,
            bbox=(x1, y1, x2, y2),
            confidence=all_scores[idx],
        ))

    # Re-index after filtering
    for i, p in enumerate(persons):
        p.person_index = i

    logger.debug(f"[detect_persons] {len(persons)} persons after NMS+size filter")
    return sorted(persons, key=lambda p: p.bbox[0])   # left-to-right order


# ===========================================================================
# STEP 2 — filter_by_restricted_zone(persons, camera_id) -> List[PersonBox]
# PURE GEOMETRY — no model inference.
# ===========================================================================

def _point_in_polygon(px: float, py: float, polygon: List[Tuple[float, float]]) -> bool:
    """
    Ray-casting point-in-polygon test.
    Uses normalised coordinates (0-1).
    Falls back to this if shapely is unavailable.
    """
    inside = False
    n = len(polygon)
    j = n - 1
    for i in range(n):
        xi, yi = polygon[i]
        xj, yj = polygon[j]
        if ((yi > py) != (yj > py)) and (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi):
            inside = not inside
        j = i
    return inside


def filter_by_restricted_zone(
    persons: List[PersonBox],
    camera_id: str,
    frame_w: int,
    frame_h: int,
) -> List[PersonBox]:
    """
    STEP 2 — PURE GEOMETRY: polygon membership test.

    Tests whether each person's foot-point (bottom-centre of bbox) lies
    inside the restricted zone polygon for this camera.
    Using foot-point (not box centre) avoids false positives when a person
    is standing at the zone boundary with their upper body inside.

    Mutates in_restricted_zone and zone_name fields on each PersonBox.
    Returns the same list (all persons, both inside and outside the zone).
    """
    zone_cfg = RESTRICTED_ZONES.get(camera_id)
    if not zone_cfg:
        # No polygon configured for this camera — nobody flagged
        return persons

    polygon = zone_cfg["polygon"]   # list of (x, y) normalised 0-1
    zone_name = zone_cfg["zone_name"]

    # Try to use shapely for robust polygon tests (handles concave polygons)
    _shapely_poly = None
    try:
        from shapely.geometry import Point, Polygon as SPolygon
        _shapely_poly = SPolygon(polygon)
    except ImportError:
        pass

    for p in persons:
        x1, y1, x2, y2 = p.bbox
        # Foot-point: bottom-centre, normalised
        foot_x = ((x1 + x2) / 2) / frame_w
        foot_y = y2 / frame_h

        if _shapely_poly is not None:
            from shapely.geometry import Point
            in_zone = _shapely_poly.contains(Point(foot_x, foot_y))
        else:
            in_zone = _point_in_polygon(foot_x, foot_y, polygon)

        p.in_restricted_zone = in_zone
        p.zone_name = zone_name if in_zone else None

    return persons


# ===========================================================================
# STEP 3 — detect_ppe_for_person(frame, person_box) -> PersonPPEStatus
# PRETRAINED-MODEL INFERENCE + PURE GEOMETRY (body-region validation).
# ===========================================================================

def _prepare_crop(frame: np.ndarray, bbox: BBox) -> Optional[np.ndarray]:
    """
    Crop person from frame with PPE_CROP_PADDING fraction of extra context,
    then resize so the shorter side is at least PPE_CROP_MIN_SIDE pixels.
    Returns None if the crop is invalid (zero area).
    PURE GEOMETRY — no model.
    """
    h, w = frame.shape[:2]
    x1, y1, x2, y2 = bbox
    bw = x2 - x1
    bh = y2 - y1
    pad_x = bw * PPE_CROP_PADDING
    pad_y = bh * PPE_CROP_PADDING

    cx1 = max(0, int(x1 - pad_x))
    cy1 = max(0, int(y1 - pad_y))
    cx2 = min(w, int(x2 + pad_x))
    cy2 = min(h, int(y2 + pad_y))

    if cx2 <= cx1 or cy2 <= cy1:
        return None

    crop = frame[cy1:cy2, cx1:cx2]
    # Resize so shorter side >= PPE_CROP_MIN_SIDE
    ch, cw = crop.shape[:2]
    if min(ch, cw) < PPE_CROP_MIN_SIDE:
        scale = PPE_CROP_MIN_SIDE / min(ch, cw)
        crop = cv2.resize(crop, (int(cw * scale), int(ch * scale)), interpolation=cv2.INTER_LINEAR)

    return crop


def _validate_body_region(
    det_x1: float, det_y1: float, det_x2: float, det_y2: float,
    item: str,
    crop_h: float, crop_w: float,
) -> bool:
    """
    PURE GEOMETRY: reject PPE detection if the bounding box centre falls
    outside the expected body region for that item.

    All coordinates are in crop-pixel space.
    BODY_REGIONS stores normalised fractions of crop height/width.
    Returns True if the detection is geometrically plausible.
    """
    region = BODY_REGIONS.get(item)
    if region is None:
        return True   # unknown item — allow by default

    cx = (det_x1 + det_x2) / 2
    cy = (det_y1 + det_y2) / 2

    # Normalise to [0, 1]
    nx = cx / (crop_w + 1e-6)
    ny = cy / (crop_h + 1e-6)

    ok = (
        region["lft"] <= nx <= region["rgt"] and
        region["top"] <= ny <= region["bot"]
    )
    if not ok:
        logger.debug(
            f"[body_region] Rejected '{item}' at ({nx:.2f}, {ny:.2f}); "
            f"expected x:[{region['lft']},{region['rgt']}] y:[{region['top']},{region['bot']}]"
        )
    return ok


def _run_ppe_backend(
    crop: np.ndarray,
    backend: str,
    conf_threshold: float,
) -> List[PPEItemResult]:
    """
    PRETRAINED-MODEL INFERENCE: run the selected PPE backend on a person crop.

    backend = "pretrained_ppe" → uses _ppe_model (keremberke/yolov8s-PPE-detection)
    backend = "zero_shot"      → uses YOLO-World with text prompts
    backend = "both"           → runs both and merges; pretrained takes priority

    Returns a flat list of PPEItemResult (one per detected box).
    Includes negative-class detections (e.g. "no_helmet") as separate entries
    with state="missing".
    """
    results: List[PPEItemResult] = []

    def _parse_detections(model, class_map, source_tag):
        """Inner: run model, map class names, apply body-region filter."""
        if model is None:
            return
        ch, cw = crop.shape[:2]
        preds = model(crop, conf=conf_threshold, verbose=False)
        for r in preds:
            for box in r.boxes:
                raw_name = model.names[int(box.cls[0])].lower().strip()
                canonical = class_map.get(raw_name)
                if canonical is None:
                    continue   # unknown class — ignore

                conf = float(box.conf[0])
                bx1, by1, bx2, by2 = box.xyxy[0].tolist()

                # Negative-class detection → immediate "missing"
                if canonical.startswith("no_"):
                    ppe_item = canonical[3:]   # strip "no_"
                    results.append(PPEItemResult(
                        item=ppe_item, state="missing",
                        confidence=conf, source=source_tag,
                    ))
                    continue

                if canonical not in PPE_ITEMS:
                    continue

                # PURE GEOMETRY: body-region validation
                if not _validate_body_region(bx1, by1, bx2, by2, canonical, ch, cw):
                    continue

                # Three-state thresholding (from PPE_THRESHOLDS in constants.py)
                thr = PPE_THRESHOLDS.get(canonical, {"low": 0.30, "high": 0.55})
                if conf >= thr["high"]:
                    state: PPEItemState = "worn"
                elif conf >= thr["low"]:
                    state = "uncertain"
                else:
                    continue   # too low — ignore

                results.append(PPEItemResult(
                    item=canonical, state=state,
                    confidence=conf, source=source_tag,
                ))

    if backend in ("pretrained_ppe", "both"):
        # PRETRAINED-MODEL INFERENCE
        _parse_detections(_load_ppe_model(), PPE_MODEL_CLASS_MAP, "pretrained_ppe")

    if backend in ("zero_shot", "both"):
        # PRETRAINED-MODEL INFERENCE (YOLO-World zero-shot)
        _parse_detections(_load_yolo_world(), YOLO_WORLD_CLASS_MAP, "zero_shot")

    return results


def _merge_ppe_results(raw: List[PPEItemResult]) -> Dict[str, PPEItemState]:
    """
    Merge multiple detections for the same item into one final state.

    Priority order:
      1. "missing" (negative class) — always takes priority.
      2. "worn" (high-conf positive) — overrides "uncertain".
      3. "uncertain" — default if no clear signal.
      4. If no detection at all for an item, result is "uncertain".

    RULE: "uncertain" is NEVER silently promoted to "worn".
    """
    best: Dict[str, PPEItemResult] = {}

    for r in raw:
        prev = best.get(r.item)
        if prev is None:
            best[r.item] = r
        else:
            # "missing" trumps everything
            if r.state == "missing":
                best[r.item] = r
            # "worn" trumps "uncertain" (but not "missing")
            elif r.state == "worn" and prev.state == "uncertain":
                best[r.item] = r
            # keep higher confidence among same state
            elif r.state == prev.state and r.confidence > prev.confidence:
                best[r.item] = r

    return {item: (best[item].state if item in best else "uncertain") for item in PPE_ITEMS}


def detect_ppe_for_person(
    frame: np.ndarray,
    person_box: PersonBox,
    backend: str = "both",
    conf_threshold: float = 0.30,
) -> PersonPPEStatus:
    """
    STEP 3 — PRETRAINED-MODEL INFERENCE + PURE GEOMETRY.

    1. Crops the person from the frame (+ padding, + resize).
    2. Runs pretrained PPE YOLO (pretrained_ppe) and/or YOLO-World (zero_shot).
    3. Applies body-region geometry validation to reject false positives.
    4. Merges results into one three-state status per item.

    Returns PersonPPEStatus with helmet/vest/gloves/boots/goggles/mask states.
    No training, no fine-tuning — purely pretrained model inference + geometry.
    """
    crop = _prepare_crop(frame, person_box.bbox)

    if crop is None or crop.size == 0:
        # Can't assess PPE — return all uncertain
        return PersonPPEStatus(
            person_index=person_box.person_index,
            bbox=person_box.bbox,
            in_restricted_zone=person_box.in_restricted_zone,
            zone_name=person_box.zone_name,
        )

    # PRETRAINED-MODEL INFERENCE
    raw_results = _run_ppe_backend(crop, backend, conf_threshold)

    # PURE GEOMETRY: merge multi-source detections
    merged = _merge_ppe_results(raw_results)

    confidences = {
        r.item: r.confidence for r in raw_results
        if r.confidence == max((x.confidence for x in raw_results if x.item == r.item), default=0)
    }

    return PersonPPEStatus(
        person_index=person_box.person_index,
        bbox=person_box.bbox,
        in_restricted_zone=person_box.in_restricted_zone,
        zone_name=person_box.zone_name,
        helmet=merged["helmet"],
        vest=merged["vest"],
        gloves=merged["gloves"],
        boots=merged["boots"],
        goggles=merged["goggles"],
        mask=merged["mask"],
        confidences=confidences,
    )


# ===========================================================================
# STEP 4 — verify_with_vlm(crop, uncertain_items) -> dict
# OPTIONAL EXTERNAL API CALL — only if USE_VLM_FALLBACK is True and an
# ANTHROPIC_API_KEY is set. This is the ONLY external-API step.
# All other steps are local pretrained-model inference or pure geometry.
# ===========================================================================

def _vlm_cache_key(camera_id: str, bbox: BBox) -> str:
    """Round bbox coords to nearest 10px, bucket by 2-second windows."""
    rounded = tuple(round(v / 10) * 10 for v in bbox)
    t_bucket = int(time.time() / VLM_CACHE_SECONDS)
    return f"{camera_id}_{rounded}_{t_bucket}"


def verify_with_vlm(
    crop: np.ndarray,
    uncertain_items: List[str],
    camera_id: str,
    bbox: BBox,
) -> Dict[str, PPEItemState]:
    """
    STEP 4 — OPTIONAL EXTERNAL API CALL (Anthropic Claude vision).
    This is the ONLY external-API step in the pipeline.

    Called ONLY when:
      - USE_VLM_FALLBACK is True (config flag)
      - ANTHROPIC_API_KEY environment variable is set
      - At least one item is "uncertain" for a person in a restricted zone
      - Rate limit (VLM_RATE_LIMIT_PER_MINUTE) has not been exceeded

    All other conditions → return empty dict (keep items as "uncertain").
    Parse failure → return empty dict (keep "uncertain" — do NOT promote to "worn").
    """
    # RULE: do not run VLM unless the feature flag is explicitly set.
    if not USE_VLM_FALLBACK:
        return {}

    # RULE: skip if API key is not configured.
    api_key = os.environ.get("ANTHROPIC_API_KEY", "")
    if not api_key:
        logger.debug("[vlm] ANTHROPIC_API_KEY not set — skipping VLM fallback")
        return {}

    if not uncertain_items:
        return {}

    # Cache check (avoid repeated calls for same person in same ~2-second window)
    cache_key = _vlm_cache_key(camera_id, bbox)
    if cache_key in _vlm_cache:
        logger.debug(f"[vlm] Cache hit for {cache_key}")
        return _vlm_cache[cache_key]

    # Hard rate limit: max VLM_RATE_LIMIT_PER_MINUTE calls in the last 60 seconds
    now = time.time()
    while _vlm_call_times and (now - _vlm_call_times[0]) > 60:
        _vlm_call_times.popleft()
    if len(_vlm_call_times) >= VLM_RATE_LIMIT_PER_MINUTE:
        logger.warning("[vlm] Rate limit reached — skipping VLM call")
        return {}

    try:
        import anthropic
        import base64

        # Encode crop as JPEG base64
        _, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
        b64 = base64.standard_b64encode(buf.tobytes()).decode("utf-8")

        items_str = ", ".join(uncertain_items)
        client = anthropic.Anthropic(api_key=api_key)

        # EXTERNAL API CALL — the only one in this pipeline
        message = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=256,
            system=(
                "You are a PPE safety inspector reviewing a single image of a worker. "
                "You will be given a list of PPE items to check. "
                "For each item, determine if it is clearly worn, clearly absent, or cannot be determined. "
                'Respond ONLY with valid JSON: {"item_name": "worn"|"absent"|"cannot_determine", ...}. '
                "Do not include any other text, markdown, or code fences."
            ),
            messages=[{
                "role": "user",
                "content": [
                    {
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": "image/jpeg",
                            "data": b64,
                        },
                    },
                    {
                        "type": "text",
                        "text": f"Check these PPE items for the worker in this image: [{items_str}]",
                    },
                ],
            }],
        )

        _vlm_call_times.append(time.time())

        # Parse JSON response safely
        raw_text = message.content[0].text.strip()
        # Strip code fences if present
        if raw_text.startswith("```"):
            raw_text = raw_text.strip("`").lstrip("json").strip()

        parsed = json.loads(raw_text)

        # Map VLM response → our three-state PPEItemState
        # RULE: "cannot_determine" → "uncertain" (NEVER → "worn").
        state_map = {
            "worn": "worn",
            "absent": "missing",
            "cannot_determine": "uncertain",
        }
        result: Dict[str, PPEItemState] = {}
        for item, vlm_state in parsed.items():
            item_lower = item.lower().strip()
            if item_lower in uncertain_items:
                result[item_lower] = state_map.get(str(vlm_state).lower(), "uncertain")

        _vlm_cache[cache_key] = result
        logger.info(f"[vlm] VLM result for {uncertain_items}: {result}")
        return result

    except Exception as e:
        # Parse failure or API error → keep all items as "uncertain".
        # RULE: do NOT promote to "worn" on parse failure.
        logger.warning(f"[vlm] VLM call failed — keeping uncertain: {e}")
        return {}


# ===========================================================================
# STEP 5 — smooth_over_time(camera_id, track_key, status) -> PersonPPEStatus
# PURE LOGIC — no model inference.
# ===========================================================================

def _compute_iou(a: BBox, b: BBox) -> float:
    """IoU between two (x1,y1,x2,y2) boxes. PURE GEOMETRY."""
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    ix1 = max(ax1, bx1)
    iy1 = max(ay1, by1)
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)
    inter = max(0, ix2 - ix1) * max(0, iy2 - iy1)
    if inter == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter + 1e-6)


def _assign_track_key(camera_id: str, bbox: BBox) -> str:
    """
    Match this person's bbox to a track from the previous frame using
    greedy IoU matching (highest IoU pair assigned first).
    Returns a stable string track key for this person.
    PURE LOGIC — no model, no database.
    """
    prev_bboxes = _last_tracks.get(camera_id, [])
    best_iou = 0.0
    best_idx = -1
    for i, prev_box in enumerate(prev_bboxes):
        iou = _compute_iou(bbox, prev_box)
        if iou > best_iou:
            best_iou = iou
            best_idx = i

    if best_iou >= SMOOTH_IOU_MATCH:
        # Re-use the same track key (encoded as its index)
        return f"{camera_id}_track_{best_idx}"
    else:
        # New person — assign a new key based on current bbox
        return f"{camera_id}_track_new_{int(bbox[0])}_{int(bbox[1])}"


def smooth_over_time(
    camera_id: str,
    track_key: str,
    status: PersonPPEStatus,
) -> PersonPPEStatus:
    """
    STEP 5 — PURE LOGIC: temporal smoothing via majority vote.

    Appends the current frame's item states to the per-track history
    (sliding window of SMOOTH_WINDOW_SIZE frames).

    Final state per item = majority vote over the window.
    Requires SMOOTH_MIN_AGREE frames to agree before changing "worn" → "missing".
    This prevents flicker from a single bad detection frame triggering an alert.

    RULE: "uncertain" counts as neither "worn" nor "missing" in the vote;
          if neither "worn" nor "missing" has a majority, result is "uncertain".
    """
    history = _smooth_history[camera_id][track_key]

    # Record current frame states
    frame_snapshot = {
        item: getattr(status, item) for item in PPE_ITEMS
    }
    history.append(frame_snapshot)

    smoothed = PersonPPEStatus(
        person_index=status.person_index,
        bbox=status.bbox,
        in_restricted_zone=status.in_restricted_zone,
        zone_name=status.zone_name,
        confidences=status.confidences,
    )

    for item in PPE_ITEMS:
        votes: Dict[str, int] = {"worn": 0, "missing": 0, "uncertain": 0}
        for snap in history:
            votes[snap.get(item, "uncertain")] += 1

        worn_votes    = votes["worn"]
        missing_votes = votes["missing"]

        if worn_votes >= SMOOTH_MIN_AGREE:
            final: PPEItemState = "worn"
        elif missing_votes >= SMOOTH_MIN_AGREE:
            final = "missing"
        else:
            final = "uncertain"

        setattr(smoothed, item, final)

    return smoothed


# ===========================================================================
# STEP 6 — evaluate_zone_compliance(person_status, required_ppe) -> ZoneComplianceResult
# PURE LOGIC — no model inference.
# ===========================================================================

def evaluate_zone_compliance(
    person_status: PersonPPEStatus,
    required_ppe: List[str],
) -> ZoneComplianceResult:
    """
    STEP 6 — PURE LOGIC: compare smoothed PPE status against zone requirements.

    violations   = items required but definitively "missing"
    needs_review = items required but status is "uncertain"
    is_compliant = violations == [] AND needs_review == []

    RULE: "uncertain" does NOT count as compliant.
    """
    violations:   List[str] = []
    needs_review: List[str] = []

    for item in required_ppe:
        state: PPEItemState = getattr(person_status, item, "uncertain")
        if state == "missing":
            violations.append(item)
        elif state == "uncertain":
            needs_review.append(item)

    is_compliant = (len(violations) == 0 and len(needs_review) == 0)

    return ZoneComplianceResult(
        person_index=person_status.person_index,
        in_restricted_zone=person_status.in_restricted_zone,
        zone_name=person_status.zone_name,
        required_ppe=required_ppe,
        violations=violations,
        needs_review=needs_review,
        is_compliant=is_compliant,
    )


# ===========================================================================
# PUBLIC ENTRY POINT — analyze_frame()
# Orchestrates all 6 steps. Used by both /api/detection/analyze-frame
# and the demo-image path. Single pipeline — no duplication.
# ===========================================================================

def analyze_frame(
    frame: np.ndarray,
    camera_id: str,
    settings: Optional[Dict[str, Any]] = None,
) -> FrameAnalysisResult:
    """
    Full PPE detection pipeline for one frame from camera `camera_id`.

    Args:
        frame:      BGR numpy array (from cv2.imread or a video stream).
        camera_id:  Camera identifier; must match a key in RESTRICTED_ZONES
                    (or be any string — workers are still detected but not
                     zone-flagged if no polygon is configured).
        settings:   Dict with optional keys:
                      ppe_detection_enabled (bool)   — if False, skip all detection
                      detection_confidence_threshold (float) — override PERSON_MIN_CONFIDENCE
                      ppe_backend (str)             — "pretrained_ppe"|"zero_shot"|"both"

    Returns:
        FrameAnalysisResult — the canonical output schema for this pipeline.
        If zero persons are detected → returns zeros + empty workers list.
        If ppe_detection_enabled is False → returns zeros immediately.
    """
    t_start = time.perf_counter()

    # Read settings at call time (not cached, respects Settings page toggles)
    settings = settings or {}
    if not settings.get("ppe_detection_enabled", True):
        logger.debug("[analyze_frame] ppe_detection_enabled=False — skipping")
        return FrameAnalysisResult(camera_id=camera_id)

    conf_threshold = float(settings.get("detection_confidence_threshold", PERSON_MIN_CONFIDENCE))
    backend        = settings.get("ppe_backend", "both")

    h, w = frame.shape[:2]
    zone_cfg = RESTRICTED_ZONES.get(camera_id, {})
    required_ppe: List[str] = zone_cfg.get("required_ppe", [])

    # ── Step 1: Detect all persons ──────────────────────────────────────────
    # PRETRAINED-MODEL INFERENCE (disable tiling for CAM01 laptop webcam)
    disable_tiling = (camera_id == "CAM01")
    persons = detect_persons(frame, conf_threshold=conf_threshold, disable_tiling=disable_tiling)

    if not persons:
        logger.debug(f"[analyze_frame] 0 persons detected in {camera_id}")
        return FrameAnalysisResult(
            camera_id=camera_id,
            total_persons_detected=0,
            persons_in_restricted_zone=0,
            workers=[],
            zone_compliance_pct=None,
            inference_ms=round((time.perf_counter() - t_start) * 1000, 1),
            model_backend=backend,
        )

    # ── Step 2: Zone membership ─────────────────────────────────────────────
    # PURE GEOMETRY
    persons = filter_by_restricted_zone(persons, camera_id, w, h)

    # Update per-frame track registry for IoU matching next frame
    _last_tracks[camera_id] = [p.bbox for p in persons]

    workers: List[WorkerRecord] = []
    in_zone_count   = 0
    compliant_count = 0

    for p in persons:
        if p.in_restricted_zone:
            in_zone_count += 1

        # ── Step 3: PPE detection for this person ───────────────────────────
        # PRETRAINED-MODEL INFERENCE + PURE GEOMETRY
        ppe_status = detect_ppe_for_person(frame, p, backend=backend, conf_threshold=conf_threshold)

        # ── Step 4: Optional VLM fallback ───────────────────────────────────
        # OPTIONAL EXTERNAL API CALL — only if enabled and person is in zone
        if p.in_restricted_zone:
            uncertain = [item for item in required_ppe if getattr(ppe_status, item) == "uncertain"]
            if uncertain:
                crop = _prepare_crop(frame, p.bbox)
                if crop is not None:
                    vlm_updates = verify_with_vlm(crop, uncertain, camera_id, p.bbox)
                    for item, new_state in vlm_updates.items():
                        if hasattr(ppe_status, item):
                            setattr(ppe_status, item, new_state)

        # ── Step 5: Temporal smoothing ───────────────────────────────────────
        # PURE LOGIC — majority vote over last N frames
        track_key = _assign_track_key(camera_id, p.bbox)
        ppe_status = smooth_over_time(camera_id, track_key, ppe_status)

        # ── Step 6: Zone compliance evaluation ──────────────────────────────
        # PURE LOGIC
        compliance = evaluate_zone_compliance(ppe_status, required_ppe if p.in_restricted_zone else [])

        if p.in_restricted_zone and compliance.is_compliant:
            compliant_count += 1

        # ── Integration: write alert to PPE violation log ────────────────────
        if p.in_restricted_zone and not compliance.is_compliant:
            _record_violation_if_needed(p, compliance, camera_id, zone_cfg)

        workers.append(WorkerRecord(
            person_index=p.person_index,
            bbox=p.bbox,
            in_restricted_zone=p.in_restricted_zone,
            zone_name=p.zone_name,
            ppe={item: getattr(ppe_status, item) for item in PPE_ITEMS},
            required_ppe=required_ppe if p.in_restricted_zone else [],
            violations=compliance.violations,
            needs_review=compliance.needs_review,
            is_compliant=compliance.is_compliant,
        ))

        # Update CCTV state for the risk engine (backward-compatible)
        _update_cctv_state(camera_id, zone_cfg, ppe_status, compliance)

    zone_pct = (
        round(100 * compliant_count / in_zone_count, 1)
        if in_zone_count > 0 else None
    )

    return FrameAnalysisResult(
        camera_id=camera_id,
        total_persons_detected=len(persons),
        persons_in_restricted_zone=in_zone_count,
        workers=workers,
        zone_compliance_pct=zone_pct,
        inference_ms=round((time.perf_counter() - t_start) * 1000, 1),
        model_backend=backend,
    )


# ===========================================================================
# Integration helpers (called from analyze_frame; not part of the 6 steps)
# ===========================================================================

def _record_violation_if_needed(
    person: PersonBox,
    compliance: ZoneComplianceResult,
    camera_id: str,
    zone_cfg: Dict,
) -> None:
    """
    Write a PPE violation event via the existing record_violation() path,
    which also feeds risk_engine.py.
    Called only when a person is in a restricted zone with violations.
    """
    try:
        from risk_engine.ppe_violations import record_violation

        severity    = zone_cfg.get("severity", "high")
        zone_id     = zone_cfg.get("zone_id", camera_id)
        zone_name   = zone_cfg.get("zone_name", camera_id)
        plant_id    = "plant_coke_oven"   # default; override via settings if multi-plant

        missing_items = compliance.violations
        if not missing_items and not compliance.is_compliant:
            # No confirmed-missing items but zone entry with all-uncertain PPE
            # → escalate as "Restricted Area Entry without verified PPE"
            missing_items = compliance.needs_review

        if not missing_items:
            return

        record_violation(
            zone_id=zone_id,
            zone_name=zone_name,
            plant_id=plant_id,
            ppe_items_missing=missing_items,
            confidence_pct=85.0,
            detection_method="model_inferred",
            risk_score_at_time=None,
        )

        alert_type = (
            "Restricted Zone PPE Violation — CRITICAL"
            if zone_id in CRITICAL_ZONE_IDS
            else "Restricted Zone PPE Violation"
        )
        logger.info(
            f"[analyze_frame] {alert_type}: person {person.person_index} "
            f"in {zone_name} missing {missing_items}"
        )
    except Exception as e:
        logger.warning(f"[analyze_frame] Could not record violation: {e}")


def _update_cctv_state(
    camera_id: str,
    zone_cfg: Dict,
    ppe_status: PersonPPEStatus,
    compliance: ZoneComplianceResult,
) -> None:
    """
    Update the shared LIVE_CCTV_STATE dict so the existing risk engine
    (R7: CCTV PPE Violation in Elevated Gas Zone) continues to work
    with the new per-person detection pipeline.
    Backward-compatible with the old boolean ppe_compliant flag.
    """
    try:
        from risk_engine.cctv_state import LIVE_CCTV_STATE
        zone_id = zone_cfg.get("zone_id", camera_id)
        LIVE_CCTV_STATE["zone_id"]          = zone_id
        LIVE_CCTV_STATE["person_detected"]  = True
        LIVE_CCTV_STATE["ppe_compliant"]    = compliance.is_compliant
        LIVE_CCTV_STATE["ppe_items_missing"] = compliance.violations
        LIVE_CCTV_STATE["timestamp"]         = datetime.now()
    except Exception:
        pass
