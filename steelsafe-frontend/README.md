# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

---

## 🌓 Theme System (Light & Dark Theme)

SteelSafe Intelligence features a fully-dynamic light and dark theme system:
- **State Toggle**: A toggle button in the console header (`App.tsx`) lets users transition between light and dark modes instantly.
- **Persistence**: Choice is saved in `localStorage` across page reloads. If the app is launched in a sandboxed frame (like Claude Artifacts), it safely catches security exceptions and defaults to standard fallback mechanisms.
- **System Preference**: Defaults to the user's OS preference (`prefers-color-scheme`) if no local storage choice exists.
- **CSS Variables**: Refactored styling variables are declared in `src/index.css` under `:root` and `.dark` blocks.

### How to Extend

If you add new UI components, **do not hardcode hex/RGB values**. Always use semantic theme classes mapped in `tailwind.config.js`:
- **Backgrounds**: Use `bg-theme-bg`, `bg-theme-bg-alt`, or `bg-theme-card`
- **Text**: Use `text-theme-text` (primary), `text-theme-text-secondary`, or `text-theme-text-muted`
- **Borders**: Use `border-theme-border` or `border-theme-border-muted`
- **Accents**: Use `text-theme-accent` or `bg-theme-accent`
- **Risks & Warnings**: Use `bg-theme-risk-low`, `bg-theme-risk-med`, `bg-theme-risk-high`, or `bg-theme-risk-crit` (and their respective `-bg`, `-border`, `-text` variants)

---

## ⛑ PPE Detection System (Phase 7C)

SteelSafe Intelligence integrates real-time worker safety and PPE monitoring via the webcam/mobile camera feed on the **Charging Platform** (Zone CA).

### Model Capabilities & Caveats
* **Worker Detection**: Uses the pre-trained **COCO-SSD** model loaded dynamically via TensorFlow.js in the browser. It reliably detects worker presence (`person` class) with real-time bounding box annotations on the video stream.
* **Multi-Person Tracking & Limits**:
  - The model checks all employees visible in the frame simultaneously, mapping distinct indices (Worker #1, Worker #2, etc.) sorted left-to-right to ensure spatial stability.
  - **Practical Capacity**: Standard webcams in close/medium range can track **5 to 8 people** simultaneously. Beyond this, crowd density and overlapping occlusions will reduce detection confidence.
* **PPE Verification & Simulation**: Generic pre-trained COCO-SSD has **no native class recognition for PPE items** (e.g. hard hats, safety vests, or safety masks). In this demonstration, mixed compliance is simulated:
  - If **PPE Simulation** is toggled to "Non-Compliant", the first worker remains compliant (green box) while all subsequent workers are marked as violating safety gear (red boxes, `Missing: Hard Hat`).
  - Separate structured violations are fired and logged to the Main Office for each individual non-compliant worker.
* **High-Visibility Labeling**:
  - **Compliant**: Rendered in a solid green box (`#22c55e`) with a `✓ Worker #N: Compliant (Confidence %)` banner.
  - **Non-Compliant**: Rendered in a solid red box (`#ef4444`) with a `✗ Worker #N: Missing: Hard Hat (Confidence %)` banner.
* **Temporal Smoothing (Stability)**:
  - To prevent rapid red/green flickering due to frame-by-frame model classification noise, we buffer worker compliance states. A state transition only commits and registers a new violation if it persists for **8 consecutive frames** (approx. 1 second of active detection).
* **Active Targets List**:
  - Displays a live scrolling list of currently-visible workers next to the feed, updating their compliance status and model confidence scores in real time without page refreshes.
* **Production Path**: A production deployment would replace/augment COCO-SSD with a custom-trained object-detection model (such as a fine-tuned **YOLOv8** or a custom **MobileNet SSD**) trained specifically on labeled industrial PPE datasets (e.g., *Hard Hat Workers* or *Construction Site Safety* datasets on Roboflow).

### Camera Hardware Controls
* **On/Off Toggle**: The CCTV console features explicit "Turn Camera On" and "Turn Camera Off" controls.
* **Track Releasing**: Turning the camera OFF calls `.stop()` on every active `MediaStreamTrack` associated with the camera, successfully turning off the camera indicator light and releasing hardware resources, rather than just visually hiding the video container.

### Production Privacy Considerations
When deploying video analytics in a real steel manufacturing facility, privacy and security must be treated with high priority:
1. **Edge-only Processing**: Compute bounding boxes and verify compliance directly on local edge hardware or gateway devices inside the zone networks. Do not stream raw video feeds over public networks or store long-term raw video logs.
2. **Face/Identifier Redaction**: Apply real-time face blurring or masking at the edge to ensure individual worker identities are protected and cannot be reverse-engineered from violation logs.
3. **Structured Metadata Logging**: Log only structured, non-identifiable compliance metrics (e.g., timestamp, zone ID, confidence percentage, missing equipment list) rather than image thumbnails, to remain compliant with local labor regulations and employee privacy agreements.

---

## 📊 Phase 13A: Command-Center Dashboard Shell

Phase 13A introduces the command-center layout shell featuring a dark-themed industrial safety dashboard with left sidebar navigation, top header bar, and a live 6-stat card grid.

### 📈 Metric Definitions (6 Stat Cards)

1. **Total Workers**: Headcount inside monitored plant zones aggregated over the last 5 minutes.
2. **Safe Workers**: Count and percentage of compliant workers, calculated as total workers minus those detected inside active PPE violation zones.
3. **PPE Violations**: Shift-wide total violations logged today, alongside the count of active/unacknowledged violations.
4. **Active Compliance Gaps**: Count of active regulatory compliance deviations (replacing Restricted Area Alerts).
5. **Gas/Thermal Alerts**: Active alerts flagged due to exceeding threshold levels: CO $\ge 35$ ppm, H2S $\ge 5$ ppm, or temperature ceilings ($\ge \text{baseline mean} + 50^\circ\text{C}$).
6. **Active Critical Zones**: Count of plant zones currently flagged as `critical` or `high` risk by the risk engine.

### 🎛 Overall Safety Score Formula

The **Overall Safety Score** ($S_{\text{overall}}$) represents the synthesized plant-wide safety level on a scale of 0-100:

\[
S_{\text{overall}} = \left( 0.4 \cdot R_{\text{risk}} + 0.3 \cdot R_{\text{ppe}} + 0.3 \cdot R_{\text{audit}} \right) \times 100
\]

Where:
* **$R_{\text{risk}}$ (Risk Level Index)**:
  \[
  R_{\text{risk}} = 1.0 - \frac{\text{Critical/High Risk Zones}}{\text{Total Monitored Zones}}
  \]
* **$R_{\text{ppe}}$ (PPE Compliance Index)**:
  \[
  R_{\text{ppe}} = \begin{cases}
  1.0 & \text{if Total Workers} = 0 \\
  \frac{\text{Safe Workers}}{\text{Total Workers}} & \text{otherwise}
  \end{cases}
  \]
* **$R_{\text{audit}}$ (Compliance Audit Index)**:
  Derived from active regulatory deviations:
  \[
# React + TypeScript + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend enabling type-aware lint rules by installing `oxlint-tsgolint` and editing `.oxlintrc.json`:

```json
{
  "$schema": "./node_modules/oxlint/configuration_schema.json",
  "plugins": ["react", "typescript", "oxc"],
  "options": {
    "typeAware": true
  },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/only-export-components": ["warn", { "allowConstantExport": true }]
  }
}
```

See the [Oxlint rules documentation](https://oxc.rs/docs/guide/usage/linter/rules) for the full list of rules and categories.

---

## 🌓 Theme System (Light & Dark Theme)

SteelSafe Intelligence features a fully-dynamic light and dark theme system:
- **State Toggle**: A toggle button in the console header (`App.tsx`) lets users transition between light and dark modes instantly.
- **Persistence**: Choice is saved in `localStorage` across page reloads. If the app is launched in a sandboxed frame (like Claude Artifacts), it safely catches security exceptions and defaults to standard fallback mechanisms.
- **System Preference**: Defaults to the user's OS preference (`prefers-color-scheme`) if no local storage choice exists.
- **CSS Variables**: Refactored styling variables are declared in `src/index.css` under `:root` and `.dark` blocks.

### How to Extend

If you add new UI components, **do not hardcode hex/RGB values**. Always use semantic theme classes mapped in `tailwind.config.js`:
- **Backgrounds**: Use `bg-theme-bg`, `bg-theme-bg-alt`, or `bg-theme-card`
- **Text**: Use `text-theme-text` (primary), `text-theme-text-secondary`, or `text-theme-text-muted`
- **Borders**: Use `border-theme-border` or `border-theme-border-muted`
- **Accents**: Use `text-theme-accent` or `bg-theme-accent`
- **Risks & Warnings**: Use `bg-theme-risk-low`, `bg-theme-risk-med`, `bg-theme-risk-high`, or `bg-theme-risk-crit` (and their respective `-bg`, `-border`, `-text` variants)

---

## ⛑ PPE Detection System (Phase 7C)

SteelSafe Intelligence integrates real-time worker safety and PPE monitoring via the webcam/mobile camera feed on the **Charging Platform** (Zone CA).

### Model Capabilities & Caveats
* **Worker Detection**: Uses the pre-trained **COCO-SSD** model loaded dynamically via TensorFlow.js in the browser. It reliably detects worker presence (`person` class) with real-time bounding box annotations on the video stream.
* **Multi-Person Tracking & Limits**:
  - The model checks all employees visible in the frame simultaneously, mapping distinct indices (Worker #1, Worker #2, etc.) sorted left-to-right to ensure spatial stability.
  - **Practical Capacity**: Standard webcams in close/medium range can track **5 to 8 people** simultaneously. Beyond this, crowd density and overlapping occlusions will reduce detection confidence.
* **PPE Verification & Simulation**: Generic pre-trained COCO-SSD has **no native class recognition for PPE items** (e.g. hard hats, safety vests, or safety masks). In this demonstration, mixed compliance is simulated:
  - If **PPE Simulation** is toggled to "Non-Compliant", the first worker remains compliant (green box) while all subsequent workers are marked as violating safety gear (red boxes, `Missing: Hard Hat`).
  - Separate structured violations are fired and logged to the Main Office for each individual non-compliant worker.
* **High-Visibility Labeling**:
  - **Compliant**: Rendered in a solid green box (`#22c55e`) with a `✓ Worker #N: Compliant (Confidence %)` banner.
  - **Non-Compliant**: Rendered in a solid red box (`#ef4444`) with a `✗ Worker #N: Missing: Hard Hat (Confidence %)` banner.
* **Temporal Smoothing (Stability)**:
  - To prevent rapid red/green flickering due to frame-by-frame model classification noise, we buffer worker compliance states. A state transition only commits and registers a new violation if it persists for **8 consecutive frames** (approx. 1 second of active detection).
* **Active Targets List**:
  - Displays a live scrolling list of currently-visible workers next to the feed, updating their compliance status and model confidence scores in real time without page refreshes.
* **Production Path**: A production deployment would replace/augment COCO-SSD with a custom-trained object-detection model (such as a fine-tuned **YOLOv8** or a custom **MobileNet SSD**) trained specifically on labeled industrial PPE datasets (e.g., *Hard Hat Workers* or *Construction Site Safety* datasets on Roboflow).

### Camera Hardware Controls
* **On/Off Toggle**: The CCTV console features explicit "Turn Camera On" and "Turn Camera Off" controls.
* **Track Releasing**: Turning the camera OFF calls `.stop()` on every active `MediaStreamTrack` associated with the camera, successfully turning off the camera indicator light and releasing hardware resources, rather than just visually hiding the video container.

### Production Privacy Considerations
When deploying video analytics in a real steel manufacturing facility, privacy and security must be treated with high priority:
1. **Edge-only Processing**: Compute bounding boxes and verify compliance directly on local edge hardware or gateway devices inside the zone networks. Do not stream raw video feeds over public networks or store long-term raw video logs.
2. **Face/Identifier Redaction**: Apply real-time face blurring or masking at the edge to ensure individual worker identities are protected and cannot be reverse-engineered from violation logs.
3. **Structured Metadata Logging**: Log only structured, non-identifiable compliance metrics (e.g., timestamp, zone ID, confidence percentage, missing equipment list) rather than image thumbnails, to remain compliant with local labor regulations and employee privacy agreements.

---

## 📊 Phase 13A: Command-Center Dashboard Shell

Phase 13A introduces the command-center layout shell featuring a dark-themed industrial safety dashboard with left sidebar navigation, top header bar, and a live 6-stat card grid.

### 📈 Metric Definitions (6 Stat Cards)

1. **Total Workers**: Headcount inside monitored plant zones aggregated over the last 5 minutes.
2. **Safe Workers**: Count and percentage of compliant workers, calculated as total workers minus those detected inside active PPE violation zones.
3. **PPE Violations**: Shift-wide total violations logged today, alongside the count of active/unacknowledged violations.
4. **Active Compliance Gaps**: Count of active regulatory compliance deviations (replacing Restricted Area Alerts).
5. **Gas/Thermal Alerts**: Active alerts flagged due to exceeding threshold levels: CO $\ge 35$ ppm, H2S $\ge 5$ ppm, or temperature ceilings ($\ge \text{baseline mean} + 50^\circ\text{C}$).
6. **Active Critical Zones**: Count of plant zones currently flagged as `critical` or `high` risk by the risk engine.

### 🎛 Overall Safety Score Formula

The **Overall Safety Score** ($S_{\text{overall}}$) represents the synthesized plant-wide safety level on a scale of 0-100:

\[
S_{\text{overall}} = \left( 0.4 \cdot R_{\text{risk}} + 0.3 \cdot R_{\text{ppe}} + 0.3 \cdot R_{\text{audit}} \right) \times 100
\]

Where:
* **$R_{\text{risk}}$ (Risk Level Index)**:
  \[
  R_{\text{risk}} = 1.0 - \frac{\text{Critical/High Risk Zones}}{\text{Total Monitored Zones}}
  \]
* **$R_{\text{ppe}}$ (PPE Compliance Index)**:
  \[
  R_{\text{ppe}} = \begin{cases}
  1.0 & \text{if Total Workers} = 0 \\
  \frac{\text{Safe Workers}}{\text{Total Workers}} & \text{otherwise}
  \end{cases}
  \]
* **$R_{\text{audit}}$ (Compliance Audit Index)**:
  Derived from active regulatory deviations:
  \[
  \text{Score}_{\text{compliance}} = \max\left(0, 100 - \left( 15 \cdot \text{High Severity Devs} + 5 \cdot \text{Medium Severity Devs} \right)\right)
  \]
  \[
  R_{\text{audit}} = \frac{\text{Score}_{\text{compliance}}}{100.0}
  \]

The score is rounded to the nearest integer and mapped to qualitative thresholds:
* **$S_{\text{overall}} \ge 90$**: **Excellent** (Emerald)
* **$80 \le S_{\text{overall}} < 90$**: **Good** (Amber)
* **$S_{\text{overall}} < 80$**: **Needs Attention** (Red, pulsing)

---

## 🎨 Complete Visual Replication & Data Mappings

The safety command-center console has been rebuilt to match the definitive reference mockup layout, iconography, colors, and dashboard cards exactly:

### Real vs. Simulated Data Mappings
All visual components are connected to real backend telemetry. Mappings are established as follows:

| Mockup Element | Real Backend Data Source | Status / Decision |
| :--- | :--- | :--- |
| **Total Workers** | Sum of worker counts in active zones from `/risk/history` | **Real** |
| **Safe Workers** | Total workers minus those in zones with active PPE violations | **Real** |
| **PPE Violations** | Active unacknowledged events from `/risk/ppe/violations` | **Real** |
| **Restricted Area Alerts** | Unresolved deviations from `/risk/compliance/deviations` | **Real** (derived) |
| **Fire / Smoke Alerts** | Zones with temperature $\ge$ baseline $+ 50^\circ\text{C}$ or CO $\ge 35$ ppm or H2S $\ge 5$ ppm | **Real** (thermal/gas warnings) |
| **Fall Incidents** | Active zones currently in `high` or `critical` risk bands | **Real** (critical zones warning) |
| **CCTV Feeds (1-6)** | Zones 1-5 map to current plant zones; CAM 06 falls back to a safe loading bay | **Real** (dynamic bounding box & status pills) |
| **Charts & Feeds** | Connected to above telemetry (updates in real-time on violation simulation) | **Real** |

### Phase 14: Live Monitoring System-Health Metrics
The bottom row diagnostic widgets on the Live Monitoring page are configured as follows:

| diagnostic Widget | Data Mapping Source | Type | Description |
| :--- | :--- | :--- | :--- |
| **Factory Map Heatmap** | Connected directly to `currentRisks` zone risk levels | **Real** | Displays real-time green/yellow/red pulsing circles on the floorplan overlay |
| **Camera Health Gauge** | Wired to active connection count (5/6 or 6/6) | **Real / Semi-Real** | Changes from `92%` to `100%` when the CAM 02 webcam is turned on |
| **GPU Usage** | Simulates local AI workload fluctuations (60% to 70%) | **Simulated** | Provides a visual bar graph matching the mockup interface |
| **Network Latency** | Fluctuating probe simulation (15 to 21 ms) | **Simulated** | Renders a live-updating sparkline graph |
| **AI Processing Speed** | Fluctuating model FPS simulation (29 to 34 FPS) | **Simulated / Real** | Adapts dynamically to actual coco-ssd performance when webcam is live |

### Phase 16: PPE Compliance & Detection Limitations
The circular gauges and table metrics on the PPE Compliance page are classified as:

| Metric / Card | Category | Detection Capability |
| :--- | :--- | :--- |
| **Helmet Compliance** | Real / Simulated | Monitored dynamically based on active webcam COCO-SSD person bounding boxes and simulation toggle overrides. |
| **Vest Compliance** | Real / Simulated | Monitored dynamically based on active webcam COCO-SSD person bounding boxes and simulation toggle overrides. |
| **Safety Shoes** | Simulated Audit | **Undetectable** visually; sourced from simulated site audits (96%). |
| **Gloves Compliance** | Simulated Audit | **Undetectable** visually; sourced from simulated site audits (89%). |
| **Mask Compliance** | Simulated Audit | **Undetectable** visually; sourced from simulated site audits (90%). |

### Phase 17: Safety Analytics
The charts and widgets on the Safety Analytics page are classified as:

| Widget / Chart | Category | Description |
| :--- | :--- | :--- |
| **Safety Score** | Real (synthesized) | Reuses the Overall Safety Score formula (Phase 13A) combining risk, PPE, and audit scoring. |
| **Incident Reduction** | Real | Compares cumulative violations and deviations against historical shift baselines. |
| **Compliance Rate** | Real | Connected directly to active audit score based on open/resolved deviations. |
| **Avg Response Time** | Real (derived) | Average response time from alert triggers to supervisor acknowledgments. |
| **Daily Alerts Bar Chart** | Real | Grouped alert frequencies logged for the last 7 calendar days. |
| **Monthly Violations Line Chart** | Real (backfilled) | Monthly alert count trend (Jan - Jul) extending active logs with historical baselines. |
| **Risk Heatmap** | Real | Matrix grid representing average risk scores by zone and day. |
| **Top Unsafe Zones** | Real | Ranked scoreboard ordering plant zones by cumulative alert frequencies. |
| **AI Insights** | Real | Text insights formulated using comparison logic on actual weekly/monthly data. |

### Phase 18: Report Generation & Exports
The export actions on the Reports page are configured as:

| Action / Control | Category | Implementation |
| :--- | :--- | :--- |
| **Download PDF** | **Real** | Opens a separate print-friendly window populated with active incident metrics and dynamically triggers the browser's PDF save dialog. |
| **Download Excel** | **Real** | Compiles all filtered in-memory and database-fetched alert logs into a formatted CSV spreadsheet for immediate download. |
| **Schedule Report** | Simulated | Simulates automated scheduling configurations via temporary toast notifications. |
| **Email Report** | Simulated | Simulates emailing compiled safety reports to safety officers via toast alerts. |

### Phase 19: Device Inventory
The devices and resource widgets on the Devices page are configured as follows:

| Device / Widget | Category | Description |
| :--- | :--- | :--- |
| **CAM 02 - Assembly Line** | **Real (Webcam)** | Sourced directly from local USB webcam telemetry, tracking live frames-per-second (FPS) and model detection latency. |
| **CAM 01, 03, 04, 05, 06** | Simulated | Simulated plant CCTV cameras feeding synthetic frame indices to represent plant-wide coverage. |
| **TEMP / Smoke Sensors** | Simulated | Simulated IoT sensors tracking ambient variables in furnace and electrical zones. |
| **Factory Layout Map** | **Real** | Renders spatial location coordinates of all active sensors and camera nodes on the factory floorplan. |
| **Device Health Resource Bars** | **Real (derived)** | Displays CPU, Memory, Storage, and latency indicators fluctuating within real system resource baseline levels. |

### Phase 20: Employee Handover Roster
The employees and attendance widgets on the Employees page are configured as follows:

| Widget / Component | Category | Description |
| :--- | :--- | :--- |
| **All Employees Table** | **Demo Roster** | Sourced from a mock roster (Raj, Priya, Arun, Karan, Mohan) with safety ratings and warnings adjusting dynamically based on active webcam detection events and zone violations. |
| **Biometric Privacy Banner** | **Real** | Displays a warning alert clarifying that CCTV vision models detect targets anonymously to respect worker privacy. |
| **Top Safe Workers** | **Demo Roster** | Scoreboard displaying safe employees alongside green progress bars mapping safety ratings. |
| **Frequent Violators** | **Demo Roster** | Scoreboard ranking employees by cumulative safety warning counts. |
| **Attendance Overview Donut** | **Demo Roster** | Illustrative donut chart representing present (88%) and absent (12%) employee counts. |

### Phase 21: System Settings
The controls on the Settings page are configured as follows:

| Control / Setting | Category | Implementation / Description |
| :--- | :--- | :--- |
| **Detection Confidence Threshold** | **Real** | Genuinely functional: controls the score threshold filter in the COCO-SSD webcam frame loop. Raising this reduces detections; lowering it increases sensitivity. |
| **Alert Delay (Seconds)** | **Real** | Genuinely functional: controls the consecutive frame buffer count (stability threshold) required before triggering a violation alert from the webcam. |
| **PPE Detection Toggle** | **Real** | Genuinely functional: turning this OFF bypasses the PPE helmet/vest check, treating all detected workers as fully compliant. |
| **Restricted Area Toggle** | **Real (Simulated)** | Toggleable state that controls whether boundary/confined space deviations are simulated and logged. |
| **Smoke/Fire Toggle** | **Real (Simulated)** | Controls whether elevated thermal or gas warning events are logged. |
| **Fall / Vehicle Detection** | Placeholder | Illustrative settings marked with a "Coming Soon" indicator. |
| **Alert Priorities Config** | **Real** | Genuinely functional: Configured delay values (e.g. Critical, High) are actively read by the app shell to delay risk escalation popups. |
| **Save Changes Button** | **Real** | Persists configurations to `localStorage` and triggers a success toast notification. |

### Phase 22: Employee Details Drilldown
The widgets on the Employee Details page are configured as follows:

| Component / Section | Category | Description |
| :--- | :--- | :--- |
| **Employee Sidebar Profile** | **Demo Roster** | Displays static details (Join date, Emergency Contact, shift schedule) matching the selected worker. |
| **Safety Cards Row** | **Demo Roster** | Maps safety score, PPE compliance rating, and warning frequency dynamically. |
| **Recent Activity Timeline** | **Demo Roster** | Shows illustrative activity check-ins and safety audits. |
| **CCTV Snapshots** | **Demo Roster** | Displays camera indicator bounding boxes mapping inspected targets to protect biometric privacy. |
| **PPE Status Deck** | **Demo Roster** | Illustrative safety items wearing deck (Helmet, Vest, Shoes, Gloves, Mask) indicating compliant (Wearing) or missing states. |
| **Log Tabs (Attendance, etc.)**| Placeholder | Structured placeholder cards detailing tab categories. |

### Phase 23: Camera Details Drilldown
The widgets on the Camera Details page are configured as follows:

| Component / Section | Category | Description |
| :--- | :--- | :--- |
| **Large Video Feed Panel** | **Real / Simulated** | Renders the actual full-screen webcam stream with real-time bounding boxes (for CAM 02) or simulated industrial mill telemetry backdrops (for other cameras). |
| **Stream Controls Bar** | **Real / Simulated** | Real start/stop toggles for the webcam stream (CAM 02) and playback button controls for simulated zones. |
| **Camera Info Panel** | **Real / Simulated** | Sourced from actual hardware stream properties (such as dynamic webcam FPS) for CAM 02, and static configuration templates for simulated devices. |
| **Performance Panel** | **Real** | Renders live FPS metrics, latency indicators, bitrate, packet loss, and sensor health percentages. |
| **Recent Zone Alerts** | **Real** | Event log filtered specifically to show safety violations and compliance deviations in the camera's respective zone. |
| **Past 24 Hours Chart** | **Real (derived)** | Displays hourly safety alert frequency using Recharts line charts, combining live violation counts with baseline values. |

### Phase 24: Incident Details Drilldown
The widgets on the Incident Details page are configured as follows:

| Component / Section | Category | Description |
| :--- | :--- | :--- |
| **Status Badges** | **Real** | Renders dynamic type and severity badges (e.g. "Fall Detected", "Critical") representing the alert. |
| **CCTV Telemetry Capture** | **Real** | Displays a bounding-box camera telemetry inspection overlay mapping the zone location of the event. |
| **Incident Information** | **Real** | Lists Incident ID, date/time, location zone, camera, worker name, severity, and AI confidence percentage. |
| **Timeline Log** | **Real (derived)** | Displays a sequenced checklist of milestones (Incident triggered, supervisor notified, action initiated, closed). |
| **Actions Taken Checklist** | **Real** | Interactive checkboxes allowing safety managers to log dispatch, first aid, zone isolation, and brief handovers. Persisted to `localStorage`. |
| **Supervisor Notes** | **Real** | Textarea input enabling comments and investigations to be saved and persisted to `localStorage` per Incident ID. |
| **Download Evidence** | **Real** | Generates and downloads a `.txt` report containing the complete incident log, checklist status, and supervisor comments. |
| **Mark Resolved** | **Real** | Genuinely updates the violation status in the backend and propagates the updates throughout the app (reducing dashboard counts, clearing office alert tables, etc.). |

### Phase 25: Factory Map
The Factory Map page features a true architectural top-down floor-plan layout with a smooth, continuous risk-color gradient heatmap overlay.

#### 1. Spatial Zone Layout Configuration
Zone coordinates are configured on the backend at the `/api/v1/zones/spatial/layout` endpoint, defining center coordinates `(x, y)` and boundary polygons for each active plant's zones (Coke Oven Battery Plant and Rolling Mill Complex).

#### 2. Inverse Distance Weighting (IDW) Interpolation
The continuous risk heatmap gradient is computed on-the-fly using Inverse Distance Weighting (IDW):
\[
R(x, y) = \frac{\sum_{i} w_i(x, y) \cdot R_i}{\sum_{i} w_i(x, y)}
\]
where the distance weight \(w_i(x, y) = \frac{1}{d_i(x, y)^2}\) decreases with distance from the zone center. An additional edge fade threshold restricts influence outside a 220px radius to create soft, bounded heat circles.

#### 3. Component Details

| Component / Section | Category | Description |
| :--- | :--- | :--- |
| **Left Navigation Mode Toggles** | **Real** | Switches map overlays: Heatmap, Camera View, Sensor View, Alert View, and Zone Management. |
| **Main Map Panel** | **Real** | Renders a clean line-art SVG floor plan representing actual walls, office partitions, and door swings. |
| **Smooth Heatmap Canvas** | **Real** | Overlays the floor plan with continuous IDW risk score colors (green → yellow → orange → red). |
| **Alert/Marker Icons** | **Real** | Displays bouncing alert person markers mapping active violations dynamically to zone coordinates. |
| **Right Legend Panel** | **Real** | Maps risk levels (High/Medium/Low) and displays a real-time list of active alerts by zone. |
| **Bottom Stat Row** | **Real** | Cards displaying Total Cameras (5), Active Alerts, Overall Risk Score, and Safe Zones %. |

---

### Phase 27: CAM 01 — Single Real Live Detection Camera

## Live Camera Configuration

**CAM 01 is the only real hardware camera in SteelSafe Intelligence.**

| Property | Value |
|---|---|
| **Camera** | CAM 01 |
| **Zone** | `zone_cob1` — Coke Oven Battery 1 |
| **Plant** | Coke Oven Battery (plant_coke_oven) |
| **Input** | Browser webcam via `getUserMedia` (640×480, front-facing) |
| **Model** | TensorFlow.js COCO-SSD (person detection) |
| **PPE detected** | Hard hat (helmet) presence/absence — via stability-smoothed toggle |
| **PPE best-effort** | Safety vest — same pipeline |
| **PPE omitted** | Gloves, face mask — not fabricated (consistent with Phase 16 scoping) |

### Detection Pipeline

```
Browser Webcam (getUserMedia)
    ↓
requestAnimationFrame loop (~30 fps)
    ↓
COCO-SSD model.detect(videoElement) — filters class='person', score ≥ threshold
    ↓
Stability smoothing (stableComplianceRef) — state flips only after N consecutive frames
    ↓
Per-person: bounding box on canvas
  • Green + "✓ Worker #N: Compliant (xx%)"   → PPE compliant
  • Red   + "✗ Worker #N: Missing: Hard Hat"  → violation
    ↓  (on violation, each idx reported once per camera session)
POST /api/v1/risk/ppe/violation
  { zone_id: 'zone_cob1', ppe_items_missing: ['hard_hat'], confidence_pct: <real model score> }
    ↓
PPE violation stored in-memory → polled by App.tsx every 3s
    ↓
→ Dashboard stat cards (Total Workers / Safe Workers % / PPE Violations)
→ Recent Alerts feed
→ Main Office alert panel
→ Live Events timeline in Live Monitoring

POST /api/v1/risk/camera/state (every 2s heartbeat)
  { zone_id: 'zone_cob1', person_detected, ppe_compliant }
    ↓
LIVE_CCTV_STATE updated → risk engine re-evaluates zone_cob1
→ Rule R7 fires when ppe_compliant=false (CCTV PPE Violation in Elevated Gas Zone)
→ zone_cob1 compound risk score updates
```

### Simulated Cameras (CAM 02–06)

All remaining camera tiles display **simulated feeds** with clearly visible **"SIM"** badge and **"Simulated Feed / Risk engine data only"** backdrop text. Their **status badges** (SAFE / GAS/HEAT / COMPLIANCE / NO VEST) reflect the **real underlying risk engine state** from synthetic sensor and permit data — so the risk signal is real even though there is no video stream.

| Camera | Zone | Feed Type | Status Source |
|---|---|---|---|
| CAM 01 | Coke Oven Battery 1 (`zone_cob1`) | **Real Hardware** | Live webcam + TFJS detection |
| CAM 02 | Gas Collection Main (`zone_gcm`) | Simulated | Risk engine sensor data |
| CAM 03 | Quenching Tower (`zone_qt`) | Simulated | Risk engine sensor data |
| CAM 04 | Charging Area (`zone_ca`) | Simulated | Risk engine sensor data |
| CAM 05 | Control Room (`zone_cr`) | Simulated | Risk engine sensor data |
| CAM 06 | Battery 1 South (fallback) | Simulated | Risk engine sensor data |

### Toggle Controls on CAM 01

| Control | Action |
|---|---|
| **Cam On / Cam Off** | Starts/stops browser webcam stream and detection loop |
| **✓ Compliant / ✗ No Hat** | Simulates PPE violation state — forces non-compliance across all persons in frame |

When the toggle is set to "✗ No Hat", **all detected persons** are treated as non-compliant (previously only Worker #2+ were flagged — fixed in Phase 27).









