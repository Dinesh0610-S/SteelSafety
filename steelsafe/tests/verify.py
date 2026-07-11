"""
SteelSafe Intelligence -- Phase 2 Verification Script

Hits every API endpoint including Phase 2 risk endpoints, validates response
structure, and prints a human-readable summary. Run this after starting the server.

Usage:
    python tests/verify.py

Prerequisites:
    pip install requests
    uvicorn main:app --port 8000   (in a separate terminal)
"""

import sys
import io
import json

# Force UTF-8 output on Windows terminals
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from datetime import datetime

try:
    import requests
except ImportError:
    print("ERROR: 'requests' package not found. Run: pip install requests")
    sys.exit(1)

BASE_URL  = "http://localhost:8000/api/v1"
SEPARATOR = "=" * 70
PASS_STR  = "[PASS]"
FAIL_STR  = "[FAIL]"

results = []


def check(name: str, resp, required_keys: list = None, expected_count: int = None):
    """Validate a response and record pass/fail."""
    ok = True
    notes = []

    if resp.status_code != 200:
        ok = False
        notes.append(f"HTTP {resp.status_code}")
    else:
        data = resp.json()
        items = data if isinstance(data, list) else [data]

        if required_keys and items:
            missing = [k for k in required_keys if k not in items[0]]
            if missing:
                ok = False
                notes.append(f"Missing keys: {missing}")

        # scenario_id must NOT appear in any API response
        for item in items:
            if isinstance(item, dict) and "scenario_id" in item:
                ok = False
                notes.append("WARNING: scenario_id leaked into API response!")
                break

        if expected_count is not None and len(items) != expected_count:
            ok = False
            notes.append(f"Expected {expected_count} items, got {len(items)}")

    status = PASS_STR if ok else FAIL_STR
    results.append((name, ok))
    note_str = f"  --> {'; '.join(notes)}" if notes else ""
    print(f"  {status}  {name}{note_str}")
    return resp.json() if resp.status_code == 200 else None


# =============================================================================
print(SEPARATOR)
print("  SteelSafe Intelligence -- Phase 2 API Verification")
print(f"  Target: {BASE_URL}")
print(f"  Time:   {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
print(SEPARATOR)

# 1. Health check
print("\n[1] Health Check")
try:
    r = requests.get("http://localhost:8000/health", timeout=5)
    check("GET /health", r, required_keys=["status"])
    r = requests.get("http://localhost:8000/", timeout=5)
    check("GET /", r, required_keys=["service", "version", "phase", "status"])
except requests.exceptions.ConnectionError:
    print("  [ERROR] Cannot connect to server at http://localhost:8000")
    print("  Make sure the server is running: uvicorn main:app --port 8000")
    sys.exit(1)

# 2. Zones
print("\n[2] Zones")
r = requests.get(f"{BASE_URL}/zones", timeout=5)
zones_data = check("GET /zones (all zones)",
                   r,
                   required_keys=["zone_id", "name", "description", "area_type", "max_workers"],
                   expected_count=5)

# 3. Sensors -- current
print("\n[3] Sensors -- Current")
r = requests.get(f"{BASE_URL}/sensors/current", timeout=5)
sensor_current = check("GET /sensors/current (all zones)",
                        r,
                        required_keys=["zone_id", "zone_name", "timestamp",
                                       "co_ppm", "h2s_ppm", "temperature_c", "pressure_kpa"],
                        expected_count=5)

# 4. Permits
print("\n[4] Permits")
r = requests.get(f"{BASE_URL}/permits?status=active", timeout=5)
check("GET /permits?status=active", r,
      required_keys=["id", "permit_ref", "zone_id", "permit_type",
                     "issued_to", "start_time", "end_time", "status"])

# 5. Shifts
print("\n[5] Shifts")
r = requests.get(f"{BASE_URL}/shifts", timeout=5)
shifts_data = check("GET /shifts (3 shifts A/B/C)", r,
                    required_keys=["id", "shift_name", "start_time", "end_time",
                                   "supervisor", "crew_count"],
                    expected_count=3)

# 6. Workers
print("\n[6] Workers")
r = requests.get(f"{BASE_URL}/workers/locations?limit=20", timeout=5)
check("GET /workers/locations?limit=20", r,
      required_keys=["id", "worker_id", "worker_name", "zone_id", "timestamp"])

# 7. Phase 2 -- Risk Current Evaluation
print("\n[7] Risk Current (Real-time Evaluation)")
r = requests.get(f"{BASE_URL}/risk/current", timeout=5)
risk_current = check("GET /risk/current", r,
                     required_keys=["zone_id", "zone_name", "timestamp", "risk_score",
                                    "risk_level", "explanation", "anomaly_flagged"],
                     expected_count=5)

# 8. Phase 2 -- Risk History
print("\n[8] Risk History (Stored Sweep Results)")
r = requests.get(f"{BASE_URL}/risk/history?limit=10", timeout=5)
check("GET /risk/history?limit=10", r,
      required_keys=["id", "zone_id", "timestamp", "risk_score", "risk_level",
                     "anomaly_flagged", "explanation"])

# 9. Phase 2 -- Risk Zone Detail (with snapshot)
print("\n[9] Risk Zone Detail (zone_cob1)")
r = requests.get(f"{BASE_URL}/risk/zone/zone_cob1", timeout=5)
check("GET /risk/zone/zone_cob1", r,
      required_keys=["id", "zone_id", "timestamp", "risk_score", "risk_level",
                     "anomaly_flagged", "explanation", "signal_snapshot"])

# 10. Phase 2 -- Rules Config Listing
print("\n[10] Rules Config Listing")
r = requests.get(f"{BASE_URL}/risk/rules", timeout=5)
check("GET /risk/rules", r,
      required_keys=["rule_id", "name", "weight", "enabled", "category", "summary"])

# 11. Admin regenerate (with risk pre-population sweep verification)
print("\n[11] Admin -- Regenerate (Verifying risk sweep is also triggered)")
r = requests.post(f"{BASE_URL}/admin/regenerate", timeout=60)
regen = check("POST /admin/regenerate", r,
              required_keys=["status", "sensor_readings", "permits",
                             "maintenance_logs", "worker_pings", "risk_assessments",
                             "high_critical_risk_count"])

# =============================================================================
print(f"\n{SEPARATOR}")
print("  SAMPLE DATA SPOT-CHECK")
print(SEPARATOR)

# Show current risk level snapshot
if risk_current:
    print("\n⚠️  Current Compound Risk levels per zone:")
    for rc in risk_current:
        zone = rc["zone_name"].ljust(22)
        score = f"{rc['risk_score']:>5.1f}/100"
        level = rc["risk_level"].upper().ljust(9)
        rules = f"Rules: {rc['triggered_rules'] or 'None'}"
        print(f"  {zone}  [{level}]  {score}   {rules}")

# Show regen summary
if regen:
    print("\n🔄 Regeneration & Sweep Summary:")
    for k, v in regen.items():
        print(f"  {k:<26} {v}")

# =============================================================================
print(f"\n{SEPARATOR}")
passed = sum(1 for _, ok in results if ok)
total  = len(results)
print(f"  Results: {passed}/{total} checks passed")

if passed == total:
    print("  🎉 All checks passed! Phase 2 backend & compound risk engine are working correctly.")
else:
    failed = [name for name, ok in results if not ok]
    print(f"  ⚠️  Failed checks: {failed}")

print(SEPARATOR)
sys.exit(0 if passed == total else 1)
