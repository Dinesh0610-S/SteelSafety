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




