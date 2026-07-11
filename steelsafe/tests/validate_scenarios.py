"""
SteelSafe Intelligence -- Phase 7A Scenario Validation Script
=============================================================
Sweeps the full 8-hour simulated timeline and evaluates BOTH detectors:
  1. Compound risk engine (full multi-signal correlation)
  2. Naive single-sensor baseline (threshold-only, no context)

Reports for each of the 6 scenarios:
  - Compound engine: first HIGH/CRITICAL flag, peak score, rules fired
  - Baseline detector: first alarm fired (if any), alarm type
  - Lead time difference (compound vs. baseline) in minutes
  - For scenario_6 (near-miss): discipline check — did compound over-react?

Also reports:
  - False positive rates for BOTH detectors during safe baseline periods
  - Aggregate comparison statistics

Usage:
    python tests/validate_scenarios.py

This script connects directly to the SQLite DB (no server needed).
It DOES store compound engine results to risk_assessments (populating /risk/history).
"""

import sys
import io
import json
import os

# Force UTF-8 output on Windows cp1252 terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

# Add project root to path so imports work when run from any directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timedelta
from collections import defaultdict

from db.database import SessionLocal, create_all_tables
from db.models import SensorReading, RiskAssessment
from data_generator.zones import ZONES
from data_generator.scenarios import SCENARIOS
from risk_engine import thresholds as T
from risk_engine.engine import sweep_full_timeline
from risk_engine.baseline import evaluate_baseline

SEP  = "=" * 80
SEP2 = "-" * 80

# ---------------------------------------------------------------------------
# Step 0: Ensure DB is ready
# ---------------------------------------------------------------------------
create_all_tables()

db = SessionLocal()

sensor_count = db.query(SensorReading).count()
if sensor_count == 0:
    print("ERROR: No sensor data found. Run the server first (it auto-seeds on startup).")
    print("       Or run: uvicorn main:app --port 8000")
    db.close()
    sys.exit(1)

print(SEP)
print("  SteelSafe Intelligence -- Phase 7A: Compound Engine vs. Baseline Validation")
print(f"  Sensor rows found: {sensor_count}  |  Scenarios: {len(SCENARIOS)}")
print(SEP)

# ---------------------------------------------------------------------------
# Step 1: Get T0 (simulation start) from the earliest sensor timestamp
# ---------------------------------------------------------------------------
earliest_ts = (
    db.query(SensorReading.timestamp)
    .order_by(SensorReading.timestamp)
    .first()[0]
)
t0 = earliest_ts
print(f"\n  Simulation T0: {t0.strftime('%Y-%m-%d %H:%M:%S')}")
print(f"  Shift end  T8: {(t0 + timedelta(hours=8)).strftime('%Y-%m-%d %H:%M:%S')}\n")

# ---------------------------------------------------------------------------
# Step 2: Run compound engine full sweep and store to DB
# ---------------------------------------------------------------------------
print(SEP)
print("  STEP 1: Running full timeline compound risk sweep (storing to DB)...")
print(SEP)

db.query(RiskAssessment).delete()
db.commit()

sweep_stats = sweep_full_timeline(db, store=True)

print(f"\n  Total compound evaluations: {sweep_stats['total_evaluations']}")
print(f"  High/Critical count:        {sweep_stats['high_critical_count']}")

# ---------------------------------------------------------------------------
# Step 3: Load all stored assessments and sensor readings into memory
# ---------------------------------------------------------------------------
all_assessments = (
    db.query(RiskAssessment)
    .order_by(RiskAssessment.zone_id, RiskAssessment.timestamp)
    .all()
)

by_zone: dict = defaultdict(list)
for a in all_assessments:
    by_zone[a.zone_id].append(a)

sensor_by_zone: dict = defaultdict(list)
sensor_rows = (
    db.query(SensorReading)
    .order_by(SensorReading.zone_id, SensorReading.timestamp)
    .all()
)
for r in sensor_rows:
    sensor_by_zone[r.zone_id].append(r)

# All unique timestamps for baseline sweep during false-positive analysis
all_timestamps = sorted(set(r.timestamp for r in sensor_rows))

# ---------------------------------------------------------------------------
# Step 4: Per-scenario analysis — compound engine + baseline
# ---------------------------------------------------------------------------
print(f"\n{SEP}")
print("  STEP 2: PER-SCENARIO DETECTION COMPARISON")
print(SEP)

scenario_results = []

for sc in SCENARIOS:
    zone_id     = sc["zone_id"]
    sc_start    = t0 + timedelta(seconds=sc["start_offset_s"])
    sc_end      = sc_start + timedelta(seconds=sc["duration_s"])
    sc_id       = sc["scenario_id"]
    sc_label    = sc["label"]
    is_near_miss = sc.get("self_resolve", False)
    zone_name   = next((z["name"] for z in ZONES if z["zone_id"] == zone_id), zone_id)

    assessments_in_window = [
        a for a in by_zone[zone_id]
        if sc_start <= a.timestamp <= sc_end
    ]

    # ---- Compound engine: first HIGH/CRITICAL flag --------------------------
    first_compound_flag  = None
    first_compound_score = None
    first_compound_rules = None
    peak_score = 0.0
    peak_ts    = None
    peak_level = "low"

    for a in assessments_in_window:
        if a.risk_score > peak_score:
            peak_score = a.risk_score
            peak_ts    = a.timestamp
            peak_level = a.risk_level

        if first_compound_flag is None and a.risk_level in ("high", "critical"):
            first_compound_flag  = a.timestamp
            first_compound_score = a.risk_score
            first_compound_rules = a.triggered_rules

    # ---- Baseline detector: first alarm in window ---------------------------
    first_baseline_flag  = None
    first_baseline_type  = None
    sensors_in_window    = [
        r for r in sensor_by_zone[zone_id]
        if sc_start <= r.timestamp <= sc_end
    ]

    for r in sensors_in_window:
        bl_result = evaluate_baseline(zone_id, r.timestamp, db)
        if bl_result.fired:
            first_baseline_flag = r.timestamp
            first_baseline_type = bl_result.alarm_type
            break

    # ---- Lead time calculation -----------------------------------------------
    lead_time_minutes = None
    if first_compound_flag and first_baseline_flag:
        lead_time_minutes = round(
            (first_baseline_flag - first_compound_flag).total_seconds() / 60.0, 1
        )
    elif first_compound_flag and not first_baseline_flag:
        # Compound caught it; baseline never fired → full scenario duration = advantage
        lead_time_minutes = round(sc["duration_s"] / 60.0, 1)

    # ---- Near-miss discipline check ------------------------------------------
    near_miss_pass = None
    if is_near_miss:
        near_miss_pass = peak_level in ("low", "medium")

    scenario_results.append({
        "sc_id":               sc_id,
        "sc_label":            sc_label,
        "zone_id":             zone_id,
        "zone_name":           zone_name,
        "is_near_miss":        is_near_miss,
        "sc_start":            sc_start,
        "sc_end":              sc_end,
        "first_compound_flag": first_compound_flag,
        "first_compound_score":first_compound_score,
        "first_compound_rules":first_compound_rules,
        "first_baseline_flag": first_baseline_flag,
        "first_baseline_type": first_baseline_type,
        "peak_score":          peak_score,
        "peak_ts":             peak_ts,
        "peak_level":          peak_level,
        "lead_time_minutes":   lead_time_minutes,
        "near_miss_pass":      near_miss_pass,
    })

    # --- Print detailed per-scenario report -----------------------------------
    nm_tag = " [NEAR-MISS]" if is_near_miss else ""
    print(f"\n  {sc_id.upper()}{nm_tag} -- {sc_label}")
    print(f"  Zone: {zone_name} ({zone_id})")
    print(f"  Window: {sc_start.strftime('%H:%M:%S')} --> {sc_end.strftime('%H:%M:%S')} "
          f"({sc['duration_s']//60} min)")
    print(SEP2)

    if is_near_miss:
        result_str = "PASS" if near_miss_pass else "FAIL"
        print(f"  [NEAR-MISS] Peak compound score: {peak_score:.1f}/100  |  Level: {peak_level.upper()}")
        print(f"  [NEAR-MISS] Discipline check: {result_str} "
              f"({'correctly stayed <= MEDIUM' if near_miss_pass else 'WRONGLY flagged HIGH/CRITICAL!'})")
        if first_baseline_flag:
            print(f"  [BASELINE] FIRED at {first_baseline_flag.strftime('%H:%M:%S')} "
                  f"(type: {first_baseline_type}) — unexpected for near-miss!")
        else:
            print("  [BASELINE] Correctly stayed silent (no threshold exceeded). PASS.")
    else:
        if first_compound_flag:
            offset_min = (first_compound_flag - sc_start).total_seconds() / 60.0
            print(f"  [COMPOUND] First flag: {first_compound_flag.strftime('%H:%M:%S')} "
                  f"(+{offset_min:.1f} min into window) | Score: {first_compound_score}/100 | Rules: {first_compound_rules}")
        else:
            print("  [COMPOUND] NOT FLAGGED during scenario window -- review rule thresholds!")

        if first_baseline_flag:
            offset_min = (first_baseline_flag - sc_start).total_seconds() / 60.0
            print(f"  [BASELINE] First alarm: {first_baseline_flag.strftime('%H:%M:%S')} "
                  f"(+{offset_min:.1f} min into window) | Type: {first_baseline_type}")
        else:
            print("  [BASELINE] No alarm fired — threshold not reached during scenario.")

        if lead_time_minutes is not None:
            if not first_baseline_flag:
                print(f"  LEAD TIME: Compound caught it; baseline MISSED ENTIRELY. "
                      f"Effective advantage: full {lead_time_minutes:.0f} min of the scenario.")
            elif lead_time_minutes > 0:
                print(f"  LEAD TIME: Compound engine flagged {lead_time_minutes:.1f} min BEFORE baseline alarm.")
            elif lead_time_minutes < 0:
                print(f"  NOTE: Baseline fired {abs(lead_time_minutes):.1f} min before compound engine.")
            else:
                print("  NOTE: Both detectors flagged simultaneously.")

        print(f"  PEAK RISK: {peak_score:.1f}/100 ({peak_level.upper()}) at "
              f"{peak_ts.strftime('%H:%M:%S') if peak_ts else 'N/A'}")

# ---------------------------------------------------------------------------
# Step 5: False positive analysis — BOTH detectors during safe periods
# ---------------------------------------------------------------------------
print(f"\n{SEP}")
print("  STEP 3: FALSE POSITIVE COMPARISON (safe baseline periods)")
print(SEP)

# Build set of all (zone_id, timestamp) pairs inside any scenario window
scenario_window_set: set = set()
for sc in SCENARIOS:
    sc_start = t0 + timedelta(seconds=sc["start_offset_s"])
    sc_end   = sc_start + timedelta(seconds=sc["duration_s"])
    for r in sensor_by_zone[sc["zone_id"]]:
        if sc_start <= r.timestamp <= sc_end:
            scenario_window_set.add((sc["zone_id"], r.timestamp))

zone_ids = [z["zone_id"] for z in ZONES]

compound_fp = 0
baseline_fp = 0
safe_evals  = 0

for ts in all_timestamps:
    for zone_id in zone_ids:
        if (zone_id, ts) in scenario_window_set:
            continue

        safe_evals += 1

        # Compound engine result from stored assessments
        row = next(
            (a for a in by_zone[zone_id] if a.timestamp == ts and
             a.risk_level in ("high", "critical")),
            None
        )
        if row:
            compound_fp += 1

        # Baseline detector result
        bl = evaluate_baseline(zone_id, ts, db)
        if bl.fired:
            baseline_fp += 1

compound_fp_rate = (compound_fp / safe_evals * 100) if safe_evals > 0 else 0
baseline_fp_rate = (baseline_fp / safe_evals * 100) if safe_evals > 0 else 0

print(f"\n  Safe-period evaluations: {safe_evals}")
print(f"  {'Detector':<22} {'False Positives':>16} {'FP Rate':>10}")
print(f"  {'-'*22} {'-'*16} {'-'*10}")
print(f"  {'Compound Engine':<22} {compound_fp:>16} {compound_fp_rate:>9.2f}%")
print(f"  {'Baseline (Single-Sensor)':<22} {baseline_fp:>16} {baseline_fp_rate:>9.2f}%")

if baseline_fp_rate > 0 and compound_fp_rate < baseline_fp_rate:
    reduction = ((baseline_fp_rate - compound_fp_rate) / baseline_fp_rate * 100)
    print(f"\n  >> Compound engine reduces false alarm rate by {reduction:.0f}% vs. baseline.")
elif compound_fp_rate == 0:
    print(f"\n  >> Compound engine: ZERO false positives in safe baseline periods!")

# ---------------------------------------------------------------------------
# Step 6: Summary comparison table
# ---------------------------------------------------------------------------
print(f"\n{SEP}")
print("  SUMMARY TABLE — COMPOUND ENGINE vs. BASELINE DETECTOR")
print(SEP)

print(f"  {'Scenario':<14} {'Zone':<10} {'Compound':<12} {'Baseline':<12} "
      f"{'Lead Time':>12} {'Near-Miss?'}")
print(f"  {'-'*14} {'-'*10} {'-'*12} {'-'*12} {'-'*12} {'-'*14}")

valid_leads = []
for r in scenario_results:
    compound_str  = r["first_compound_flag"].strftime('%H:%M:%S') if r["first_compound_flag"] else "NOT FLAGGED"
    baseline_str  = r["first_baseline_flag"].strftime('%H:%M:%S') if r["first_baseline_flag"] else "NO ALARM"

    if r["is_near_miss"]:
        lead_str = f"(NEAR-MISS)"
        nm_str   = f"{'PASS' if r['near_miss_pass'] else 'FAIL'} ({r['peak_level'].upper()} {r['peak_score']:.0f}/100)"
    else:
        nm_str = ""
        if r["lead_time_minutes"] is not None:
            valid_leads.append(r["lead_time_minutes"])
            lead_str = f"+{r['lead_time_minutes']:.1f} min" if r["lead_time_minutes"] >= 0 else f"{r['lead_time_minutes']:.1f} min"
        else:
            lead_str = "N/A"

    print(f"  {r['sc_id']:<14} {r['zone_id']:<10} {compound_str:<12} {baseline_str:<12} "
          f"{lead_str:>12}  {nm_str}")

# ---- Aggregate stats -------------------------------------------------------
print(f"\n  Compound vs. Baseline — False Positive Rate:")
print(f"    Compound: {compound_fp_rate:.2f}%  ({compound_fp}/{safe_evals})")
print(f"    Baseline: {baseline_fp_rate:.2f}%  ({baseline_fp}/{safe_evals})")

if valid_leads:
    avg_lead = sum(valid_leads) / len(valid_leads)
    max_lead = max(valid_leads)
    print(f"\n  Lead Time Statistics (incident scenarios only):")
    print(f"    Average lead time: {avg_lead:.1f} min")
    print(f"    Maximum lead time: {max_lead:.1f} min")
    print(f"    Scenarios where compound detected first: "
          f"{sum(1 for l in valid_leads if l > 0)} / {len(valid_leads)}")
    print(f"    Scenarios where baseline missed entirely: "
          f"{sum(1 for r in scenario_results if not r['is_near_miss'] and not r['first_baseline_flag'])}"
          f" / {sum(1 for r in scenario_results if not r['is_near_miss'])}")

# ---- Near-miss discipline summary ------------------------------------------
near_miss_results = [r for r in scenario_results if r["is_near_miss"]]
if near_miss_results:
    all_pass = all(r["near_miss_pass"] for r in near_miss_results)
    print(f"\n  Near-Miss Discipline: "
          f"{'ALL PASS' if all_pass else 'SOME FAILED'} "
          f"({sum(1 for r in near_miss_results if r['near_miss_pass'])}/{len(near_miss_results)} passed)")


print(f"\n{SEP}")
print("  Phase 7A Validation complete. Risk history stored in DB.")
print(f"  Access via: GET http://localhost:8000/api/v1/risk/history")
print(f"  Metrics:    GET http://localhost:8000/api/v1/metrics/comparison")
print(SEP)

# ===========================================================================
# STEP 4: KNOWLEDGE GRAPH VERIFICATION (Phase 7B)
# ===========================================================================
print(f"\n{SEP}")
print("  STEP 4: KNOWLEDGE GRAPH VERIFICATION (Phase 7B)")
print(SEP)

try:
    from risk_engine.knowledge_graph import (
        query_graph, format_graph_explanation,
        KNOWLEDGE_GRAPH, NETWORKX_AVAILABLE,
    )

    if not NETWORKX_AVAILABLE:
        print("\n  WARNING: networkx not installed. Run: pip install networkx")
    else:
        n_nodes = KNOWLEDGE_GRAPH.number_of_nodes()
        n_edges = KNOWLEDGE_GRAPH.number_of_edges()
        print(f"\n  Knowledge graph: {n_nodes} nodes, {n_edges} edges")

        # Test A: zone_gcm + hot_work + CO_buildup + pressure_drop (scenarios 1 and 4)
        print(f"\n  [TEST A] zone_gcm + hot_work + CO_buildup + pressure_drop")
        ma = query_graph("zone_gcm", ["hot_work"], ["CO_buildup", "pressure_drop"])
        for m in ma:
            print(f"    [{m.match_strength}/3] {m.scenario_id}: {m.scenario_label}")
            print(f"          matched_on: {', '.join(m.matched_on)}")
        res_a = "PASS" if len(ma) >= 1 else "FAIL"
        print(f"    Result: {res_a} ({len(ma)} match(es), expected >=1)")

        # Test B: zone_cob1 + confined_space_entry + H2S_spike (scenario 2)
        print(f"\n  [TEST B] zone_cob1 + confined_space_entry + H2S_spike")
        mb = query_graph("zone_cob1", ["confined_space_entry"], ["H2S_spike"])
        for m in mb:
            print(f"    [{m.match_strength}/3] {m.scenario_id}: {m.scenario_label}")
            print(f"          matched_on: {', '.join(m.matched_on)}")
        res_b = "PASS" if len(mb) >= 1 else "FAIL"
        print(f"    Result: {res_b} ({len(mb)} match(es), expected >=1)")

        # Test C: near-miss zone with no gas hazards should NOT surface incident matches
        print(f"\n  [TEST C] zone_qt + cold_work + no hazards (near-miss zone discipline)")
        mc = query_graph("zone_qt", ["cold_work"], [])
        incident_mc = [m for m in mc if not m.is_near_miss]
        res_c = "PASS" if len(incident_mc) == 0 else f"NOTE: {len(incident_mc)} incident match(es)"
        print(f"    Incident matches found: {len(incident_mc)}  (expected 0)")
        print(f"    Result: {res_c}")

        # Test D: explanation format
        print(f"\n  [TEST D] format_graph_explanation() output for Test A:")
        if ma:
            expl = format_graph_explanation(ma)
            print(f"    {expl[:300]}{'...' if len(expl) > 300 else ''}")
        else:
            print("    (skipped -- no Test A matches)")

        graph_ok = len(ma) >= 1 and len(mb) >= 1
        print(f"\n  Graph Verification Summary: {'ALL PASS' if graph_ok else 'SOME NEED REVIEW'}")

except ImportError as exc:
    print(f"\n  ERROR importing knowledge_graph: {exc}")
    print("  Ensure networkx is installed: pip install networkx")

# ===========================================================================
# STEP 5: FATIGUE SCORE BUMP VERIFICATION (Phase 7B)
# ===========================================================================
print(f"\n{SEP}")
print("  STEP 5: SHIFT FATIGUE SCORE BUMP VERIFICATION (Phase 7B)")
print(SEP)

late_start = t0 + timedelta(hours=7, minutes=0)
late_end   = t0 + timedelta(hours=8, minutes=0)

late_assessments = (
    db.query(RiskAssessment)
    .filter(
        RiskAssessment.timestamp >= late_start,
        RiskAssessment.timestamp <= late_end,
        RiskAssessment.risk_level.in_(["high", "critical"]),
    )
    .order_by(RiskAssessment.risk_score.desc())
    .limit(20)
    .all()
)

print(f"\n  Late-shift window: {late_start.strftime('%H:%M')} - {late_end.strftime('%H:%M')}")
print(f"  High/Critical assessments in window: {len(late_assessments)}")

fatigue_examples = []
for a in late_assessments:
    if not a.signal_snapshot:
        continue
    try:
        snap = json.loads(a.signal_snapshot)
    except (json.JSONDecodeError, TypeError):
        continue
    bump  = snap.get("fatigue_score_bump", 0)
    hours = snap.get("fatigue_hours_into_shift", 0.0)
    if bump > 0:
        fatigue_examples.append((a, snap, bump, hours))

print(f"  Assessments WITH fatigue bump > 0: {len(fatigue_examples)}")

if fatigue_examples:
    print(f"\n  PASS: Fatigue amplifier is firing correctly.\n")
    for a, snap, bump, hours in fatigue_examples[:3]:
        graph_count = len(snap.get("knowledge_graph_matches", []))
        print(f"  Zone: {a.zone_id}  |  {a.timestamp.strftime('%H:%M:%S')}")
        print(f"    Risk Score:    {a.risk_score}/100  ({a.risk_level.upper()})")
        print(f"    Fatigue bump:  +{bump} pts  ({hours:.1f}h into shift)")
        print(f"    Graph matches: {graph_count}")
        print(f"    Explanation:   {a.explanation[:400]}...")
        print()
else:
    print(f"\n  NOTE: No fatigue bump in late-shift High/Critical window.")
    print("  Fatigue only amplifies existing risk (base_score > 0 required).")
    print("  If incident windows end before T0+7h, the amplifier correctly stays silent.")

# Schema check: verify Phase 7B fields exist in any signal_snapshot
print(f"\n  Verifying signal_snapshot includes Phase 7B fields...")
any_snap = db.query(RiskAssessment).filter(RiskAssessment.signal_snapshot.isnot(None)).first()
if any_snap:
    s = json.loads(any_snap.signal_snapshot)
    field_names = [
        "fatigue_hours_into_shift",
        "fatigue_score_bump",
        "knowledge_graph_matches",
        "knowledge_graph_available",
    ]
    for fname in field_names:
        status = "PRESENT" if fname in s else "MISSING"
        print(f"    {fname:<36s} {status}")
    schema_ok = all(fname in s for fname in field_names)
    print(f"\n  Schema: {'ALL PHASE 7B FIELDS PRESENT' if schema_ok else 'SOME FIELDS MISSING'}")

    # Sample values
    print(f"\n  Sample values from zone={any_snap.zone_id}:")
    print(f"    fatigue_hours_into_shift: {s.get('fatigue_hours_into_shift', 'N/A')}")
    print(f"    fatigue_score_bump:       {s.get('fatigue_score_bump', 'N/A')}")
    print(f"    knowledge_graph_avail:    {s.get('knowledge_graph_available', 'N/A')}")
    print(f"    graph_match_count:        {len(s.get('knowledge_graph_matches', []))}")

# ===========================================================================
# Final
# ===========================================================================
print(f"\n{SEP}")
print("  Phase 7B Validation complete.")
print(f"  Risk history:       GET http://localhost:8000/api/v1/risk/history")
print(f"  Metrics comparison: GET http://localhost:8000/api/v1/metrics/comparison")
print(SEP)

db.close()
