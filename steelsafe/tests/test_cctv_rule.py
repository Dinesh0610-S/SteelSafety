"""
tests/test_cctv_rule.py
========================
Unit tests for rule R7 (CCTV PPE Violation in Elevated Gas Zone).
"""

import sys
import os
from datetime import datetime

# Add project root to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from risk_engine.context_builder import RiskContext
from risk_engine.rules import evaluate_R7
from db.models import SensorReading
from risk_engine import thresholds as T

def test_r7_fires():
    print("Testing evaluate_R7...")

    # Set threshold weight for R7 if not registered
    T.RULE_WEIGHTS["R7"] = 30

    # 1. Base case: normal reading, no person, compliant
    ctx = RiskContext(
        zone_id="zone_ca",
        zone_name="Charging Area",
        area_type="High Risk",
        max_workers=10,
        timestamp=datetime.now(),
        current_reading=SensorReading(co_ppm=15.0, h2s_ppm=0.5, temperature_c=48.0, pressure_kpa=100.0),
        cctv_person_detected=False,
        cctv_ppe_compliant=True
    )
    res = evaluate_R7(ctx)
    assert not res.fired, "Should not fire if no person detected and gas is normal"

    # 2. Case: worker present without PPE, but gas is normal (CO = 15.0 ppm, threshold = 35.0 ppm)
    ctx.cctv_person_detected = True
    ctx.cctv_ppe_compliant = False
    res = evaluate_R7(ctx)
    assert not res.fired, "Should not fire if gas levels are within safe parameters"

    # 3. Case: worker present without PPE, and gas is elevated (CO = 40.0 ppm >= 35.0 ppm)
    ctx.current_reading.co_ppm = 40.0
    res = evaluate_R7(ctx)
    assert res.fired, "Should fire if worker is present without PPE in an elevated gas zone!"
    assert res.score_contribution == 30.0, "Score contribution should match R7 weight (30)"
    assert "[R7]" in res.explanation
    print("Explanation surfaced:", res.explanation)

    # 4. Case: worker present WITH PPE, gas elevated
    ctx.cctv_ppe_compliant = True
    res = evaluate_R7(ctx)
    assert not res.fired, "Should not fire if worker is wearing proper PPE (hard hat)"

    print("All evaluate_R7 unit tests PASSED!")

if __name__ == "__main__":
    test_r7_fires()
