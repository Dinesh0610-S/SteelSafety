"""
scripts/evaluate_detection.py
==============================
Offline accuracy evaluation script for the PPE detection pipeline.

Usage:
    python scripts/evaluate_detection.py --csv labels.csv --images_dir images/

CSV format (one row per person-item-expected_state):
    image,person_index,item,expected_state
    frame001.jpg,0,helmet,worn
    frame001.jpg,0,vest,worn
    frame001.jpg,1,helmet,missing
    frame002.jpg,0,helmet,uncertain
    ...

    expected_state: "worn" | "missing" | "uncertain"

The script:
  1. Groups rows by image file.
  2. Runs analyze_frame() on each image (same pipeline as live mode).
  3. Compares predicted states to expected states.
  4. Prints per-item precision, recall, F1, and the false-negative rate
     (= missed violations, where expected=missing but predicted=worn or uncertain).

These metrics go on the judging slide:
  "No training. X% recall on missing helmets/vests across N images."

Run from the steelsafe/ directory:
    cd steelsafe
    python scripts/evaluate_detection.py --csv ../eval_labels.csv --images_dir ../eval_images/
"""

from __future__ import annotations

import argparse
import csv
import os
import sys
from collections import defaultdict
from pathlib import Path
from typing import Dict, List, Tuple

import cv2

# Add parent to path so we can import from steelsafe package
sys.path.insert(0, str(Path(__file__).parent.parent))

from detection.constants import PPE_ITEMS
from detection.detection_service import analyze_frame


# ---------------------------------------------------------------------------
# Label loading
# ---------------------------------------------------------------------------

def load_labels(csv_path: str) -> Dict[str, List[Dict]]:
    """
    Read the hand-labelled CSV and group rows by image filename.
    Returns: { image_filename: [{person_index, item, expected_state}, ...] }
    """
    by_image: Dict[str, List[Dict]] = defaultdict(list)
    with open(csv_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            by_image[row["image"].strip()].append({
                "person_index": int(row["person_index"]),
                "item":         row["item"].strip().lower(),
                "expected":     row["expected_state"].strip().lower(),
            })
    return dict(by_image)


# ---------------------------------------------------------------------------
# Confusion matrix accumulator
# ---------------------------------------------------------------------------

class PerItemMetrics:
    """Accumulates TP, FP, FN, TN counts for a single PPE item."""
    def __init__(self):
        # For "missing" detection:
        # TP = expected "missing", predicted "missing"
        # FP = expected "worn",    predicted "missing"  (false alarm)
        # FN = expected "missing", predicted "worn" or "uncertain"  (MISSED VIOLATION — most dangerous)
        self.tp = self.fp = self.fn = self.tn = 0
        self.uncertain_when_expected_missing = 0   # separate counter

    def add(self, expected: str, predicted: str):
        if expected == "missing":
            if predicted == "missing":
                self.tp += 1
            elif predicted == "worn":
                self.fn += 1
            else:  # uncertain
                self.uncertain_when_expected_missing += 1
                self.fn += 1   # treat uncertain-when-should-be-missing as FN
        elif expected == "worn":
            if predicted == "worn":
                self.tn += 1
            elif predicted == "missing":
                self.fp += 1
            # uncertain when expected worn → not counted as violation
        # expected == "uncertain" → not used in precision/recall for violations

    @property
    def precision(self) -> float:
        denom = self.tp + self.fp
        return self.tp / denom if denom > 0 else float("nan")

    @property
    def recall(self) -> float:
        """Recall = sensitivity for "missing" class (most safety-critical)."""
        denom = self.tp + self.fn
        return self.tp / denom if denom > 0 else float("nan")

    @property
    def f1(self) -> float:
        p, r = self.precision, self.recall
        if p != p or r != r:  # NaN check
            return float("nan")
        denom = p + r
        return 2 * p * r / denom if denom > 0 else float("nan")

    @property
    def false_negative_rate(self) -> float:
        """FNR = missed violations / total actual violations."""
        denom = self.tp + self.fn
        return self.fn / denom if denom > 0 else float("nan")


# ---------------------------------------------------------------------------
# Main evaluation loop
# ---------------------------------------------------------------------------

def evaluate(csv_path: str, images_dir: str, camera_id: str = "cam_cob1"):
    labels  = load_labels(csv_path)
    metrics = {item: PerItemMetrics() for item in PPE_ITEMS}

    images_found = 0
    total_persons = 0
    mismatched_persons = 0

    for img_filename, rows in labels.items():
        img_path = os.path.join(images_dir, img_filename)
        if not os.path.exists(img_path):
            print(f"  [WARN] Image not found: {img_path} — skipping")
            continue

        frame = cv2.imread(img_path)
        if frame is None:
            print(f"  [WARN] Could not decode {img_path} — skipping")
            continue

        images_found += 1

        # Run full pipeline (same as live mode — pretrained models only)
        result = analyze_frame(
            frame,
            camera_id=camera_id,
            settings={"ppe_detection_enabled": True, "ppe_backend": "both"},
        )

        # Build predicted state lookup: person_index → {item: state}
        predicted: Dict[int, Dict[str, str]] = {}
        for worker in result.workers:
            predicted[worker.person_index] = worker.ppe

        # Compare each labelled row
        for row in rows:
            pidx     = row["person_index"]
            item     = row["item"]
            expected = row["expected"]

            if item not in PPE_ITEMS:
                continue

            total_persons += 1

            if pidx not in predicted:
                # Person not detected → treat as "uncertain"
                mismatched_persons += 1
                if expected == "missing":
                    metrics[item].fn += 1   # missed violation
                continue

            pred_state = predicted[pidx].get(item, "uncertain")
            metrics[item].add(expected, pred_state)

    # ---------------------------------------------------------------------------
    # Print results
    # ---------------------------------------------------------------------------
    print(f"\n{'='*62}")
    print(f"  STEELSAFE PPE DETECTION — ACCURACY EVALUATION")
    print(f"{'='*62}")
    print(f"  Images evaluated  : {images_found}")
    print(f"  Label rows        : {total_persons}")
    print(f"  Unmatched persons : {mismatched_persons}  (person not detected)")
    print(f"{'='*62}")
    print(f"  {'Item':<10} {'Precision':>10} {'Recall':>10} {'F1':>8} {'FNR (↓ better)':>16}")
    print(f"  {'-'*56}")

    all_tp = all_fn = 0
    for item in PPE_ITEMS:
        m = metrics[item]
        all_tp += m.tp
        all_fn += m.fn
        fmt_pct = lambda v: f"{v*100:.1f}%" if v == v else "  N/A"
        print(
            f"  {item:<10} "
            f"{fmt_pct(m.precision):>10} "
            f"{fmt_pct(m.recall):>10} "
            f"{fmt_pct(m.f1):>8} "
            f"{fmt_pct(m.false_negative_rate):>16}"
        )

    overall_recall = all_tp / (all_tp + all_fn) if (all_tp + all_fn) > 0 else float("nan")
    print(f"{'='*62}")
    print(f"  OVERALL VIOLATION RECALL: {overall_recall*100:.1f}%  (missing items caught)")
    print(f"  FNR (missed violations) : {(1-overall_recall)*100:.1f}%")
    print(f"{'='*62}\n")
    print("  → Use these numbers on the judging slide:")
    print(f"    'No training. {overall_recall*100:.0f}% recall on missing PPE items.'")
    print()


# ---------------------------------------------------------------------------
# CLI entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Evaluate PPE detection accuracy (no training).")
    parser.add_argument("--csv",        required=True, help="Path to ground-truth CSV file")
    parser.add_argument("--images_dir", required=True, help="Directory containing evaluation images")
    parser.add_argument("--camera_id",  default="cam_cob1", help="Camera ID for zone polygon lookup")
    args = parser.parse_args()

    evaluate(args.csv, args.images_dir, args.camera_id)
