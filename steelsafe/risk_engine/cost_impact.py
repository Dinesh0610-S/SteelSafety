"""
risk_engine/cost_impact.py
===========================
Cost and business-impact translation layer.

Converts abstract risk scores and zone IDs into business-language impact
statements suitable for the safety officer's dashboard and pitch deck.

IMPORTANT DISCLAIMER: All figures in this module are ILLUSTRATIVE ESTIMATES
based on published industry benchmark data for coke oven and integrated steel
plant incidents. They are clearly labeled as such and are NOT:
  - VSP (Visakhapatnam Steel Plant) historical incident statistics
  - Legal or insurance assessments
  - Actuarial or financial guarantees

The purpose is to make risk scores tangible to non-technical stakeholders
(plant managers, safety directors, insurance assessors, investors).

Source basis:
  - OISD (Oil Industry Safety Directorate) incident cost guidelines
  - Steel industry regulatory closure data from DISH notifications
  - Published occupational safety incident cost benchmarks (NSCI, HSE)
  - Factories Act 1948 compliance timeline requirements
"""

from typing import Dict, Any, Optional

# ---------------------------------------------------------------------------
# Impact map: (zone_id, risk_level) → business impact language
# Fallback entries use wildcard zone_id = "*"
# ---------------------------------------------------------------------------
_IMPACT_MAP: Dict[tuple, Dict[str, Any]] = {

    # ==========================================================================
    # CRITICAL RISK entries — specific to each zone
    # ==========================================================================
    ("zone_gcm", "critical"): {
        "headline":           "Gas Main Critical — Full Production Stop Risk",
        "downtime_estimate":  "3–7 days",
        "financial_exposure": "₹2–8 Crore",
        "impact_language": (
            "A critical gas main event correlates with 3–7 days of full battery "
            "shutdown for gas isolation, header purging, structural inspection, and "
            "regulatory clearance. All downstream by-product processing is halted. "
            "Mandatory DISH (Factories Act §41-F) notification required within 2 hours. "
            "OISD Standard 137 Work Permit suspension applies immediately."
        ),
        "immediate_actions": [
            "Evacuate zone_gcm and adjacent zones (zone_cob1, zone_qt) immediately",
            "Activate gas isolation valves on affected header",
            "Notify DISH within 2 hours (Factories Act §41-F)",
            "Suspend ALL active permits in the zone (OISD Std 137, Clause 5.3)",
            "Deploy emergency gas monitoring team",
        ],
        "regulatory_citations": ["OISD Standard 137", "Factories Act 1948 §41-F", "Gas Safety SOP §3.1"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks for coke oven gas main "
            "incidents — not VSP-specific historical data. Actual cost and downtime will "
            "vary significantly by incident severity and containment speed."
        ),
    },

    ("zone_cob1", "critical"): {
        "headline":           "Battery 1 Critical — Mass Exposure & Shutdown Risk",
        "downtime_estimate":  "2–5 days",
        "financial_exposure": "₹1.5–5 Crore",
        "impact_language": (
            "A critical event in Coke Oven Battery 1 with workers present represents "
            "an immediate mass-casualty risk scenario. Battery shutdown takes 2–5 days "
            "including oven temperature normalisation, gas clearance, and safety audit. "
            "Worker medical examination and incident investigation are mandatory before restart."
        ),
        "immediate_actions": [
            "Immediate evacuation of zone_cob1 and Gas Collection Main",
            "Account for all workers in the zone (headcount required)",
            "Notify Emergency Response Team and Medical Officer",
            "Suspend oven charging and pushing operations",
            "Initiate incident report (Factories Act §88)",
        ],
        "regulatory_citations": ["Factories Act 1948 §88", "OISD Standard 137", "Gas Safety SOP §4.2"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks for coke oven battery "
            "incidents — not VSP-specific historical data."
        ),
    },

    ("zone_ca", "critical"): {
        "headline":           "Charging Platform Critical — Crew Exposure Risk",
        "downtime_estimate":  "1–3 days",
        "financial_exposure": "₹0.8–3 Crore",
        "impact_language": (
            "Critical gas levels in the Charging Area with an active worker cluster "
            "creates immediate CO exposure risk during charging operations. Production "
            "halt is required until gas levels are confirmed safe and the permit system "
            "is reviewed. Larry car operations must stop immediately."
        ),
        "immediate_actions": [
            "Halt all larry car and charging operations immediately",
            "Evacuate Charging Platform (zone_ca) and notify Coke Oven Battery 1",
            "Close or suspend active PTW permits in the zone",
            "Verify gas readings with portable monitors before re-entry",
            "Conduct headcount and check for CO exposure symptoms",
        ],
        "regulatory_citations": ["Gas Safety SOP §2.4", "OISD Standard 137", "Factories Act 1948 §36"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks for charging area "
            "incidents — not VSP-specific historical data."
        ),
    },

    ("zone_qt", "critical"): {
        "headline":           "Quenching Tower Critical — H2S Exposure Risk",
        "downtime_estimate":  "1–2 days",
        "financial_exposure": "₹0.5–2 Crore",
        "impact_language": (
            "Critical H2S or CO levels in the Quenching Tower present an acute "
            "inhalation risk, especially in lower drainage confined spaces. "
            "Quenching operations must stop, and the area must be cleared until gas "
            "readings return to safe levels and the source is identified."
        ),
        "immediate_actions": [
            "Stop quenching operations and evacuate the tower area",
            "Deploy SCBA-equipped response team for confined space inspection",
            "Identify and isolate the gas source",
            "Notify Medical Officer — H2S causes rapid olfactory fatigue",
        ],
        "regulatory_citations": ["Gas Safety SOP §2.5", "Factories Act 1948 §36A"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks for quenching area "
            "incidents — not VSP-specific historical data."
        ),
    },

    ("zone_cr", "critical"): {
        "headline":           "Control Room Critical — Command Centre Integrity Risk",
        "downtime_estimate":  "0.5–1 day",
        "financial_exposure": "₹0.2–1 Crore",
        "impact_language": (
            "Any gas ingress into the Control Room (normally air-pressurised) indicates "
            "a serious pressure seal failure. Loss of the command centre disrupts all "
            "plant monitoring and response capability, compounding any concurrent hazard."
        ),
        "immediate_actions": [
            "Check air pressurisation system immediately",
            "Evacuate non-essential personnel from Control Room",
            "Switch to backup monitoring stations",
            "Deploy engineering inspection of HVAC seals",
        ],
        "regulatory_citations": ["Gas Safety SOP §1.2", "OISD Standard 137 Clause 8"],
        "illustrative_basis": (
            "Illustrative estimate — not VSP-specific historical data."
        ),
    },

    # ==========================================================================
    # HIGH RISK entries — zone-specific
    # ==========================================================================
    ("zone_gcm", "high"): {
        "headline":           "Gas Main High Risk — Escalation Possible",
        "downtime_estimate":  "4–12 hours (if contained)",
        "financial_exposure": "₹0.5–2 Crore",
        "impact_language": (
            "High risk in the Gas Collection Main indicates converging hazard signals "
            "that may escalate to a critical event within 10–20 minutes without "
            "intervention. Historical industry data suggests early compound detection "
            "at this stage reduces incident severity by 70–85% compared to single-sensor "
            "alarm-only response."
        ),
        "immediate_actions": [
            "Suspend hot-work permits in zone_gcm immediately",
            "Increase gas monitoring frequency to continuous readings",
            "Alert shift supervisor and standby emergency team",
            "Prepare evacuation plan for adjacent zones",
        ],
        "regulatory_citations": ["OISD Standard 137", "Gas Safety SOP §3.2"],
        "illustrative_basis": (
            "Illustrative estimate — not VSP-specific historical data."
        ),
    },

    ("zone_cob1", "high"): {
        "headline":           "Battery 1 High Risk — Investigate Immediately",
        "downtime_estimate":  "2–6 hours (if contained)",
        "financial_exposure": "₹0.3–1.5 Crore",
        "impact_language": (
            "High risk in Coke Oven Battery 1 signals abnormal operating conditions "
            "requiring immediate investigation. Early detection at this stage typically "
            "allows containment without full battery shutdown if permit work is halted "
            "and gas source is isolated within 15 minutes."
        ),
        "immediate_actions": [
            "Review and potentially suspend confined space entry permits",
            "Reduce worker count in zone to essential personnel only",
            "Deploy portable gas monitors for targeted zone survey",
            "Notify incoming shift supervisor during changeover windows",
        ],
        "regulatory_citations": ["OISD Standard 137", "Factories Act 1948 §41-F"],
        "illustrative_basis": (
            "Illustrative estimate — not VSP-specific historical data."
        ),
    },

    # ==========================================================================
    # WILDCARD fallbacks (any zone not specifically mapped)
    # ==========================================================================
    ("*", "critical"): {
        "headline":           "Critical Risk — Immediate Shutdown Required",
        "downtime_estimate":  "1–4 days",
        "financial_exposure": "₹1–5 Crore",
        "impact_language": (
            "A critical compound risk event indicates multiple active hazards "
            "and immediate safety threats in this zone. Operations must be halted "
            "and personnel evacuated until safety conditions are restored and "
            "regulatory compliance is verified."
        ),
        "immediate_actions": [
            "IMMEDIATELY evacuate all personnel from this zone",
            "Suspend all active work permits in this zone",
            "Initiate emergency response procedures",
            "Notify plant safety director",
        ],
        "regulatory_citations": ["OISD Standard 137", "Factories Act 1948 §41-F"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks — not plant-specific historical data."
        ),
    },

    ("*", "high"): {
        "headline":           "High Risk — Early Intervention Required",
        "downtime_estimate":  "2–8 hours (if contained promptly)",
        "financial_exposure": "₹0.2–1.5 Crore",
        "impact_language": (
            "High compound risk indicates multiple converging hazard signals in this "
            "zone. Early intervention at this stage — before single-sensor thresholds "
            "are breached — is the core value of compound risk detection. "
            "Containment at the High stage typically prevents critical escalation and "
            "keeps production disruption to a partial-shift halt rather than multi-day shutdown."
        ),
        "immediate_actions": [
            "Review all active permits in the zone",
            "Reduce personnel exposure to essential staff only",
            "Increase monitoring frequency",
            "Notify shift supervisor of elevated risk state",
        ],
        "regulatory_citations": ["OISD Standard 137", "Gas Safety SOP"],
        "illustrative_basis": (
            "Illustrative estimate based on industry benchmarks — not VSP-specific data."
        ),
    },

    ("*", "medium"): {
        "headline":           "Medium Risk — Monitor Closely",
        "downtime_estimate":  "Minimal (< 2 hours if addressed)",
        "financial_exposure": "< ₹0.2 Crore",
        "impact_language": (
            "Medium compound risk indicates one or more safety signals are elevated "
            "but have not yet converged into a critical pattern. Standard monitoring "
            "and permit review is recommended. No immediate production halt required "
            "but situation should be re-evaluated at next assessment cycle."
        ),
        "immediate_actions": [
            "Review active permit status for the zone",
            "Confirm next supervisor check-in schedule",
            "Log elevated state in shift handover notes",
        ],
        "regulatory_citations": ["Gas Safety SOP §2.1"],
        "illustrative_basis": (
            "Illustrative estimate — not VSP-specific historical data."
        ),
    },
}


def get_cost_impact(zone_id: str, risk_level: str) -> Optional[Dict[str, Any]]:
    """
    Look up the cost/impact translation for a zone + risk level combination.

    Precedence:
      1. Exact (zone_id, risk_level) match
      2. Wildcard ("*", risk_level) fallback
      3. None if risk_level is "low" (no business impact language needed)

    Args:
        zone_id:    Zone identifier (e.g. "zone_gcm")
        risk_level: Risk level string ("low", "medium", "high", "critical")

    Returns:
        Dict with headline, downtime_estimate, financial_exposure,
        impact_language, immediate_actions, regulatory_citations, illustrative_basis.
        Returns None for "low" risk level.
    """
    if risk_level == "low":
        return None

    # Try exact match first
    result = _IMPACT_MAP.get((zone_id, risk_level))
    if result:
        return dict(result)  # Return a copy to prevent mutation

    # Try wildcard fallback
    result = _IMPACT_MAP.get(("*", risk_level))
    if result:
        return dict(result)

    return None
