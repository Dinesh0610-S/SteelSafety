"""
detection/__init__.py
"""
from detection.detection_service import analyze_frame
from detection.models import FrameAnalysisResult, PersonPPEStatus, WorkerRecord

__all__ = ["analyze_frame", "FrameAnalysisResult", "PersonPPEStatus", "WorkerRecord"]
