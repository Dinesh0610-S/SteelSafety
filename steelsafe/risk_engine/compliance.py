"""
risk_engine/compliance.py
=========================
Quality & Compliance Audit Agent — Phase 8B: multi-plant parameterised.
Compares database records (permits, maintenance logs, worker location pings)
against OISD/Factories Act rules retrieved via RAG and flags deviations.
Scopes queries to the active plant_id.
"""

from datetime import datetime, timedelta
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from db.models import Permit, MaintenanceLog, WorkerLocation, ComplianceDeviation
from risk_engine.rag import generate_grounded_answer
from plants.registry import get_plant_config, DEFAULT_PLANT_ID

# PME Registry: mock worker medical exam checkup dates
# Active workers with exams > 365 days ago are marked as overdue.
MOCK_MEDICAL_EXAMS: Dict[str, str] = {
    "W001": "2025-06-15",  # Compliant (under 1 year)
    "W002": "2025-07-20",  # Compliant
    "W003": "2025-08-10",  # Compliant
    "W004": "2025-02-14",  # Compliant
    "W005": "2024-05-10",  # OVERDUE (> 365 days ago)
    "W006": "2025-05-18",  # Compliant
    "W007": "2025-06-01",  # Compliant
    "W008": "2024-04-12",  # OVERDUE (> 365 days ago)
    "W009": "2025-06-10",  # Compliant
    "W010": "2025-07-01",  # Compliant
    "W011": "2025-07-02",  # Compliant
    "W012": "2025-03-20",  # Compliant
    "W013": "2025-04-01",  # Compliant
    "W014": "2025-04-05",  # Compliant
    "W015": "2025-06-25",  # Compliant
    "W016": "2024-03-01",  # OVERDUE (> 365 days ago)
}


def run_compliance_check(db: Session, current_time: datetime, plant_config: dict = None) -> List[ComplianceDeviation]:
    """
    Run the compliance audit checker for a specific plant configuration.
    Retrieves regulatory standards via RAG, checks DB records, and flags gaps.
    """
    if plant_config is None:
        plant_config = get_plant_config(DEFAULT_PLANT_ID)

    plant_id = plant_config["plant_id"]
    zones = plant_config["zones"]
    zone_names = {z["zone_id"]: z["name"] for z in zones}

    deviations: List[ComplianceDeviation] = []

    # 1. Gas Detector Calibration Check (Required: every 30 days)
    for zone_id, zone_name in zone_names.items():
        latest_log = db.query(MaintenanceLog).filter(
            MaintenanceLog.plant_id == plant_id,
            MaintenanceLog.activity_type == 'Routine Gas Detector Calibration',
            MaintenanceLog.zone_id == zone_id,
            MaintenanceLog.end_time <= current_time
        ).order_by(MaintenanceLog.end_time.desc()).first()

        days_overdue = 0
        is_overdue = False
        last_date_str = "Never"

        if latest_log:
            days_overdue = (current_time - latest_log.end_time).days
            last_date_str = latest_log.end_time.strftime("%Y-%m-%d")
            if days_overdue > 30:
                is_overdue = True
        else:
            is_overdue = True
            days_overdue = 45  # Default representation if none found

        if is_overdue:
            dev_type = "Gas Detector Calibration Overdue"
            desc = (
                f"Fixed gas monitoring instrumentation in {zone_name} is overdue for "
                f"calibration by {days_overdue} days. Last calibration date: {last_date_str}."
            )
            
            # Ground the check in the OISD RAG index
            rag_res = generate_grounded_answer("gas detector calibration interval guidelines OISD 137 Section 5", zone_id)
            citations = rag_res.get("citations", [])
            cit_title = "OISD Standard 137 Section 5"
            cit_text = "All gas monitoring instruments must undergo calibration every 30 days."
            if citations:
                cit_title = citations[0].get("title", cit_title)
                cit_text = citations[0].get("content", cit_text)

            corr_action = (
                f"Action Required: Immediately schedule certified safety technicians to recalibrate "
                f"all CO/H2S sensors in {zone_name}. Calibrate using standardized gas mixtures and "
                f"log the certificate to clear the compliance gap."
            )

            # Check if this deviation is already active in DB
            existing = db.query(ComplianceDeviation).filter(
                ComplianceDeviation.plant_id == plant_id,
                ComplianceDeviation.zone_id == zone_id,
                ComplianceDeviation.deviation_type == dev_type,
                ComplianceDeviation.resolved == False
            ).first()

            if not existing:
                dev = ComplianceDeviation(
                    plant_id=plant_id,
                    zone_id=zone_id,
                    timestamp=current_time,
                    category="Maintenance",
                    deviation_type=dev_type,
                    description=desc,
                    regulatory_requirement=cit_text,
                    citation=cit_title,
                    severity="high",
                    corrective_action=corr_action,
                    resolved=False
                )
                db.add(dev)
                deviations.append(dev)

    # 2. Weekly PPE Safety Audit (Required: every 7 days in active high-hazard zones)
    high_hazard_zone_ids = [z["zone_id"] for z in zones if z["area_type"] == "High Risk"]
    for zone_id in high_hazard_zone_ids:
        zone_name = zone_names[zone_id]
        latest_log = db.query(MaintenanceLog).filter(
            MaintenanceLog.plant_id == plant_id,
            MaintenanceLog.activity_type == 'Weekly PPE Audit',
            MaintenanceLog.zone_id == zone_id,
            MaintenanceLog.end_time <= current_time
        ).order_by(MaintenanceLog.end_time.desc()).first()

        days_overdue = 0
        is_overdue = False
        last_date_str = "Never"

        if latest_log:
            days_overdue = (current_time - latest_log.end_time).days
            last_date_str = latest_log.end_time.strftime("%Y-%m-%d")
            if days_overdue > 7:
                is_overdue = True
        else:
            is_overdue = True
            days_overdue = 10

        if is_overdue:
            dev_type = "Weekly PPE Audit Overdue"
            desc = (
                f"Weekly PPE and breathing apparatus safety compliance audit is overdue in "
                f"{zone_name} by {days_overdue} days. Last audit date: {last_date_str}."
            )

            rag_res = generate_grounded_answer("weekly safety PPE audit DGMS circular requirements", zone_id)
            citations = rag_res.get("citations", [])
            cit_title = "DGMS Safety Circular 24"
            cit_text = "Weekly safety audits must be conducted in active high-hazard zones to verify PPE compliance."
            if citations:
                cit_title = citations[0].get("title", cit_title)
                cit_text = citations[0].get("content", cit_text)

            corr_action = (
                f"Action Required: Assign the shift safety officer to conduct a field walkthrough "
                f"in {zone_name} within 24 hours. Physically audit all active technicians for hard hats, "
                f"steel-toe boots, and appropriate breathing gear, and log the audit report."
            )

            existing = db.query(ComplianceDeviation).filter(
                ComplianceDeviation.plant_id == plant_id,
                ComplianceDeviation.zone_id == zone_id,
                ComplianceDeviation.deviation_type == dev_type,
                ComplianceDeviation.resolved == False
            ).first()

            if not existing:
                dev = ComplianceDeviation(
                    plant_id=plant_id,
                    zone_id=zone_id,
                    timestamp=current_time,
                    category="Maintenance",
                    deviation_type=dev_type,
                    description=desc,
                    regulatory_requirement=cit_text,
                    citation=cit_title,
                    severity="medium",
                    corrective_action=corr_action,
                    resolved=False
                )
                db.add(dev)
                deviations.append(dev)

    # 3. Confined Space Entry Standby Observer Check (Required: standby person present during active CSE)
    active_cse_permits = db.query(Permit).filter(
        Permit.plant_id == plant_id,
        Permit.permit_type == 'confined_space_entry',
        Permit.status == 'active',
        Permit.start_time <= current_time,
        Permit.end_time >= current_time
    ).all()

    for permit in active_cse_permits:
        zone_id = permit.zone_id
        zone_name = zone_names.get(zone_id, zone_id)

        # Count active workers in this zone during the last 15 minutes of current_time
        worker_pings = db.query(WorkerLocation).filter(
            WorkerLocation.plant_id == plant_id,
            WorkerLocation.zone_id == zone_id,
            WorkerLocation.timestamp >= current_time - timedelta(minutes=15),
            WorkerLocation.timestamp <= current_time
        ).all()

        unique_workers = set(p.worker_id for p in worker_pings)

        # If a CSE is active, we MUST have at least 2 workers present in the zone:
        # 1 inside the space (permit holder), and at least 1 outside acting as standby observer.
        if len(unique_workers) < 2:
            dev_type = "Confined Space Observer Absent"
            desc = (
                f"Active Confined Space Entry in {zone_name} under permit {permit.permit_ref} (assigned to "
                f"{permit.issued_to}) has no active standby observer. Only {len(unique_workers)} worker(s) "
                f"were detected in the zone."
            )

            rag_res = generate_grounded_answer("confined space standby person observer requirement Factories Act Section 36", zone_id)
            citations = rag_res.get("citations", [])
            cit_title = "Factories Act 1948 Section 36"
            cit_text = "Any confined space entry must have a dedicated standby person stationed outside the entry point."
            if citations:
                cit_title = citations[0].get("title", cit_title)
                cit_text = citations[0].get("content", cit_text)

            corr_action = (
                f"Action Required: IMMEDIATELY halt confined space operations in {zone_name}. "
                f"Do not permit entry until a certified safety watch observer is physically stationed "
                f"outside the entry point to monitor conditions and manage rescue lines."
            )

            existing = db.query(ComplianceDeviation).filter(
                ComplianceDeviation.plant_id == plant_id,
                ComplianceDeviation.zone_id == zone_id,
                ComplianceDeviation.deviation_type == dev_type,
                ComplianceDeviation.resolved == False
            ).first()

            if not existing:
                dev = ComplianceDeviation(
                    plant_id=plant_id,
                    zone_id=zone_id,
                    timestamp=current_time,
                    category="Permit",
                    deviation_type=dev_type,
                    description=desc,
                    regulatory_requirement=cit_text,
                    citation=cit_title,
                    severity="high",
                    corrective_action=corr_action,
                    resolved=False
                )
                db.add(dev)
                deviations.append(dev)

    # 4. Periodic Medical Examination (PME) check
    # Check workers active in the last 1 hour of current_time
    recent_pings = db.query(WorkerLocation).filter(
        WorkerLocation.plant_id == plant_id,
        WorkerLocation.timestamp >= current_time - timedelta(hours=1),
        WorkerLocation.timestamp <= current_time
    ).all()

    active_workers = {p.worker_id: (p.worker_name, p.zone_id) for p in recent_pings}

    for worker_id, (worker_name, zone_id) in active_workers.items():
        # Remove plant prefix (e.g. C or R) to map to medical registry
        base_id = worker_id[1:] if (worker_id.startswith('C') or worker_id.startswith('R')) else worker_id
        if base_id in MOCK_MEDICAL_EXAMS:
            exam_date_str = MOCK_MEDICAL_EXAMS[base_id]
            exam_date = datetime.strptime(exam_date_str, "%Y-%m-%d")
            days_since_exam = (current_time - exam_date).days

            if days_since_exam > 365:
                zone_name = zone_names.get(zone_id, zone_id)
                dev_type = f"{worker_name} ({worker_id}): Overdue Periodic Medical Examination"
                desc = (
                    f"Technician {worker_name} ({worker_id}) is active in hazardous zone {zone_name} but "
                    f"has an overdue Periodic Medical Examination (last exam: {exam_date_str}, "
                    f"{days_since_exam} days ago)."
                )

                rag_res = generate_grounded_answer("Factories Act Section 41-C periodic medical checkup", zone_id)
                citations = rag_res.get("citations", [])
                cit_title = "Factories Act 1948 Section 41-C"
                cit_text = "Workers in hazardous processes must undergo periodic medical examinations every 12 months."
                if citations:
                    cit_title = citations[0].get("title", cit_title)
                    cit_text = citations[0].get("content", cit_text)

                corr_action = (
                    f"Action Required: Temporarily reassign technician {worker_name} to low-risk office/admin duties "
                    f"outside of hazardous process areas. Schedule their statutory medical checkup immediately, "
                    f"and update their health record."
                )

                existing = db.query(ComplianceDeviation).filter(
                    ComplianceDeviation.plant_id == plant_id,
                    ComplianceDeviation.zone_id == zone_id,
                    ComplianceDeviation.deviation_type == dev_type,
                    ComplianceDeviation.resolved == False
                ).first()

                if not existing:
                    dev = ComplianceDeviation(
                        plant_id=plant_id,
                        zone_id=zone_id,
                        timestamp=current_time,
                        category="Statutory",
                        deviation_type=dev_type,
                        description=desc,
                        regulatory_requirement=cit_text,
                        citation=cit_title,
                        severity="medium",
                        corrective_action=corr_action,
                        resolved=False
                    )
                    db.add(dev)
                    deviations.append(dev)

    if deviations:
        db.commit()

    return deviations
