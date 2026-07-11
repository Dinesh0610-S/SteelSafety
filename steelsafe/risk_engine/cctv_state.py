"""
risk_engine/cctv_state.py
==========================
Shared global state for live CCTV camera signals.
Prevents circular imports between routes and risk engine core.
"""

from datetime import datetime

LIVE_CCTV_STATE = {
    "zone_id": None,
    "person_detected": False,
    "ppe_compliant": True,
    "timestamp": None
}
