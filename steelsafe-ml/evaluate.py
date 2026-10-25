import os
import random
import shutil
from pathlib import Path
from ultralytics import YOLO
import yaml

def main():
    base_dir = Path(__file__).resolve().parent
    data_yaml_path = base_dir / "data_fixed.yaml"
    weights_path = base_dir / "runs" / "ppe_v8n" / "weights" / "best.pt"

    if not weights_path.exists():
        raise FileNotFoundError(
            f"Weights file not found at {weights_path}. Please complete training first."
        )

    if not data_yaml_path.exists():
        raise FileNotFoundError(f"data_fixed.yaml not found at {data_yaml_path}.")

    with open(data_yaml_path, "r", encoding="utf-8") as f:
        data_cfg = yaml.safe_load(f)

    # Use test split if present, else fallback to val
    test_split_name = "test" if data_cfg.get("test") else "val"
    print(f"Using split '{test_split_name}' for evaluation.")

    eval_dir = base_dir / "evaluation"
    eval_dir.mkdir(parents=True, exist_ok=True)

    print(f"Loading model from: {weights_path}")
    model = YOLO(str(weights_path))

    # 1. Standard Validation on test split
    print("\n--- Running Validation on Test Split ---")
    val_results = model.val(
        data=str(data_yaml_path),
        split=test_split_name,
        imgsz=416,
        batch=8,
        device="cpu",
        project=str(eval_dir),
        name="val_run",
        exist_ok=True,
        plots=True
    )

    # Extract overall metrics
    mp = val_results.box.mp
    mr = val_results.box.mr
    map50 = val_results.box.map50
    map50_95 = val_results.box.map

    print("\n" + "=" * 65)
    print("OVERALL METRICS ON TEST SPLIT")
    print("=" * 65)
    print(f"Precision (P):       {mp:.4f}")
    print(f"Recall (R):          {mr:.4f}")
    print(f"mAP@0.5:             {map50:.4f}")
    print(f"mAP@0.5:0.95:        {map50_95:.4f}")
    print("=" * 65)

    # Per-class metrics table
    class_names = model.names
    print("\nPER-CLASS METRICS TABLE")
    print("-" * 65)
    print(f"{'Class ID':<10}{'Class Name':<20}{'Precision':<12}{'Recall':<12}{'mAP@0.5':<12}")
    print("-" * 65)
    for i, name in class_names.items():
        p_c = val_results.box.p[i] if i < len(val_results.box.p) else 0.0
        r_c = val_results.box.r[i] if i < len(val_results.box.r) else 0.0
        ap50_c = val_results.box.ap50[i] if i < len(val_results.box.ap50) else 0.0
        print(f"{i:<10}{name:<20}{p_c:<12.4f}{r_c:<12.4f}{ap50_c:<12.4f}")
    print("-" * 65)

    # Copy plots to evaluation root for easy user access
    val_save_dir = Path(val_results.save_dir)
    plots_to_copy = [
        "confusion_matrix.png",
        "confusion_matrix_normalized.png",
        "PR_curve.png",
        "F1_curve.png"
    ]
    for p in plots_to_copy:
        src = val_save_dir / p
        if src.exists():
            shutil.copy(src, eval_dir / p)

    # Copy results.png from training run if present
    train_results_png = base_dir / "runs" / "ppe_v8n" / "results.png"
    if train_results_png.exists():
        shutil.copy(train_results_png, eval_dir / "results.png")

    print(f"\nEvaluation plots saved to: {eval_dir}")

    # 2. Confidence Threshold Analysis (0.25, 0.4, 0.5, 0.6)
    print("\n" + "=" * 65)
    print("CONFIDENCE THRESHOLD ANALYSIS")
    print("=" * 65)
    print(f"{'Conf Thresh':<14}{'Precision':<14}{'Recall':<14}{'mAP@0.5':<14}{'mAP@0.5:0.95':<14}")
    print("-" * 65)
    for conf_val in [0.25, 0.4, 0.5, 0.6]:
        conf_res = model.val(
            data=str(data_yaml_path),
            split=test_split_name,
            conf=conf_val,
            imgsz=416,
            batch=8,
            device="cpu",
            project=str(eval_dir / "conf_tests"),
            name=f"conf_{conf_val}",
            exist_ok=True,
            verbose=False,
            plots=False
        )
        print(f"{conf_val:<14.2f}{conf_res.box.mp:<14.4f}{conf_res.box.mr:<14.4f}{conf_res.box.map50:<14.4f}{conf_res.box.map:<14.4f}")
    print("=" * 65)

    # 3. Predict on 8 random test images
    test_img_dir = Path(data_cfg[test_split_name])
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    test_images = [p for p in test_img_dir.iterdir() if p.suffix.lower() in image_exts]

    if test_images:
        random.seed(42)
        sample_count = min(8, len(test_images))
        sampled_imgs = random.sample(test_images, sample_count)
        print(f"\nRunning predictions on {sample_count} sample test images...")

        pred_dir = eval_dir / "sample_predictions"
        model.predict(
            source=[str(p) for p in sampled_imgs],
            conf=0.25,
            imgsz=416,
            device="cpu",
            save=True,
            project=str(eval_dir),
            name="sample_predictions",
            exist_ok=True
        )
        print(f"Sample predictions saved in: {pred_dir}")

if __name__ == "__main__":
    main()
