"""
risk_engine/knowledge_graph.py
================================
Lightweight equipment-permit-risk knowledge graph for relationship-based reasoning.

Uses NetworkX (DiGraph) to encode historical co-occurrences between:
  - Zones (where incidents happened)
  - Equipment (what was involved)
  - Permit types (what work was authorised)
  - Hazard types (what gas/thermal event occurred)
  - Scenarios (the Phase 7A scripted incident library)

The graph is AUTO-DERIVED from the SCENARIOS registry in data_generator/scenarios.py
so it stays in sync automatically if new scenarios are added.

PRIMARY USE:
  At evaluation time, scorer.py calls query_graph(zone_id, permit_types, hazards)
  to surface historical pattern matches in the plain-language risk explanation:

    "Historical pattern match: similar zone+permit+hazard conditions preceded
     2 of your 6 scripted incidents (Scenario 1: Gas Main Pressure Drop + Hot Work;
     Scenario 4: Slow Gas Leak During Active Hot-Work Permit)."

DESIGN PRINCIPLES:
  - Module-level singleton: KNOWLEDGE_GRAPH is built once on import (fast)
  - Pure function: query_graph() has no DB access — takes plain Python args
  - Auto-derives equipment nodes from zone → equipment mapping (no hardcoded lists)
  - Hazard types are inferred from sensor spike thresholds — same logic as rules.py
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional

try:
    import networkx as nx
    NETWORKX_AVAILABLE = True
except ImportError:
    NETWORKX_AVAILABLE = False
    nx = None  # type: ignore


# ---------------------------------------------------------------------------
# Node type constants (used as "node_type" attribute on graph nodes)
# ---------------------------------------------------------------------------
NT_ZONE       = "ZONE"
NT_EQUIPMENT  = "EQUIPMENT"
NT_PERMIT     = "PERMIT_TYPE"
NT_HAZARD     = "HAZARD"
NT_SCENARIO   = "SCENARIO"

# Edge type constants (used as "edge_type" attribute on graph edges)
ET_LOCATED_IN       = "located_in"
ET_REQUIRES_PERMIT  = "requires_permit"
ET_OCCURRED_IN      = "occurred_in"
ET_INVOLVED_PERMIT  = "involved_permit"
ET_PRODUCED_HAZARD  = "produced_hazard"
ET_CORRELATED_WITH  = "historically_correlated"

# ---------------------------------------------------------------------------
# Zone → primary equipment mapping
# Reflects the physical reality of each zone in the plant configurations.
# ---------------------------------------------------------------------------
ZONE_EQUIPMENT: dict[str, list[str]] = {
    "zone_gcm":  ["gas_main_header", "ascension_pipe", "flange_joint", "pressure_gauge"],
    "zone_cob1": ["coke_oven_battery", "combustion_flue", "oven_standpipe", "gas_offtake_valve"],
    "zone_ca":   ["larry_car", "charging_lid", "coal_charging_system"],
    "zone_qt":   ["quench_car", "quench_tower_drainage", "water_spray_nozzle"],
    "zone_cr":   ["dcs_panel", "cctv_system", "hvac_pressurisation"],
    "zone_rhf":  ["reheating_furnace", "furnace_burner", "draft_damper", "exhaust_stack"],
    "zone_rs":   ["rolling_stand", "hydraulic_line", "work_roll_bearing", "cobble_detector"],
    "zone_cb":   ["cooling_bed", "scale_pit", "discharge_crane"],
    "zone_fl":   ["finishing_line", "mechanical_shear", "bundling_press"],
    "zone_cr2":  ["plc_rack", "operator_console", "hvac_pressurisation"],
}

# Equipment → high-risk permit types (what kind of work this equipment requires)
EQUIPMENT_PERMIT: dict[str, list[str]] = {
    "gas_main_header":       ["hot_work", "cold_work"],
    "ascension_pipe":        ["hot_work"],
    "flange_joint":          ["hot_work", "cold_work"],
    "pressure_gauge":        ["cold_work"],
    "coke_oven_battery":     ["confined_space_entry", "cold_work"],
    "combustion_flue":       ["cold_work"],
    "oven_standpipe":        ["confined_space_entry"],
    "gas_offtake_valve":     ["cold_work"],
    "larry_car":             ["cold_work"],
    "charging_lid":          ["cold_work"],
    "coal_charging_system":  ["hot_work", "cold_work"],
    "quench_car":            ["cold_work"],
    "quench_tower_drainage": ["confined_space_entry", "cold_work"],
    "water_spray_nozzle":    ["cold_work"],
    "dcs_panel":             [],
    "cctv_system":           [],
    "hvac_pressurisation":   ["cold_work"],
    "reheating_furnace":    ["confined_space_entry", "cold_work"],
    "furnace_burner":       ["hot_work"],
    "draft_damper":         ["cold_work"],
    "exhaust_stack":        ["cold_work"],
    "rolling_stand":        ["hot_work", "cold_work"],
    "hydraulic_line":       ["hot_work", "cold_work"],
    "work_roll_bearing":    ["cold_work"],
    "cobble_detector":      ["cold_work"],
    "scale_pit":            ["confined_space_entry", "cold_work"],
    "discharge_crane":      ["cold_work"],
    "mechanical_shear":     ["hot_work", "cold_work"],
    "bundling_press":       ["cold_work"],
    "plc_rack":             [],
    "operator_console":     [],
}

# ---------------------------------------------------------------------------
# Hazard inference: map sensor spike characteristics to hazard node IDs
# Uses the same thresholds as rules.py / thresholds.py to stay consistent.
# ---------------------------------------------------------------------------
HAZARD_LABELS: dict[str, str] = {
    "CO_buildup":          "CO concentration build-up above action level",
    "H2S_spike":           "H2S concentration spike above action level",
    "pressure_drop":       "Gas main pressure drop below baseline",
    "temperature_overheat":"Equipment/zone temperature above normal operating range",
    "near_miss":           "Transient gas build-up that self-resolved without crossing alarm threshold",
}

# Thresholds for auto-inferring hazard type from a scenario's sensor_spike dict
# (mean CO above this in the spike → CO_buildup, etc.)
_HAZARD_CO_THRESHOLD    = 35.0   # matches CO_SECONDARY_PPM in thresholds.py
_HAZARD_H2S_THRESHOLD   = 5.0    # matches H2S_SECONDARY_PPM
_HAZARD_TEMP_DELTA      = 50.0   # deviation from baseline
_HAZARD_PRESSURE_DROP   = 2.5    # kPa drop from baseline matches thresholds.py


def _infer_hazards_from_scenario(scenario: dict) -> list[str]:
    """
    Auto-infer hazard types from a scenario's sensor_spike dict and metadata.
    Returns a list of hazard node IDs (e.g. ["CO_buildup", "pressure_drop"]).
    """
    hazards: list[str] = []
    spike = scenario.get("sensor_spike", {})

    # Near-miss → self_resolve flag
    if scenario.get("self_resolve", False):
        hazards.append("near_miss")
        return hazards  # near-miss is its own category; don't double-count

    # CO build-up: spike mean above action level
    co_mean = spike.get("co_ppm", (0.0, 0.0, 0.0))[0]
    if co_mean >= _HAZARD_CO_THRESHOLD:
        hazards.append("CO_buildup")

    # H2S spike: spike mean above action level
    h2s_mean = spike.get("h2s_ppm", (0.0, 0.0, 0.0))[0]
    if h2s_mean >= _HAZARD_H2S_THRESHOLD:
        hazards.append("H2S_spike")

    # Pressure drop: trend < 0 and significant
    pressure_trend = spike.get("pressure_kpa", (0.0, 0.0, 0.0))[2]
    if pressure_trend < -0.015:  # significant downward trend
        hazards.append("pressure_drop")

    # Temperature overheat: spike mean significantly above normal baseline (e.g. 1020°C for Coke, 1180°C for Furnace)
    temp_mean = spike.get("temperature_c", (0.0, 0.0, 0.0))[0]
    if temp_mean >= 150.0:  # general industrial threshold for thermal overheat
        hazards.append("temperature_overheat")

    return hazards if hazards else ["CO_buildup"]  # fallback


# ---------------------------------------------------------------------------
# Build the NetworkX DiGraph
# ---------------------------------------------------------------------------

def build_graph() -> "nx.DiGraph":  # type: ignore
    """
    Construct the knowledge graph from all registered plants' scenarios.
    """
    if not NETWORKX_AVAILABLE:
        return None  # type: ignore

    from plants.registry import PLANT_REGISTRY
    scenarios = []
    for pc in PLANT_REGISTRY.values():
        scenarios.extend(pc["scenarios"])

    G = nx.DiGraph()

    # ---- Add ZONE nodes -------------------------------------------------
    for zone_id, equipment_list in ZONE_EQUIPMENT.items():
        G.add_node(zone_id, node_type=NT_ZONE, label=zone_id)

        # ---- Add EQUIPMENT nodes and zone→equipment edges ----------------
        for equip in equipment_list:
            if not G.has_node(equip):
                G.add_node(equip, node_type=NT_EQUIPMENT, label=equip)
            G.add_edge(zone_id, equip, edge_type=ET_LOCATED_IN)

            # ---- Add PERMIT_TYPE nodes and equipment→permit edges --------
            for permit_type in EQUIPMENT_PERMIT.get(equip, []):
                permit_node = f"permit:{permit_type}"
                if not G.has_node(permit_node):
                    G.add_node(permit_node, node_type=NT_PERMIT, label=permit_type,
                               permit_type=permit_type)
                G.add_edge(equip, permit_node, edge_type=ET_REQUIRES_PERMIT)

    # ---- Add HAZARD nodes -----------------------------------------------
    for hazard_id, hazard_label in HAZARD_LABELS.items():
        G.add_node(f"hazard:{hazard_id}", node_type=NT_HAZARD, label=hazard_label,
                   hazard_id=hazard_id)

    # ---- Add SCENARIO nodes + edges from scenarios ----------------------
    for sc in scenarios:
        sc_id    = sc["scenario_id"]     # e.g. "scenario_1"
        zone_id  = sc["zone_id"]
        permit   = sc.get("permit_type", "cold_work")
        is_nm    = sc.get("self_resolve", False)

        # Scenario node
        G.add_node(sc_id,
                   node_type       = NT_SCENARIO,
                   label           = sc["label"],
                   is_near_miss    = is_nm,
                   zone_id         = zone_id,
                   permit_type     = permit,
                   description     = sc.get("description", ""),
                   worker_cluster  = sc.get("worker_cluster_size", 0))

        # Scenario → zone
        G.add_edge(sc_id, zone_id, edge_type=ET_OCCURRED_IN)

        # Scenario → permit_type
        permit_node = f"permit:{permit}"
        if not G.has_node(permit_node):
            G.add_node(permit_node, node_type=NT_PERMIT, label=permit,
                       permit_type=permit)
        G.add_edge(sc_id, permit_node, edge_type=ET_INVOLVED_PERMIT)

        # Scenario → hazard(s)
        hazards = _infer_hazards_from_scenario(sc)
        for haz in hazards:
            haz_node = f"hazard:{haz}"
            if not G.has_node(haz_node):
                G.add_node(haz_node, node_type=NT_HAZARD, label=haz, hazard_id=haz)
            G.add_edge(sc_id, haz_node, edge_type=ET_PRODUCED_HAZARD)

    return G


# Module-level singleton — built once on import
KNOWLEDGE_GRAPH: Optional["nx.DiGraph"] = build_graph() if NETWORKX_AVAILABLE else None  # type: ignore


# ---------------------------------------------------------------------------
# Query result dataclass
# ---------------------------------------------------------------------------

@dataclass
class GraphMatch:
    """A single historical scenario that matches the current conditions."""
    scenario_id:    str
    scenario_label: str
    zone_id:        str
    is_near_miss:   bool
    matched_on:     list[str]   # which dimensions matched: zone, permit, hazard
    match_strength: int         # how many dimensions matched (1–3)
    description:    str         # short excerpt from the scenario description


# ---------------------------------------------------------------------------
# Query function
# ---------------------------------------------------------------------------

def query_graph(
    zone_id:      str,
    permit_types: list[str],
    hazards:      list[str],
) -> list[GraphMatch]:
    """
    Find historical scenarios that involved the same zone, permit types, and/or
    hazard types as the current conditions.

    Matching logic (scoring):
      +1 point if the scenario occurred in the same zone
      +1 point for each permit type match
      +1 point for each hazard type match

    Returns scenarios with match_strength >= 1, sorted by match_strength desc.
    Near-miss scenarios (self_resolve=True) are returned separately labelled as such
    and only match if ALL 3 dimensions fire — they should not be surfaced as "similar
    to an incident" without strong evidence.

    Args:
        zone_id:      Current zone being evaluated (e.g. "zone_gcm")
        permit_types: List of active permit types (e.g. ["hot_work"])
        hazards:      List of inferred current hazard types (e.g. ["CO_buildup"])

    Returns:
        List[GraphMatch] sorted by match_strength descending.
        Empty list if graph is unavailable or no matches found.
    """
    if KNOWLEDGE_GRAPH is None:
        return []

    G = KNOWLEDGE_GRAPH
    permit_nodes = {f"permit:{pt}" for pt in permit_types}
    hazard_nodes = {f"hazard:{h}" for h in hazards}

    matches: list[GraphMatch] = []

    # Find all SCENARIO nodes
    scenario_nodes = [
        n for n, data in G.nodes(data=True)
        if data.get("node_type") == NT_SCENARIO
    ]

    for sc_node in scenario_nodes:
        sc_data = G.nodes[sc_node]
        is_near_miss = sc_data.get("is_near_miss", False)
        matched_on: list[str] = []
        strength = 0

        # ---- Zone match ------------------------------------------------
        # The scenario → zone edge (occurred_in)
        sc_zone = sc_data.get("zone_id", "")
        if sc_zone == zone_id:
            matched_on.append(f"zone:{zone_id}")
            strength += 1

        # ---- Permit match -----------------------------------------------
        # Edges: scenario → permit:TYPE (involved_permit)
        for _, target, edata in G.out_edges(sc_node, data=True):
            if edata.get("edge_type") == ET_INVOLVED_PERMIT and target in permit_nodes:
                pt = G.nodes[target].get("permit_type", target)
                matched_on.append(f"permit:{pt}")
                strength += 1
                break  # one permit match is sufficient

        # ---- Hazard match -----------------------------------------------
        # Edges: scenario → hazard:TYPE (produced_hazard)
        for _, target, edata in G.out_edges(sc_node, data=True):
            if edata.get("edge_type") == ET_PRODUCED_HAZARD and target in hazard_nodes:
                hid = G.nodes[target].get("hazard_id", target)
                matched_on.append(f"hazard:{hid}")
                strength += 1
                break  # one hazard match is sufficient

        # ---- Near-miss filter: require all 3 dimensions to report -------
        if is_near_miss and strength < 3:
            continue  # don't surface near-miss as "similar to an incident" unless very strong match

        if strength >= 1:
            # Grab first sentence of description for excerpt
            desc = sc_data.get("description", "")
            excerpt = desc.split(".")[0] + "." if "." in desc else desc[:120]

            matches.append(GraphMatch(
                scenario_id    = sc_node,
                scenario_label = sc_data.get("label", sc_node),
                zone_id        = sc_zone,
                is_near_miss   = is_near_miss,
                matched_on     = matched_on,
                match_strength = strength,
                description    = excerpt,
            ))

    # Sort by match_strength descending, then by scenario_id for determinism
    matches.sort(key=lambda m: (-m.match_strength, m.scenario_id))
    return matches


# ---------------------------------------------------------------------------
# Format graph matches into an explanation sentence
# ---------------------------------------------------------------------------

def format_graph_explanation(matches: list[GraphMatch]) -> str:
    """
    Generate a plain-language sentence describing the historical pattern matches.

    Example output:
      "[GRAPH] Historical pattern match: similar zone+permit+hazard conditions
       preceded 2 of your 6 scripted incidents —
       Scenario 1: Gas Main Pressure Drop + Hot Work (matched: zone, permit, hazard);
       Scenario 4: Slow Gas Leak During Active Hot-Work Permit (matched: zone, permit)."

    Returns empty string if no matches.
    """
    if not matches:
        return ""

    # Only show incident matches (exclude near-miss from explanation — they shouldn't
    # be framed as "incidents that preceded this")
    incident_matches = [m for m in matches if not m.is_near_miss]

    if not incident_matches:
        return ""

    count = len(incident_matches)
    total_scenarios = 6  # Phase 7A library size

    # Build per-match detail strings
    details = []
    for m in incident_matches[:3]:  # cap at 3 for readability
        dim_str = ", ".join(
            dim.split(":")[0] for dim in m.matched_on  # "zone", "permit", "hazard"
        )
        details.append(f"{m.scenario_label} (matched: {dim_str})")

    detail_str = "; ".join(details)

    return (
        f"[GRAPH] Historical pattern match: similar conditions preceded "
        f"{count} of {total_scenarios} scripted incidents in this library — "
        f"{detail_str}. "
        f"The compound engine weights this pattern as elevated risk."
    )


# ---------------------------------------------------------------------------
# Utility: infer current hazard types from a RiskContext (for scorer.py)
# ---------------------------------------------------------------------------

def infer_hazards_from_context(ctx) -> list[str]:
    """
    Infer the current active hazard types from a RiskContext.
    This mirrors the logic in _infer_hazards_from_scenario() but works at runtime.

    Used by scorer.py to build the `hazards` argument for query_graph().
    """
    if ctx.current_reading is None:
        return []

    hazards: list[str] = []

    # Use the same thresholds as rules.py for consistency
    from risk_engine import thresholds as T

    # CO build-up
    if ctx.current_reading.co_ppm >= T.CO_SECONDARY_PPM:
        hazards.append("CO_buildup")

    # H2S spike
    if ctx.current_reading.h2s_ppm >= T.H2S_SECONDARY_PPM:
        hazards.append("H2S_spike")

    # Pressure drop (vs zone baseline — same as R5)
    pressure_drop = ctx.zone_pressure_mean - ctx.current_reading.pressure_kpa
    if pressure_drop >= T.PRESSURE_DROP_FROM_BASELINE_KPA:
        hazards.append("pressure_drop")

    # Temperature overheat (vs zone baseline — same as R5-equivalent for temp)
    temp_delta = ctx.current_reading.temperature_c - ctx.zone_temp_mean
    if temp_delta >= T.TEMP_HIGH_DELTA_C:
        hazards.append("temperature_overheat")

    return hazards
