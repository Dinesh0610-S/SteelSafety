import sys
import os
import logging
from pathlib import Path
from ultralytics import YOLO
from ultralytics.utils import LOGGER

class SafeLogger:
    """Tee logger to write to stdout and log file safely across all environments."""
    def __init__(self, terminal, log_path):
        self.terminal = terminal
        self.log_path = log_path
        self.log_file = open(log_path, "a", encoding="utf-8", buffering=1)

    def write(self, message):
        if self.terminal:
            try:
                self.terminal.write(message)
                self.terminal.flush()
            except Exception:
                pass
        if self.log_file:
            try:
                self.log_file.write(message)
                self.log_file.flush()
            except Exception:
                pass

    def flush(self):
        if self.terminal:
            try:
                self.terminal.flush()
            except Exception:
                pass
        if self.log_file:
            try:
                self.log_file.flush()
            except Exception:
                pass

    def isatty(self):
        return False

    def fileno(self):
        if self.log_file:
            return self.log_file.fileno()
        return -1

def main():
    base_dir = Path(__file__).resolve().parent
    data_yaml = base_dir / "data_fixed.yaml"
    runs_dir = base_dir / "runs"
    runs_dir.mkdir(parents=True, exist_ok=True)

    # Setup train log
    log_file_path = runs_dir / "train_log.txt"
    sys.stdout = SafeLogger(sys.stdout, log_file_path)
    sys.stderr = SafeLogger(sys.stderr, log_file_path)

    # Attach file handler directly to Ultralytics logger
    fh = logging.FileHandler(str(log_file_path), encoding="utf-8")
    fh.setLevel(logging.INFO)
    formatter = logging.Formatter('%(message)s')
    fh.setFormatter(formatter)
    LOGGER.addHandler(fh)

    if not data_yaml.exists():
        raise FileNotFoundError(f"data_fixed.yaml not found at {data_yaml}. Run check_dataset.py first.")

    run_dir = runs_dir / "ppe_v8n"
    last_ckpt = run_dir / "weights" / "last.pt"

    print("=" * 70)
    print("STEELSAFE INTELLIGENCE: YOLOv8n TRAINING")
    print("=" * 70)
    print(f"Working Directory: {base_dir}")
    print(f"Dataset Config:    {data_yaml}")
    print(f"Log File:          {log_file_path}")

    # Check for existing checkpoint to resume
    if last_ckpt.exists():
        print(f"\n[RESUME MODE] Found existing checkpoint at {last_ckpt}.")
        print("Resuming training with resume=True...")
        model = YOLO(str(last_ckpt))
        results = model.train(resume=True)
    else:
        print("\n[FRESH START] No checkpoint found. Initializing yolov8n.pt...")
        model = YOLO("yolov8n.pt")
        results = model.train(
            data=str(data_yaml),
            epochs=30,
            imgsz=416,
            batch=8,
            workers=2,
            patience=10,
            seed=42,
            device="cpu",
            save_period=1,
            project=str(runs_dir),
            name="ppe_v8n",
            exist_ok=True,
            verbose=True
        )

    print("\nTraining completed successfully!")
    print(f"Final weights saved in: {run_dir / 'weights'}")

if __name__ == "__main__":
    main()
