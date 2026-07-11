"""
tests/test_compliance.py
========================
Unit test to verify the Quality & Compliance Audit Agent drift detection logic.
"""

import sys
import os
from datetime import datetime

# Adjust Python path to include the parent folder
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from db.database import SessionLocal
from db.models import ComplianceDeviation
from risk_engine.compliance import run_compliance_check

def test_compliance_drift():
    db = SessionLocal()
    try:
        # 1. Trigger compliance check at current time
        now = datetime.now()
        deviations = run_compliance_check(db, now)
        
        # Query all deviations in the database
        all_devs = db.query(ComplianceDeviation).all()
        print(f"[Test] Found {len(all_devs)} total deviations in the DB.")
        
        # 2. Check that at least 3 deliberate gaps are flagged
        cal_overdue_zones = [d.zone_id for d in all_devs if d.deviation_type == "Gas Detector Calibration Overdue"]
        audit_overdue_zones = [d.zone_id for d in all_devs if d.deviation_type == "Weekly PPE Audit Overdue"]
        med_overdue_types = [d for d in all_devs if d.deviation_type == "Overdue Periodic Medical Examination"]
        
        print(f"[Test] Calibration Overdue Zones: {cal_overdue_zones}")
        print(f"[Test] PPE Audit Overdue Zones: {audit_overdue_zones}")
        print(f"[Test] Medical Overdue Count: {len(med_overdue_types)}")

        # Assertions
        assert "zone_ca" in cal_overdue_zones, "Charging Platform should be flagged for overdue gas calibration"
        assert "zone_qt" in cal_overdue_zones, "Quenching Tower should be flagged for overdue gas calibration"
        assert "zone_ca" in audit_overdue_zones, "Charging Platform should be flagged for overdue weekly PPE audit"
        assert len(med_overdue_types) > 0, "At least one active worker should be flagged for overdue medical exam"

        # Assert no false positives for compliant zones (e.g. zone_gcm is compliant for calibration)
        assert "zone_gcm" not in cal_overdue_zones, "Gas Collection Main is compliant and should not be flagged for calibration"
        assert "zone_cob1" not in audit_overdue_zones, "Coke Oven Battery weekly audit is recent and should not be flagged"

        # 3. Test resolution flow
        test_dev = db.query(ComplianceDeviation).filter(ComplianceDeviation.resolved == False).first()
        assert test_dev is not None, "Should have at least one unresolved deviation"
        
        dev_id = test_dev.id
        test_dev.resolved = True
        db.commit()

        # Re-fetch and assert state
        re_fetched = db.query(ComplianceDeviation).filter(ComplianceDeviation.id == dev_id).first()
        assert re_fetched.resolved is True, "Deviation should be marked resolved"
        print(f"[Test] Successfully resolved deviation ID {dev_id}.")

        print("[Test] All compliance audit assertions passed successfully!")

    finally:
        db.close()

if __name__ == "__main__":
    test_compliance_drift()
