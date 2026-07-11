from sqlalchemy.orm import Session
from datetime import datetime

from db.database import SessionLocal, create_all_tables, drop_all_tables
from db.models import Zone, SensorReading, RiskAssessment, ComplianceDeviation
from data_generator.generator import run_generation
from plants.registry import PLANT_REGISTRY, DEFAULT_PLANT_ID
from api.routes.plants import get_plants_summary
from api.routes.risk import get_current_risk


def run_setup():
    """Re-seed the DB before running multi-plant tests."""
    print("\n[Test] Setup: Regenerating database with multi-plant configurations...")
    run_generation()


def test_plants_registration():
    """Verify that both plants are registered and have zones."""
    assert len(PLANT_REGISTRY) == 2
    assert "plant_coke_oven" in PLANT_REGISTRY
    assert "plant_rolling_mill" in PLANT_REGISTRY

    coke_oven = PLANT_REGISTRY["plant_coke_oven"]
    rolling_mill = PLANT_REGISTRY["plant_rolling_mill"]

    assert len(coke_oven["zones"]) == 5
    assert len(rolling_mill["zones"]) == 5


def test_database_isolation():
    """Verify database isolation between plants."""
    db: Session = SessionLocal()
    try:
        # Check Zones count
        coke_zones = db.query(Zone).filter(Zone.plant_id == "plant_coke_oven").all()
        mill_zones = db.query(Zone).filter(Zone.plant_id == "plant_rolling_mill").all()

        assert len(coke_zones) == 5
        assert len(mill_zones) == 5

        coke_ids = {z.zone_id for z in coke_zones}
        mill_ids = {z.zone_id for z in mill_zones}

        assert coke_ids.isdisjoint(mill_ids)

        # Check Sensor readings isolation
        coke_sensors = db.query(SensorReading).filter(SensorReading.plant_id == "plant_coke_oven").limit(10).all()
        mill_sensors = db.query(SensorReading).filter(SensorReading.plant_id == "plant_rolling_mill").limit(10).all()

        assert len(coke_sensors) > 0
        assert len(mill_sensors) > 0

        for r in coke_sensors:
            assert r.zone_id in coke_ids
            assert r.plant_id == "plant_coke_oven"

        for r in mill_sensors:
            assert r.zone_id in mill_ids
            assert r.plant_id == "plant_rolling_mill"

    finally:
        db.close()


def test_cross_plant_summary():
    """Verify the cross-plant summary route logic returns both plants with correct metrics."""
    db: Session = SessionLocal()
    try:
        summary = get_plants_summary(db)
        assert len(summary) == 2

        summary_dict = {item.plant_id: item for item in summary}
        assert "plant_coke_oven" in summary_dict
        assert "plant_rolling_mill" in summary_dict

        coke_item = summary_dict["plant_coke_oven"]
        mill_item = summary_dict["plant_rolling_mill"]

        assert coke_item.zone_count == 5
        assert mill_item.zone_count == 5
        assert coke_item.highest_risk_level in ("low", "medium", "high", "critical")
        assert mill_item.highest_risk_level in ("low", "medium", "high", "critical")
        assert coke_item.compliance_score >= 0.0
        assert mill_item.compliance_score >= 0.0

    finally:
        db.close()


def test_current_risk_scoped():
    """Verify that current risk queries are correctly scoped to plant_id."""
    db: Session = SessionLocal()
    try:
        # Coke oven current risks
        coke_risks = get_current_risk(plant_id="plant_coke_oven", zone_id=None, db=db)
        assert len(coke_risks) == 5
        for r in coke_risks:
            assert r.zone_id in {"zone_cob1", "zone_gcm", "zone_ca", "zone_qt", "zone_cr"}

        # Rolling mill current risks
        mill_risks = get_current_risk(plant_id="plant_rolling_mill", zone_id=None, db=db)
        assert len(mill_risks) == 5
        for r in mill_risks:
            assert r.zone_id in {"zone_rhf", "zone_rs", "zone_cb", "zone_fl", "zone_cr2"}

    finally:
        db.close()


if __name__ == "__main__":
    run_setup()
    test_plants_registration()
    test_database_isolation()
    test_cross_plant_summary()
    test_current_risk_scoped()
    print("ALL MULTI PLANT INTEGRATION TESTS PASSED!")
