# SteelSafe Recorded Video Feeds

This directory stores the looped video-file feeds used by the SteelSafe camera system:

- `cam02_workers_ppe.mp4` : Recorded footage of industrial workers in Blast Furnace Zone (used for CAM 02 PPE detection: helmet, vest, gloves, boots).
- `cam03_fire_smoke.mp4` : Recorded footage of smoke/fire in Gas Cleaning Plant (used for CAM 03 fire & smoke alerts).

### Where to Find Datasets / Clips
1. **Pexels / Pixabay**: Search for "construction workers" or "steel factory workers" (free stock video clips).
2. **Kaggle**: 
   - [PPE Detection Dataset](https://www.kaggle.com/)
   - [Fire and Smoke Detection Dataset](https://www.kaggle.com/)

### Graceful Degradation
If either video file is missing, the backend logs a warning and marks the camera status as `"Offline"` without crashing. The frontend renders the offline placeholder tile gracefully.
