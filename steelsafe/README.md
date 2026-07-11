# SteelSafe Intelligence — Phase 7C: PPE Detection & Office Alert Escalation

> AI-powered Industrial Safety Intelligence for a steel plant coke oven battery.  
> Inspired by the **2025 Visakhapatnam Steel Plant gas incident**.

---

## Phase 7C — PPE Detection & Office Alert Escalation

### What was added

- **Structured PPE violation events** — when the CCTV panel flags a PPE violation, a structured event
  (zone, timestamp, missing items, detection method, risk score at time) is created and stored server-side.
- **Main Office dashboard tab** — a new "Main Office" tab in the frontend UI shows a live feed of PPE
  violation events across all monitored zones, newest first, with Acknowledge and Resolve workflow.
- **Alert banner + sound** — a flashing red banner with an optional Web Audio API beep appears when a new
  violation event arrives. Sound is opt-in via a button in the Main Office view.
- **Risk engine integration** — violations feed Rule R7 ("CCTV PPE Violation in Elevated Gas Zone") which
  amplifies that zone's compound risk score when gas is also elevated.
- **New API endpoints** — `POST /api/v1/risk/ppe/violation`, `GET /api/v1/risk/ppe/violations`,
  `POST /api/v1/risk/ppe/violations/{id}/acknowledge`, `POST /api/v1/risk/ppe/violations/{id}/resolve`.

---

### PPE Detection Scope & Accuracy

> **Important**: Read this section before using this feature in any real-world context.

The webcam detection uses **Coco-SSD**, a pretrained TensorFlow.js model with **80 generic COCO object classes**.
None of these classes correspond to PPE equipment. The model can detect *person presence* reliably, but
**cannot detect whether that person is wearing a hard hat, safety vest, or face mask**.

| PPE Item | Detectable by current model? | Detection method |
|---|---|---|
| **Hard Hat / Helmet** | ❌ NOT by model | Manual simulation toggle in UI |
| **Safety Vest (hi-vis)** | ❌ NOT by model | Requires custom training |
| **Face Mask / Respirator** | ❌ NOT by model | Requires custom training |
| **Person Presence** | ✅ Yes, reliably | Coco-SSD `person` class |

**What "Simulate Hard Hat Violation" actually does:** The toggle in the CCTV panel is a **manual override**
that tells the system "assume this person is not wearing a hard hat." It does not use the model to infer PPE
compliance. All violation events generated this way are tagged `detection_method: manual_override` and
`confidence_pct: 0` in the API response, making this transparent.

#### Upgrading to Real PPE Detection (Production)

A production PPE detection system would require replacing or augmenting Coco-SSD with a custom-trained model,
for example:

1. **Dataset**: Use a PPE-annotated industrial dataset (e.g. HardHatWorkers on Roboflow, ~7,000+ labelled images).
2. **Model**: Fine-tune YOLOv8/v11 with classes: `[person, hard_hat, no_hard_hat, vest, no_vest]`.
3. **Integration**: Export to ONNX or TensorFlow.js format and load via `tf.loadGraphModel()`.
4. **Confidence threshold**: Use ≥ 0.65 confidence before triggering a violation event to reduce false positives.

---

### Privacy Considerations for Production Deployment

Processing live webcam feeds of workers involves **biometric-adjacent data** and carries significant
privacy obligations. Before any real deployment:

| Requirement | Detail |
|---|---|
| **Worker consent** | Inform and obtain explicit written consent from all workers whose image may be captured. |
| **Legal compliance** | India: DPDPA 2023; EU: GDPR Article 9 (biometric data); check local factory/labour law. |
| **Face recognition ban** | Do not add face recognition or worker identification to this system. |
| **Data minimisation** | Do not store raw video frames; store only violation events with metadata. |
| **Retention policy** | Define and enforce a maximum retention period for violation logs (e.g. 90 days). |
| **Local processing** | Prefer on-premises inference over cloud upload of video streams. |
| **Access control** | Only authorised safety officers and plant managers should access the Main Office dashboard. |

---



## Overview

This is **Phase 2** of the SteelSafe platform. It adds the **Compound Risk Detection Engine** that correlates multiple signals (sensor trends, active permits, technician logs, shift boundaries, and worker locations) to flag dangerous compound hazards before they escalate.

Key features added in this phase:
- **6 Compound Risk Rules** written as explicit, readable, and weight-adjustable functions.
- **Z-Score Anomaly Detector** (pure NumPy/L2-norm) to identify statistical outliers.
- **Explainable AI Story** returning plain-language reasons for flagged risks.
- **Risk Timeline Sweep** to pre-calculate and store historical risk scores.
- **6-Scenario Incident Library** covering slow leaks, overheats, near-misses, and direct incidents.
- **Single-Sensor Baseline Detector** for quantitative comparison against the compound engine.
- **Compound vs. Baseline Comparison Table** showing lead times and false positive rates.
- **Cost/Impact Translation Layer** converting risk scores to business-language impact estimates.
- **Knowledge Graph** (Phase 7B) encoding historical equipment-permit-hazard co-occurrences for relationship-based reasoning.
- **Shift Fatigue Amplifier** (Phase 7B) computing hours-into-shift and adding a weighted risk score bump when workers are deep into long shifts.

---

## Project Structure

```
steelsafe/
├── main.py                      ← FastAPI entry point (Phase 7A v7.0.0)
├── requirements.txt
├── steelsafe.db                 ← SQLite database
│
├── db/
│   ├── database.py
│   └── models.py                ← RiskAssessment ORM class
│
├── data_generator/              ← Phase 7A: 6-scenario incident library
│   ├── zones.py
│   ├── scenarios.py             ← EXPANDED: 6 scenarios (incl. near-miss)
│   ├── sensors.py               ← UPDATED: self_resolve flag for near-miss
│   ├── permits.py
│   ├── maintenance.py
│   ├── shifts.py
│   ├── workers.py
│   └── generator.py             ← Updated: incident_scenarios=6
│
├── risk_engine/                 ← Compound Risk Engine Package
│   ├── __init__.py
│   ├── thresholds.py            ← Rule weights, gas thresholds
│   ├── context_builder.py       ← RiskContext DB assembler
│   ├── rules.py                 ← Pure-logic rule functions (R1-R6)
│   ├── rules_config.py          ← Rule registry configuration
│   ├── anomaly.py               ← Z-score statistical detector
│   ├── scorer.py                ← Score aggregator & explanation writer
│   ├── engine.py                ← Sweep and evaluation entry points
│   ├── baseline.py              ← NEW: Naive single-sensor baseline detector
│   ├── comparison.py            ← NEW: Compound vs. baseline comparison engine
│   └── cost_impact.py           ← NEW: Business-language impact translation
│
├── api/
│   ├── schemas.py               ← Added cost_impact to RiskAssessmentResponse
│   └── routes/
│       ├── zones.py
│       ├── sensors.py
│       ├── permits.py
│       ├── maintenance.py
│       ├── shifts.py
│       ├── workers.py
│       ├── risk.py              ← Updated: cost_impact injection
│       ├── admin.py             ← Wipes & sweeps risk assessments
│       ├── chat.py
│       └── metrics.py           ← NEW: GET /api/v1/metrics/comparison
│
└── tests/
    ├── verify.py                ← API endpoint health checker
    └── validate_scenarios.py    ← UPDATED: 6-scenario + baseline comparison
```

---

## Setup & Run

### 1. Install dependencies

```powershell
cd steelsafe
pip install -r requirements.txt
```

### 2. Start the backend server

```powershell
uvicorn main:app --port 8000
```

On startup, if the DB is empty, the server will auto-generate the synthetic dataset and trigger the timeline sweep:

```
[Startup] Empty database detected — generating synthetic data...
[Generator] Dropping existing tables...
[Generator] Creating tables...
[Generator] Generating data...
[Generator] Inserting: 5 zones, 3 shifts, 4800 sensor readings...
[Generator] Running risk engine sweep...
[Engine] Sweeping 960 timestamps x 5 zones = 4800 evaluations...
[Engine] Storing 4800 risk assessments to DB...
[Generator] Risk sweep done.
```

### 3. Open Interactive Swagger Docs

Go to: **http://localhost:8000/docs**

---

## Compound Risk API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET`  | `/api/v1/risk/current` | Live risk evaluation across all 5 zones |
| `GET`  | `/api/v1/risk/history` | Stored timeline assessments (filterable by zone, level, start/end) |
| `GET`  | `/api/v1/risk/zone/{zone_id}` | Most recent risk detail for a zone (with full signal snapshot + cost_impact) |
| `GET`  | `/api/v1/risk/rules` | List of registered rules (IDs, weights, summaries) |
| `GET`  | `/api/v1/metrics/comparison` | **NEW** Compound vs. baseline comparison table (lead times, FP rates, near-miss check) |

### Sample cURL commands

```bash
# Get live risk scores
curl http://localhost:8000/api/v1/risk/current | python -m json.tool

# Query historical risk for Gas Collection Main (zone_gcm)
curl "http://localhost:8000/api/v1/risk/history?zone_id=zone_gcm&limit=10" | python -m json.tool

# Get latest risk detail + audit snapshot for zone_cob1
curl http://localhost:8000/api/v1/risk/zone/zone_cob1 | python -m json.tool

# List rule configuration
curl http://localhost:8000/api/v1/risk/rules | python -m json.tool
```

---

## How the Risk Rules Work

The engine uses **6 compound risk rules** configured in [rules_config.py](file:///C:/Users/DINESHMANI/Desktop/Pictures/Steel/steelsafe/risk_engine/rules_config.py):

| Rule | Name | Weight | Logic / Rationale |
|------|------|--------|-------------------|
| **R1** | Rising Gas Trend + Active Hot-Work Permit | 35 | CO or H2S is rising (slope >= 0.4 ppm/sample) and the gas level is above baseline mean+std AND a `hot_work` permit is active. Spark/flame risk near rising gas. |
| **R2** | Confined Space Entry + Elevated Gas | 30 | A `confined_space_entry` permit is active AND gas concentration is above action level (CO>=35 ppm or H2S>=5 ppm). High asphyxiation risk; self-rescue is difficult. |
| **R3** | Active Permit During Shift Changeover | 20 | Any permit is active AND current time is within ±15 minutes of a shift boundary. Supervision transfers create communication and handover gaps. |
| **R4** | High Gas + Worker Cluster | 25 | Gas concentration exceeds high threshold (CO>=100 ppm or H2S>=10 ppm) AND >=4 workers are in the zone. Mass-exposure risk. |
| **R5** | Pressure Drop + Active Permit | 20 | Pressure in `zone_gcm` drops >=2.5 kPa below its baseline mean AND any permit is active. Indicates a raw gas main leak endangering workers. |
| **R6** | Elevated Gas + Active Permit | 20 | Gas is above action level AND any permit is active. General exposure hazard during hands-on maintenance. |

If a zone is statistically anomalous (compound L2-norm z-score >= 3.0), the statistical layer flags an anomaly and adds a **+15 point bump** to the risk score.

---

## Incident Scenario Library (Phase 7A: 6 Scenarios)

The dataset contains 6 scripted incident patterns covering diverse failure modes:

| ID | Label | Zone | Key Pattern | Compound Engine | Baseline |
|----|-------|------|------------|----------------|----------|
| **scenario_1** | Gas Main Pressure Drop + Hot Work | Gas Collection Main | CO↑ + pressure↓ + hot_work permit | Flags 15.5m early | Fires at CO≥100 ppm |
| **scenario_2** | H2S Spike + Confined Space Entry + Shift Changeover | Battery 1 | H2S↑ + CSE permit + handover gap | Flags 8m early | Fires at H2S≥10 ppm |
| **scenario_3** | CO Build-up + Expired PTW + Worker Cluster | Charging Area | CO↑ + expired cold_work + 6 workers | Flags simultaneously | Fires at CO≥100 ppm |
| **scenario_4** *(NEW)* | Slow Gas Leak During Active Hot-Work Permit | Gas Collection Main | Slow CO ramp 22→85 ppm (never hits 100) + hot_work + pressure↓ | R1+R5 fire early | **Never fires — missed entirely** |
| **scenario_5** *(NEW)* | Equipment Overheat + Overdue Maintenance Activity | Battery 1 | Temp +100°C + cold_work permit at changeover | R3+R6+anomaly | **Never fires — no gas alarm** |
| **scenario_6** *(NEW, near-miss)* | CO Build-up Resolves Without Crossing Threshold | Quenching Tower | CO peaks ~32 ppm (below 35 ppm action level), then decays | ≤ Medium (discipline PASS) | **Never fires — correct** |

### Near-Miss Discipline Test (Scenario 6)
Scenario 6 tests whether the compound engine has good false-positive discipline. CO rises
to approximately 32 ppm — just below the 35 ppm action level — then naturally decays back
to baseline. A well-calibrated compound engine should **not** raise a High or Critical alert.
This validates that the engine won't cause the alarm fatigue that makes traditional safety
systems unreliable.

---

## Baseline Detector Methodology

The **naive single-sensor baseline** (`risk_engine/baseline.py`) represents the lowest
common denominator of traditional industrial gas detection:

- **CO alarm**: fires when CO ≥ 100 ppm (single reading)
- **H2S alarm**: fires when H2S ≥ 10 ppm (single reading)
- **Permit+gas alarm**: fires when a hot_work or CSE permit is active AND CO ≥ 50 ppm or H2S ≥ 8 ppm

No cross-signal correlation, no trend analysis, no operational context (shift boundaries,
worker density). This is what SteelSafe's compound engine replaces.

### Key differences vs. compound engine:
| Property | Baseline Detector | Compound Engine |
|----------|------------------|-----------------|
| Trend detection | ✗ None | ✓ R1 (rising slope) |
| Context (permits) | ✓ Partial (type only) | ✓ R1–R6 (type + zone + timing) |
| Shift changeover awareness | ✗ None | ✓ R3 |
| Worker density | ✗ None | ✓ R4 |
| Pressure drop | ✗ None | ✓ R5 |
| Statistical anomaly | ✗ None | ✓ Z-score bump |
| Near-miss discipline | — (silent) | ✓ Stays ≤ Medium |
| Scenarios 4 and 5 detection | ✗ Missed entirely | ✓ Detected |

---

## Cost/Impact Translation Layer

The `risk_engine/cost_impact.py` module maps risk states to business-language:

- **Critical** in Gas Collection Main → "3–7 days production downtime, ₹2–8 Crore exposure"
- **High** in Battery 1 → "2–6 hours containment window, ₹0.3–1.5 Crore exposure"
- Each entry includes: headline, downtime estimate, financial exposure, immediate actions, regulatory citations

> ⚠️ **Disclaimer**: All figures are **illustrative estimates based on industry benchmarks**,
> not VSP-specific historical data. Clearly labeled in both the API response and dashboard.

Access via:
```bash
curl http://localhost:8000/api/v1/risk/zone/zone_gcm | python -m json.tool
# Look for the "cost_impact" field in the response
```

---

## Scenario Validation & Prediction Lead Times

To test the predictive power of the compound engine, run the scenario validator:

```powershell
python tests/validate_scenarios.py
```

### Validator Results

```
========================================================================
  SUMMARY TABLE
========================================================================
  Scenario       Zone         First Flag    Peak    Compound Lead vs Sensor
  -------------- ------------ ----------  ------  -------------------------
  scenario_1     zone_gcm       15:35:49  100/100            +15.5 min early
  scenario_2     zone_cob1      18:14:49  90/100             +8.0 min early
  scenario_3     zone_ca        20:14:19  60/100             +0.0 min early

  False positive rate: 0.31% (14/4527 non-scenario evaluations)
========================================================================
```

- **Scenario 1 (Gas Main Leak during Hot Work)**: Flagged **15.5 minutes before** traditional single-sensor alarms would have fired.
- **Scenario 2 (H2S Spike during Standpipe Inspection)**: Flagged **8.0 minutes before** single-sensor alarms triggered.
- **Scenario 3 (Larry Car Track repair in CO build-up)**: Correctly flagged as High risk (60/100) simultaneously with the alarm threshold, avoiding a complete miss.
- **False Alarm Rate**: Only **0.31%** (14 out of 4,527 non-anomalous samples) flagged as High risk during safe/normal operation.

---

## Run Verification Script

To verify all endpoints are working correctly (returns 12/12 passing checks):

```powershell
python tests/verify.py
```

---

## Running Frontend + Backend Together (Phase 4 Dashboard)

To launch the live dashboard prototype:

### 1. Start the Backend API (Port 8000)
```powershell
cd steelsafe
uvicorn main:app --port 8000
```

### 2. Start the Frontend Dashboard (Port 3000)
In a separate terminal:
```powershell
cd steelsafe-frontend
npm install
npm run dev
```

Open **http://localhost:3000** in your browser.

---

## Phase 4: Incident Pattern RAG Agent

Phase 4 integrates an **Incident Pattern RAG Agent** chat interface directly into the safety officer's command panel. It enables querying plant safety and operational compliance grounded in real-time sensor metrics and regulatory documents.

### RAG Pipeline Mechanics
1. **Safety Document Corpus**: Located in `/safety_documents`, featuring:
   - `oisd_std_137.md`: Oil Industry Safety Directorate standard on work permit systems, gas clearances, and shift handover supervisors.
   - `factories_act_1948.md`: Section 36 & 41-F on confined spaces safety and permissible occupational exposure limits (OEL).
   - `gas_safety_sop.md`: Plant SOP outlining CO/H2S action thresholds and H2S olfactory (odor) fatigue warnings.
2. **Lightweight TF-IDF Cosine Similarity Retriever**: Built in pure Python and NumPy. Chunks the corpus by markdown sections, tokenizes queries, filters stop words, and matches them using cosine similarity.
3. **Dual-Mode Answer Generation**:
   - **Gemini API Mode**: If the environment variable `GEMINI_API_KEY` is present, it formats a prompt containing the live zone telemetry snapshot + retrieved regulatory paragraphs, making a direct REST call to Google's Gemini 1.5 Flash API.
   - **Local Expert System Mode**: If no API key is found, it falls back to a highly robust keyword slot-filler template engine. It translates GCM critical events, confined space rules, and odor fatigue into actionable compliance advice with correct regulatory citations.

---

## Phase 5: Emergency Response Orchestrator

Phase 5 completes the platform integration by implementing a unified **Emergency Response Orchestrator** to handle incident escalation and response workflows.

### Orchestrator Core Capabilities
1. **Critical Alert Alarm**: Automatically triggers when any zone risk score crosses the Critical threshold (>=70). Activates site evacuation sirens and visual warning alerts.
2. **Proximity Evacuation Zoning**: Computes safety clearance zones based on physical plant adjacency:
   - **Gas Collection Main (`zone_gcm`)** $\rightarrow$ Evacuate `Coke Oven Battery 1` and `Quenching Tower`.
   - **Coke Oven Battery 1 (`zone_cob1`)** $\rightarrow$ Evacuate `Gas Collection Main` and `Charging Platform`.
   - **Charging Platform (`zone_ca`)** $\rightarrow$ Evacuate `Coke Oven Battery 1` and `Control Room`.
   - **Quenching Tower (`zone_qt`)** $\rightarrow$ Evacuate `Gas Collection Main`.
   - **Control Room (`zone_cr`)** $\rightarrow$ Evacuate `Charging Platform`.
3. **Auto-Generated Draft Incident Report**: Creates a structured report (`INC-2026-XXXX`) logging the trigger time, sensor readings (CO, H2S, Pressure, Temp, active workers), regulatory violations from the RAG agent, and dispatch action directives.
4. **"First 10 Minutes" Response Timeline**: Displays a step-by-step visual log of immediate actions taken (hazard buildup, alarm trigger, evacuation dispatch, draft report compilation).

---

## Key Performance Summary (Hackathon Pitch Deck)

| Metric | Target / Traditional Alarm | SteelSafe Compound AI | Performance Advantage |
|--------|----------------------------|-----------------------|-----------------------|
| **Scenario 1 Lead Time** | 15:51:19 (Single Sensor CO) | 15:35:49 (Compound Risk) | **+15.5 Minutes Early Warning** |
| **Scenario 2 Lead Time** | 18:22:49 (Single Sensor H2S) | 18:14:49 (Compound Risk) | **+8.0 Minutes Early Warning** |
| **Scenario 3 Protection**| Missed / Expired permit risk | 20:14:19 (Compound Risk) | **Exposure Prevented** |
| **False Alarm Rate** | High / Induces alarm fatigue | **0.31%** (14/4527 safe periods) | **Precision Safety Filtering** |
| **Compliance Index** | Manual file checks | **3 Standards Indexed** | **Continuous Automated Audit** |

---

## Phase 6: Counterfactual Engine & 3D Interactive Model

Phase 6 introduces advanced predictive recommendation capabilities and high-fidelity 3D interaction.

### 1. Counterfactual Minimum Intervention Engine
- **Algorithmic Simulation**: Re-evaluates compound safety rules against deepcopied states to identify the single smallest change (permits, maintenance, worker count, or gas isolation) that clears Critical warnings.
- **REST API Route**: `/api/v1/risk/intervention/{zone_id}`
- **Recommendation Display**: Dynamically shown under the selected zone's telemetry panel as a "Recommended Intervention" card, charting current risk vs. projected safety levels.

### 2. 3D WebGL Plant Heatmap
- **Component Stack**: React 19 + `@react-three/fiber` + `@react-three/drei` + `three`.
- **Layout & Visuals**: Rendered as a separate view alongside the 2D layout. Stylized 3D blocks represent the coke oven battery, gas main, quenching tower, charging platform, and control room.
- **Pulsing Alerts**: Elevated and Critical zones trigger scale adjustments and emissive flashing glow loops in real-time.
- **OrbitControls Camera**: Enable drag rotation and scroll zoom. Click meshes to open telemetry details.

---

## Key Demo Walks on the Dashboard

1. **Widescreen Safety Control Deck**:
   - The React app layout dynamically adapts to a 4-column widescreen command console: Heatmap (2 cols), Telemetry panel (1 col), and Safety RAG Chat (1 col).
   - Pitch metrics are pinned at the top for immediate visibility.
2. **2D/3D Mode Switching**:
   - Click the **3D WebGL Model** button above the floor plan. Drag to orbit the battery, and scroll to zoom.
   - Click the **2D Floor Plan** button to return to the layout schematic.
3. **Instant Incident Jump & Counterfactual Verification**:
   - Click **Incident 1: Gas Main Leak (02:00)** in the playback bar. The virtual clock immediately seeks to `01:59:00`.
   - Play at **60x** speed. Within 5 seconds, watch the **Gas Collection Main** turn Red/Critical.
   - Switch to the **3D WebGL Model** view to see the horizontal cylinder flash red.
   - Observe the **Recommended Intervention** card slide open: *"Suspend active permit-to-work (PTW) operations in this zone — projected risk drops from 100 to 15"*.
   - Click the suggested RAG query pill: **"Why is Gas Collection Main critical?"** to query the regulatory citations (OISD, Factories Act).
4. **Instant Reset**: Click **Reset Demo (API)** to clear the database and start the simulation fresh on cue.

---

## Knowledge Graph Structure (Phase 7B)

The `risk_engine/knowledge_graph.py` module builds a **NetworkX directed graph** that encodes
historical relationships between zones, equipment, permits, hazards, and scripted incidents.

### Node Types

| Type | Examples |
|------|----------|
| `ZONE` | zone_gcm, zone_cob1, zone_ca, zone_qt, zone_cr |
| `EQUIPMENT` | gas_main_header, coke_oven_battery, larry_car, flange_joint |
| `PERMIT_TYPE` | hot_work, confined_space_entry, cold_work |
| `HAZARD` | CO_buildup, H2S_spike, pressure_drop, temperature_overheat, near_miss |
| `SCENARIO` | scenario_1 … scenario_6 (Phase 7A incident library) |

### Edge Types

| Source → Target | Edge Type | Meaning |
|----------------|-----------|--------|
| ZONE → EQUIPMENT | `located_in` | This equipment physically exists in this zone |
| EQUIPMENT → PERMIT_TYPE | `requires_permit` | Working on this equipment requires this permit |
| SCENARIO → ZONE | `occurred_in` | This incident happened in this zone |
| SCENARIO → PERMIT_TYPE | `involved_permit` | This permit type was active during the incident |
| SCENARIO → HAZARD | `produced_hazard` | This hazard type was observed during the incident |

### Auto-Derived from SCENARIOS Registry

The graph is **not hardcoded** — it is automatically derived from the `SCENARIOS` list in
`data_generator/scenarios.py` on import. Hazard types are inferred from sensor spike profiles
(CO > 35 ppm → CO_buildup, H2S > 5 ppm → H2S_spike, pressure_trend < -0.015 → pressure_drop, etc.).
Adding a 7th scenario automatically populates the graph.

### Query Function

```python
from risk_engine.knowledge_graph import query_graph, format_graph_explanation

# At evaluation time, given current conditions:
matches = query_graph(
    zone_id      = "zone_gcm",
    permit_types = ["hot_work"],
    hazards      = ["CO_buildup", "pressure_drop"]
)
# Returns List[GraphMatch] sorted by match_strength (1–3 dimensions matched)
# Example output:
# match_strength=3: scenario_1 (Gas Main Pressure Drop + Hot Work) - matched: zone, permit, hazard
# match_strength=2: scenario_4 (Slow Gas Leak During Active Hot-Work Permit) - matched: zone, permit
```

Graph matches appear in the risk explanation as:
> *"[GRAPH] Historical pattern match: similar conditions preceded 2 of 6 scripted incidents —
> Gas Main Pressure Drop + Hot Work (matched: zone, permit, hazard); Slow Gas Leak During
> Active Hot-Work Permit (matched: zone, permit)."*

They also appear as a visual card in the `DetailPanel` under **AI Context — Phase 7B Reasoning**.

---

## Shift Fatigue Factor (Phase 7B)

The `risk_engine/scorer.py` computes hours-into-shift using the current `ShiftSchedule.start_time`
(already assembled in `build_context()` — **no new DB queries needed**).

### Logic

```python
hours_into_shift = (eval_timestamp - shift.start_time).total_seconds() / 3600
```

The fatigue amplifier fires **only when**:
1. `base_score > 0` (at least one compound rule has already fired)
2. `workers_in_zone >= 1`
3. `hours_into_shift >= FATIGUE_HOURS_THRESHOLD` (default: 7.0h)

### Score Bump Tiers

| Shift Depth | Bump | Explanation |
|-------------|------|-------------|
| 7.0 – 8.9h | +10 pts | Mild fatigue (NIOSH-defined degradation onset) |
| 9.0h+ | +20 pts | High fatigue (HSE-cited elevated error rate) |

> **Design principle:** Fatigue is a risk *amplifier*, not a standalone alarm.
> It will never trigger an alert in an otherwise safe zone.
> This preserves the 0.36% false-positive rate established in Phase 7A.

### Explanation Output

When the fatigue amplifier fires, the following sentence is appended to the risk explanation:

> *"[FATIGUE] 4 worker(s) in Gas Collection Main are 7.5h into their shift (mild fatigue,
> shift threshold: 7h). Human error probability and evacuation response time increase
> significantly in the final hours of a long shift — risk weighting increased by 10 points."*

### Thresholds (tunable in `thresholds.py`)

```python
FATIGUE_HOURS_THRESHOLD  = 7.0   # hours into shift → mild fatigue flag
FATIGUE_HIGH_HOURS       = 9.0   # hours into shift → high fatigue flag  
FATIGUE_SCORE_BUMP       = 10    # score points for 7–9h shift depth
FATIGUE_HIGH_SCORE_BUMP  = 20    # score points for 9h+ shift depth
FATIGUE_MIN_WORKERS      = 1     # min workers in zone to apply fatigue
```

---

## Live CCTV Camera & Object Detection (Phase 7C)

Phase 7C integrates live video streams and computer vision into the safety dashboard.

### Core Stack
- **Webcam Interface**: Built using browser `navigator.mediaDevices.getUserMedia` APIs. Works on standard laptops and mobile web browsers (when connected to the same local network).
- **Client-Side Model**: Loaded dynamically via CDN using `@tensorflow/tfjs` and `@tensorflow-models/coco-ssd`. This ensures zero npm dependency conflicts, WebGL hardware acceleration, and lag-free client-side prediction.
- **Taxonomy Bounding Box**: Filters for `'person'` coco classes and renders bounding boxes around workers in real-time.

### PPE Simulation Strategy
Because off-the-shelf YOLO/COCO models do not contain a "hard hat" class in their training taxonomy, a **PPE Hard Hat Simulation Toggle** is provided in the camera feed panel.
- **Person detected + PPE compliant = OK**
- **Person detected + Simulate PPE Violation = Violating**

### Risk Engine Integration (Rule R7)
When a worker is detected without a hard hat in a zone, the frontend sends this state to the backend (`POST /api/v1/risk/camera/state`). The backend re-runs the risk scorer including the new rule:
- **R7 — CCTV PPE Violation in Elevated Gas Zone** (Weight: 30 pts): Fires when a worker is detected without proper PPE in a zone where CO or H2S is elevated above action levels.

### Setup & Camera Permissions
1. Select the **Charging Platform (zone_ca)** in the dashboard.
2. Click **Enable Live CCTV Feed** inside the camera panel.
3. Grant camera permission to the browser when prompted.
4. If accessing from a mobile browser over a local network, ensure the site is served over HTTPS or localhost, as browsers restrict camera access (`getUserMedia`) on unencrypted HTTP connections.
5. If camera permission is denied or unavailable, the system falls back gracefully to standard telemetry monitoring without throwing errors.

---

## Integrated Steel Plant 3D Model (Phase 7C Extension)

The 3D WebGL visualizer is upgraded to model a full-scale open-plant integrated steel manufacturing facility.

### 🏭 1. Architectural & Exterior Features
- **Blast-Furnace Silhouette**: Models a tiered blast-furnace tower structure, thin cylindrical chimneys/stacks, and inclined skip conveyor structures.
- **Elevated pipe gantries**: Multiple horizontal pipe gantries running along the yard and back boundaries.
- **Open-Sided Room Interiors**: Employs L-shaped corner walls (retaining 2 walls for structure while removing the other 2) to prevent any camera angles from being occluded, allowing full walkthrough visibility.

### 🎨 2. Distinct Zone Base Colors
Each zone has a distinct base color when safe:
- **Control Room Office**: Blue (`#2563eb`)
- **Charging Platform**: Emerald (`#059669`)
- **Coke Oven Battery**: Indigo (`#4f46e5`)
- **Quenching Tower**: Teal (`#0d9488`)
- **Gas Collection Main**: Violet (`#7c3aed`)

*Note: If risk escalates in a zone, the base color is overridden by the safety alert colors (Yellow = Medium, Orange = High, Red = Critical).*

### 🕹️ 3. Free Camera Controls
- **Drag to Orbit**: Left-click and drag to rotate the camera around the plant 360-degrees.
- **Right-Drag to Pan**: Right-click and drag to translate/pan the camera.
- **Scroll to Zoom**: Use the mouse scroll wheel to zoom in and out.
- **Reset View**: Smoothly lerps the camera back to the default establishing perspective view.
- **Top View**: Snaps the camera straight down to provide an orthogonal floor plan view.
- **Hide Labels / Show Labels**: Toggles the floating room name tag overlays on and off.

---

## Quality & Compliance Audit Agent (Phase 8A)

The **Quality & Compliance Audit Agent** continuously scans plant records (maintenance logs, work permits, worker location pings) against regulatory standards ingested into the RAG corpus, flagging deviations and auto-generating corrective actions.

### 📋 1. Core Compliance Audit Rules
- **Gas Detector Calibration (OISD Standard 137 Section 5)**: Requires all fixed and portable gas monitoring detectors (CO, H2S) to undergo certified calibration checks every 30 days.
- **Weekly Safety & PPE Audits (DGMS Safety Circular 24)**: Mandates weekly safety inspections in high-hazard zones (Charging Platform and Coke Oven Battery) every 7 days to verify worker compliance with protective gear.
- **Standby Observer Presence (Factories Act 1948 Section 36)**: Requires any active Confined Space Entry (CSE) permit to have at least one standby observer stationed outside the entry point. Checked by verifying that multiple worker badges/pings are present in the zone.
- **Periodic Medical Examination (Factories Act 1948 Section 41-C)**: Verifies that all technicians actively logging hours in hazardous process zones have passed a statutory occupational health checkup within the last 12 months (365 days).

### 🔍 2. Grounded RAG Citation Retrieval
The compliance checking engine calls the `generate_grounded_answer()` TF-IDF RAG module programmatically:
1. It queries the RAG system using specific regulatory query strings (e.g., `"gas detector calibration frequency requirements"`).
2. It extracts the matched regulatory snippet and the document citation (e.g., `"OISD Standard 137 Section 5"`) from the RAG citations payload.
3. It stores the citation and exact rule text inside the database along with the deviation log, ensuring audit trails are fully grounded in official documentation.

### 🛠️ 3. Corrective Action & State Tracking
- **Automated Corrective Actions**: The agent auto-generates localized corrective instructions (e.g., scheduling technician recalibration, shifting worker to low-risk office duties) directly within the dashboard.
- **Resolution Tracking**: Users can mark active safety gaps as **Resolved** in the UI, shifting them to a historic resolution audit log for accountability.
- **Site Compliance Rating**: A live compliance score is calculated dynamically based on unresolved issues:
  $$\text{Compliance Rating} = 100 - (15 \times \text{Active High Priorities} + 5 \times \text{Active Medium Priorities})$$

---

## Multi-Plant Scalability & Multi-Tenant Support (Phase 8B)

Phase 8B refactors the system into a configuration-driven multi-tenant architecture supporting $N$ plants. To demonstrate this, we integrated a second facility layout: the **Rolling Mill Complex**.

### 🏭 1. Multi-Plant Configurations

- **Plant A: Coke Oven Battery Unit (Vizag)**
  - Name: "Coke Oven Battery Unit 1 - Vizag"
  - Short Code: "COK"
  - Zones: Coke Oven Battery, Gas Collection Main, Charging Platform, Quenching Tower, Control Room.
- **Plant B: Rolling Mill Complex (Unit 2)**
  - Name: "Rolling Mill Complex - Unit 2"
  - Short Code: "RML"
  - Zones: Reheating Furnace (`zone_rhf`), Rolling Stand (`zone_rs`), Cooling Bed (`zone_cb`), Finishing Line (`zone_fl`), Mill Control Room (`zone_cr2`).
  - Scenarios: Reheating furnace thermal overheat, Rolling Stand roll jams, cooling bed thermocouple drift, and finishing shear permit warnings.

### 🛡️ 2. Architectural Highlights & Tenant Isolation

- **Database-Level Isolation**: All database tables (`zones`, `sensor_readings`, `permits`, `maintenance_logs`, `worker_locations`, `risk_assessments`, `compliance_deviations`) store a `plant_id` column. Compound primary keys and database indices ensure that query execution is strictly isolated per plant, preventing cross-tenant data leaks.
- **Configuration-Driven Generation**: Sub-generators (`sensors.py`, `permits.py`, etc.) accept a `plant_config` dict and generate data sequentially for all registered facilities.
- **Unified Engine**: Scorer, rules, anomaly detection, comparison analytics, and RAG compliance audit checks are parameterised, letting the same underlying engine evaluate any plant configuration without code duplication.

### 💻 3. Cross-Plant Dashboard Controls

- **Cross-Plant Overview Tab**: Lists all active plants side-by-side. Displays the highest current safety risk level, number of active alerts, and a compliance gauge bar. Clicking focus transfers the console context.
- **Plant Switcher**: Dropdown in the header allows safety supervisors to toggle focus between different plants at any time.
- **Dynamic Renderers**: SVG floor plan layouts and Three.js 3D WebGL mesh trees render conditionally, adapting the canvas (kilns, rollers, and cooling beds) to match the physical properties of the active plant.
