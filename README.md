# SteelSafe Intelligence

AI-Powered Real-Time PPE Detection & Safety Monitoring System for Steel Plants.

## 📌 Project Overview
SteelSafe Intelligence is an end-to-end computer vision and safety management application designed for harsh industrial environments such as steel manufacturing plants. It detects Personal Protective Equipment (PPE) compliance (Hardhats/Helmets and Safety Vests) in real-time to prevent workplace hazards and ensure strict OSHA compliance.

---

## 🏗️ Repository Architecture

* `steelsafe-ml/`: Machine learning pipeline built with Ultralytics YOLOv8.
  * `check_dataset.py`: Dataset validation, statistics calculation, and absolute path generator.
  * `data_fixed.yaml`: Dataset configuration pointing to normalized splits.
  * `train.py`: CPU-optimized fine-tuning script with auto-resumption (`resume=True`) and progress logging.
  * `evaluate.py`: Model evaluation script computing mAP@0.5, mAP@0.5:0.95, precision, recall, confusion matrix, PR curves, and confidence threshold analysis.
  * `export.py`: ONNX export pipeline with OPSET-12 and model simplification for cross-platform edge inference.
  * `start_training.bat`: Windows desktop shortcut to launch or resume training in a detached console.
* `steelsafe-app/`: Real-time industrial safety web application (React, Vite, Tailwind CSS).
  * Live CCTV camera feed simulation and monitoring.
  * Incident reporting and SOS emergency system.
  * Worker PPE compliance tracking and analytics.
  * Plant sensor telemetry (gas levels, temperature, sound).

---

## ⚙️ Model Training (CPU Optimized)

### Setup
```bash
cd steelsafe-ml
python -m venv .venv
.\.venv\Scripts\activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install ultralytics onnx onnxruntime matplotlib pyyaml
```

### Dataset Check
```bash
python check_dataset.py
```

### Training
```bash
python train.py
```
Training logs are automatically recorded to `steelsafe-ml/runs/train_log.txt`.

### Evaluation & ONNX Export
```bash
python evaluate.py
python export.py
```
