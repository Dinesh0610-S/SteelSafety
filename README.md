# SteelSafe Intelligence ⛑️

SteelSafe Intelligence is an advanced, AI-powered industrial safety and compliance telemetry platform built specifically for high-risk steel manufacturing environments. It integrates real-time sensor analytics, RAG-grounded safety advisor systems, shift briefing automated generators, and multi-person edge video analytics to monitor safety compliance and prevent accidents before they occur.

## 🏗️ Repository Structure

* **[`steelsafe/`](./steelsafe)**: The backend API service built with FastAPI, incorporating SQLite, a rule-based risk engine, predictive time-to-decay (TTD) forecast models, and a RAG (Retrieval-Augmented Generation) corpus.
* **[`steelsafe-frontend/`](./steelsafe-frontend)**: The frontend user interface built with React, Vite, Tailwind CSS, Three.js (for the 3D isometric plant layout), and TensorFlow.js (for webcam safety gear detection).

---

## 🚀 Getting Started

### 1. Backend Setup (`steelsafe/`)
1. Navigate to the backend directory:
   ```bash
   cd steelsafe
   ```
2. Create and activate a Python virtual environment:
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```
3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
4. Run the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```
   *Note: On startup, the database `steelsafe.db` will be initialized automatically, and synthetic sensor, permit, and shift logs will be generated if it is the first run.*

### 2. Frontend Setup (`steelsafe-frontend/`)
1. Navigate to the frontend directory:
   ```bash
   cd ../steelsafe-frontend
   ```
2. Install npm packages:
   ```bash
   npm install
   ```
3. Start the Vite development server:
   ```bash
   npm run dev -- --host 0.0.0.0
   ```

---

## 🛠️ Main Features

1. **Safety & Telemetry Monitor**: Real-time gas concentrations ($CO$, $H_2S$), worker counts, and active permits monitoring across plant zones.
2. **Quality & Compliance Audit**: Continuous monitoring of statutory standards (OISD, Factories Act) flagging missing checklists or overdue maintenance.
3. **Interactive 3D Cutaway**: Real-time isometric WebGL view showing live zone risk heatmaps.
4. **Predictive Incident Forecasting**: Time-to-decay (TTD) predictions alerting management hours before a potential gas exceedance.
5. **Dynamic Safety RAG Agent**: An AI advisor grounded in compliance standards (Factories Act, OISD 137) to guide operators through safety protocol lookups.
6. **Multi-Person PPE Camera Analytics**: Edge webcam analytics checking worker presence and safety attire compliance across 5 categories:
   * **Helmet (Hard Hat)**: *Genuinely Reliable* (Manual override & webcam tracking)
   * **Safety Vest**: *Genuinely Reliable* (Manual override & webcam tracking)
   * **Safety Shoes**: *Best-effort (beta)* (Offscreen feet region color analysis)
   * **Gloves**: *Best-effort (beta)* (Offscreen hand region color analysis)
   * **Mask**: *Best-effort (beta)* (Offscreen mouth region color analysis)
   Includes temporal smoothing to prevent label flickering, and direct escalation of violations to the Main Office console.

---

## ⛑️ 5-Category PPE Detection Pipeline Details

The platform's edge vision tracking (CAM 01, real device camera) has been extended to monitor 5 PPE categories per person, per frame:
1. **Helmet (Hard Hat)** — *Reliable* (Manual overrides & webcam tracking)
2. **Safety Vest** — *Reliable* (Manual overrides & webcam tracking)
3. **Safety Shoes** — *Best-effort (beta)* (Footwear detection uses a custom feet-region darkness/color heuristic because standard TFJS footwear classification models are not available over CORS-enabled public CDNs)
4. **Gloves** — *Best-effort (beta)* (Hand detection uses a hand-region color heuristic to classify glove presence/absence)
5. **Mask** — *Best-effort (beta)* (Facial mask detection uses a head-region contrast and color check)

*Note: For all beta/lower-confidence categories (Shoes, Gloves, Mask), a `(beta)` label is automatically displayed next to the item in the bounding boxes, compliance gauges, target list, and Main Office panels to maintain visual transparency.*

---

## 📹 3-Camera Industrial Surveillance System

The surveillance grid is streamlined into exactly 3 authoritative camera feeds:
* **CAM 01 — Coke Oven Battery (Live Laptop Webcam)**:
  - Captures real device camera feed via browser WebRTC `getUserMedia`.
  - Transmits snapshots every 2.5s to `/api/v1/detection/analyze-frame`.
  - Evaluates worker foot positions against the restricted zone polygon (right half of frame).
  - Displays color-coded bounding boxes and per-worker compliance chips (`[COMPLIANT]`, `[MISSING: HELMET, VEST]`, `[OUTSIDE]`, `[REVIEW]`).
* **CAM 02 — Blast Furnace Zone (Recorded Feed Loop)**:
  - Streams looped industrial worker footage from `steelsafe/media/cam02_workers_ppe.mp4`.
  - Server-side background worker runs the pretrained YOLO PPE pipeline, burning compliance overlays directly into the feed.
* **CAM 03 — Gas Cleaning Plant (Recorded Feed Loop)**:
  - Streams looped industrial footage from `steelsafe/media/cam03_fire_smoke.mp4`.
  - Server-side background worker detects fire and smoke signatures and broadcasts visual evacuation banners.

