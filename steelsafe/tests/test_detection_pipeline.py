"""
tests/test_detection_pipeline.py
==================================
Unit tests for all 6 pipeline steps in detection_service.py.
These tests use only in-process Python — no model downloads, no GPU.

Model-dependent steps (1 and 3) are mocked so CI can run without GPU.
Geometry and logic steps (2, 5, 6) are tested with real inputs.
VLM step (4) is always mocked.
"""

import sys
from pathlib import Path
import numpy as np
import pytest

# Ensure we can import from the steelsafe package
sys.path.insert(0, str(Path(__file__).parent.parent))


# ===========================================================================
# STEP 1 — detect_persons (NMS + size filter — geometry only, model mocked)
# ===========================================================================

def test_nms_removes_duplicate():
    """Two nearly-identical boxes should reduce to one after NMS."""
    from detection.detection_service import _nms
    boxes  = [(10, 10, 80, 200), (12, 11, 82, 201)]
    scores = [0.9, 0.8]
    keep = _nms(boxes, scores, iou_threshold=0.45)
    assert len(keep) == 1
    assert keep[0] == 0   # higher-score box kept

def test_nms_keeps_non_overlapping():
    """Two spatially separated boxes should both survive NMS."""
    from detection.detection_service import _nms
    boxes  = [(10, 10, 60, 150), (200, 10, 260, 150)]
    scores = [0.9, 0.85]
    keep = _nms(boxes, scores, iou_threshold=0.45)
    assert len(keep) == 2


# ===========================================================================
# STEP 2 — filter_by_restricted_zone (geometry — no model)
# ===========================================================================

def test_foot_point_inside_zone():
    """Person standing inside the CAM01 restricted polygon (right half of frame: x in [0.5, 1.0])."""
    from detection.detection_service import filter_by_restricted_zone
    from detection.models import PersonBox

    # Person with bbox (400, 100, 500, 400) in a 640×480 frame
    # Foot-point: x=450/640=0.703, y=400/480=0.833 → inside [(0.5,0.0),(1.0,0.0),(1.0,1.0),(0.5,1.0)]
    p = PersonBox(person_index=0, bbox=(400, 100, 500, 400), confidence=0.8)
    result = filter_by_restricted_zone([p], "CAM01", frame_w=640, frame_h=480)
    assert result[0].in_restricted_zone is True

def test_foot_point_outside_zone():
    """Person on the left side of frame should NOT be flagged in CAM01 (x < 0.5)."""
    from detection.detection_service import filter_by_restricted_zone
    from detection.models import PersonBox

    # Foot-point: x=150/640=0.234 < 0.5
    p = PersonBox(person_index=0, bbox=(100, 100, 200, 400), confidence=0.8)
    result = filter_by_restricted_zone([p], "CAM01", frame_w=640, frame_h=480)
    assert result[0].in_restricted_zone is False

def test_unknown_camera_no_zone():
    """Camera not in RESTRICTED_ZONES → no person flagged."""
    from detection.detection_service import filter_by_restricted_zone
    from detection.models import PersonBox

    p = PersonBox(person_index=0, bbox=(100, 100, 200, 400), confidence=0.8)
    result = filter_by_restricted_zone([p], "cam_unknown_99", frame_w=640, frame_h=480)
    assert result[0].in_restricted_zone is False


# ===========================================================================
# STEP 3 — body_region validation (geometry — no model)
# ===========================================================================

def test_helmet_in_top_region_accepted():
    """Helmet detection in top 20% of crop → accepted."""
    from detection.detection_service import _validate_body_region
    # Crop 200×400; helmet at y=30-80 (7-20%) → within [0.00, 0.25]
    assert _validate_body_region(60, 30, 140, 80, "helmet", 400, 200) is True

def test_helmet_in_bottom_region_rejected():
    """Helmet detection at bottom 80% of crop → rejected as body-region FP."""
    from detection.detection_service import _validate_body_region
    # Crop 200×400; helmet at y=320-380 (80-95%) → outside [0.00, 0.25]
    assert _validate_body_region(60, 320, 140, 380, "helmet", 400, 200) is False

def test_vest_in_torso_accepted():
    """Vest detection in torso band (20-60%) → accepted."""
    from detection.detection_service import _validate_body_region
    # Crop 200×400; vest at y=100-220 (25-55%)
    assert _validate_body_region(10, 100, 190, 220, "vest", 400, 200) is True

def test_boots_in_top_rejected():
    """Boots detection in top of crop → rejected."""
    from detection.detection_service import _validate_body_region
    assert _validate_body_region(40, 10, 160, 60, "boots", 400, 200) is False


# ===========================================================================
# STEP 3 — merge_ppe_results (logic — no model)
# ===========================================================================

def test_missing_class_overrides_worn():
    """Negative class detection must override a positive detection."""
    from detection.detection_service import _merge_ppe_results
    from detection.models import PPEItemResult

    raw = [
        PPEItemResult(item="helmet", state="worn",    confidence=0.8, source="pretrained_ppe"),
        PPEItemResult(item="helmet", state="missing", confidence=0.6, source="zero_shot"),
    ]
    merged = _merge_ppe_results(raw)
    assert merged["helmet"] == "missing"

def test_worn_overrides_uncertain():
    """'worn' should replace 'uncertain' in merge."""
    from detection.detection_service import _merge_ppe_results
    from detection.models import PPEItemResult

    raw = [
        PPEItemResult(item="vest", state="uncertain", confidence=0.4, source="zero_shot"),
        PPEItemResult(item="vest", state="worn",      confidence=0.7, source="pretrained_ppe"),
    ]
    merged = _merge_ppe_results(raw)
    assert merged["vest"] == "worn"

def test_no_detection_returns_uncertain():
    """Item with no detections at all should default to 'uncertain', not 'worn'."""
    from detection.detection_service import _merge_ppe_results
    merged = _merge_ppe_results([])
    assert merged["helmet"] == "uncertain"
    assert merged["boots"] == "uncertain"


# ===========================================================================
# STEP 4 — verify_with_vlm (logic — always skipped without API key)
# ===========================================================================

def test_vlm_skipped_without_api_key(monkeypatch):
    """VLM must return {} (keep uncertain) when ANTHROPIC_API_KEY is not set."""
    import os
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    from detection.detection_service import verify_with_vlm
    crop = np.zeros((100, 50, 3), dtype=np.uint8)
    result = verify_with_vlm(crop, ["helmet", "vest"], "cam_01", (0, 0, 50, 100))
    assert result == {}   # must not promote uncertain → worn


# ===========================================================================
# STEP 5 — smooth_over_time (logic — no model)
# ===========================================================================

def test_smoothing_requires_min_agree_frames():
    """Status should remain 'uncertain' until SMOOTH_MIN_AGREE frames agree."""
    from detection.detection_service import smooth_over_time, _smooth_history
    from detection.models import PersonPPEStatus
    from detection.constants import SMOOTH_MIN_AGREE, SMOOTH_WINDOW_SIZE

    cam = "test_cam_smooth"
    key = "track_999"
    _smooth_history[cam][key].clear()

    # Feed only 2 "missing" frames (below the 3-frame threshold)
    for _ in range(2):
        status = PersonPPEStatus(person_index=0, bbox=(0,0,50,100), helmet="missing")
        out = smooth_over_time(cam, key, status)

    # Not enough agreement yet — result may still be uncertain or missing
    # but should NOT flip "missing" to "worn"
    assert out.helmet != "worn"

def test_smoothing_confirms_after_min_agree():
    """After SMOOTH_MIN_AGREE 'missing' frames, status must be 'missing'."""
    from detection.detection_service import smooth_over_time, _smooth_history
    from detection.models import PersonPPEStatus
    from detection.constants import SMOOTH_MIN_AGREE

    cam = "test_cam_confirm"
    key = "track_confirm_99"
    _smooth_history[cam][key].clear()

    for _ in range(SMOOTH_MIN_AGREE):
        status = PersonPPEStatus(person_index=0, bbox=(0,0,50,100), helmet="missing")
        out = smooth_over_time(cam, key, status)

    assert out.helmet == "missing"

def test_uncertain_never_promoted_to_worn():
    """
    CRITICAL RULE: 'uncertain' frames must NEVER cause the smoothed result
    to be 'worn'. Only explicit 'worn' detections count toward 'worn' votes.
    """
    from detection.detection_service import smooth_over_time, _smooth_history
    from detection.models import PersonPPEStatus
    from detection.constants import SMOOTH_MIN_AGREE

    cam  = "test_cam_rule"
    key  = "track_rule_99"
    _smooth_history[cam][key].clear()

    # Feed all "uncertain" frames
    for _ in range(SMOOTH_MIN_AGREE + 2):
        status = PersonPPEStatus(person_index=0, bbox=(0,0,50,100), helmet="uncertain")
        out = smooth_over_time(cam, key, status)

    # "uncertain" majority should NEVER produce "worn"
    assert out.helmet != "worn", "RULE VIOLATION: uncertain was silently promoted to worn"


# ===========================================================================
# STEP 6 — evaluate_zone_compliance (logic — no model)
# ===========================================================================

def test_compliance_with_all_worn():
    """All required items worn → is_compliant=True, no violations."""
    from detection.detection_service import evaluate_zone_compliance
    from detection.models import PersonPPEStatus

    status = PersonPPEStatus(
        person_index=0, bbox=(0,0,50,100),
        in_restricted_zone=True, zone_name="Test Zone",
        helmet="worn", vest="worn", gloves="worn",
        boots="worn", goggles="worn", mask="worn",
    )
    result = evaluate_zone_compliance(status, ["helmet", "vest", "gloves"])
    assert result.is_compliant is True
    assert result.violations == []
    assert result.needs_review == []

def test_compliance_with_missing_helmet():
    """Missing helmet in required_ppe → is_compliant=False, violations=['helmet']."""
    from detection.detection_service import evaluate_zone_compliance
    from detection.models import PersonPPEStatus

    status = PersonPPEStatus(
        person_index=0, bbox=(0,0,50,100),
        in_restricted_zone=True,
        helmet="missing", vest="worn",
    )
    result = evaluate_zone_compliance(status, ["helmet", "vest"])
    assert result.is_compliant is False
    assert "helmet" in result.violations

def test_compliance_with_uncertain_not_compliant():
    """
    RULE: 'uncertain' required item → NOT compliant (needs_review, not violations).
    """
    from detection.detection_service import evaluate_zone_compliance
    from detection.models import PersonPPEStatus

    status = PersonPPEStatus(
        person_index=0, bbox=(0,0,50,100),
        in_restricted_zone=True,
        helmet="uncertain", vest="worn",
    )
    result = evaluate_zone_compliance(status, ["helmet", "vest"])
    assert result.is_compliant is False
    assert "helmet" in result.needs_review
    assert result.violations == []

def test_compliance_empty_zone_no_required_ppe():
    """Person outside zone → empty required_ppe → is_compliant=True."""
    from detection.detection_service import evaluate_zone_compliance
    from detection.models import PersonPPEStatus

    status = PersonPPEStatus(person_index=0, bbox=(0,0,50,100), in_restricted_zone=False)
    result = evaluate_zone_compliance(status, [])
    assert result.is_compliant is True


# ===========================================================================
# analyze_frame — zero-person early-exit (no model needed)
# ===========================================================================

def test_analyze_frame_empty_returns_zeros(monkeypatch):
    """analyze_frame with a black frame should return 0 workers, not an error."""
    import detection.detection_service as ds

    # Mock the person model to detect nothing
    class _FakeModel:
        names = {}
        def __call__(self, *a, **kw):
            return []

    monkeypatch.setattr(ds, "_person_model", _FakeModel())
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = ds.analyze_frame(frame, "cam_cob1")
    assert result.total_persons_detected == 0
    assert result.workers == []
    assert result.zone_compliance_pct is None

def test_analyze_frame_detection_disabled_returns_zeros():
    """ppe_detection_enabled=False must short-circuit immediately."""
    import detection.detection_service as ds
    frame = np.zeros((480, 640, 3), dtype=np.uint8)
    result = ds.analyze_frame(frame, "cam_cob1", settings={"ppe_detection_enabled": False})
    assert result.total_persons_detected == 0
    assert result.workers == []


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
