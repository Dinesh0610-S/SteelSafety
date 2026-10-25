import re
from pathlib import Path
from collections import Counter
import yaml

def normalize_name(name):
    # Normalize by converting to lower and stripping hyphens/underscores/spaces
    return re.sub(r'[-_\s]', '', name.lower())

def main():
    base_dir = Path(__file__).resolve().parent
    dataset_dir = base_dir / "dataset"
    data_yaml_path = dataset_dir / "data.yaml"
    fixed_yaml_path = base_dir / "data_fixed.yaml"

    if not data_yaml_path.exists():
        raise FileNotFoundError(f"data.yaml not found at {data_yaml_path}")

    # 1. Read data.yaml
    with open(data_yaml_path, "r", encoding="utf-8") as f:
        data_cfg = yaml.safe_load(f)

    names = data_cfg.get("names", [])
    nc = data_cfg.get("nc", len(names))

    print("=" * 70)
    print("STEP 1: DATASET VERIFICATION REPORT")
    print("=" * 70)
    print(f"Dataset path: {data_yaml_path}")
    print(f"Class count (nc): {nc}")
    print(f"Exact class names: {names}")
    print("-" * 70)

    # 2. Check for duplicate or inconsistent class names
    warnings = []
    
    # Exact duplicate check
    if len(names) != len(set(names)):
        warnings.append("Duplicate class names found in 'names' list!")

    # Inconsistent variations (e.g. No-Helmet vs no_helmet vs NoHelmet)
    norm_map = {}
    for name in names:
        norm = normalize_name(name)
        if norm in norm_map:
            warnings.append(f"Inconsistent/duplicate class name variation: '{name}' vs '{norm_map[norm]}'")
        else:
            norm_map[norm] = name

    # Violation classes check
    violation_keywords = ["no_helmet", "no-helmet", "nohelmet", "without_helmet", 
                          "no_vest", "no-vest", "novest", "without_vest"]
    found_violations = [name for name in names if normalize_name(name) in [normalize_name(k) for k in violation_keywords]]

    if found_violations:
        violation_status = f"Dataset CONTAINS violation class(es): {found_violations}"
    else:
        violation_status = "Dataset does NOT contain explicit violation classes (no_helmet, no_vest). It contains positive PPE classes only: " + ", ".join(names)

    # 3. Process splits (train, valid, test)
    image_exts = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
    splits = ["train", "valid", "test"]
    split_paths = {}
    split_stats = {}

    test_exists = False

    for split in splits:
        img_dir = dataset_dir / split / "images"
        lbl_dir = dataset_dir / split / "labels"

        # Roboflow sometimes uses 'val' instead of 'valid'
        if not img_dir.exists() and split == "valid":
            img_dir = dataset_dir / "val" / "images"
            lbl_dir = dataset_dir / "val" / "labels"

        if not img_dir.exists():
            split_paths[split] = None
            split_stats[split] = {"exists": False, "images": 0, "counts": Counter(), "total_objs": 0}
            continue

        images = [p for p in img_dir.iterdir() if p.suffix.lower() in image_exts]
        num_images = len(images)

        if num_images == 0:
            split_paths[split] = None
            split_stats[split] = {"exists": False, "images": 0, "counts": Counter(), "total_objs": 0}
            continue

        if split == "test":
            test_exists = True

        split_paths[split] = img_dir.resolve().as_posix()
        counts = Counter()

        for img in images:
            lbl_file = lbl_dir / f"{img.stem}.txt"
            if lbl_file.exists():
                with open(lbl_file, "r", encoding="utf-8") as lf:
                    for line in lf:
                        parts = line.strip().split()
                        if parts:
                            try:
                                cls_idx = int(parts[0])
                                counts[cls_idx] += 1
                            except ValueError:
                                pass

        split_stats[split] = {
            "exists": True,
            "images": num_images,
            "counts": counts,
            "total_objs": sum(counts.values())
        }

    # Test folder check
    if not test_exists:
        warnings.append("No test folder or images found! Using valid split for test in data_fixed.yaml.")
        split_paths["test"] = split_paths["valid"]
    else:
        print(f"Test split confirmed: {split_stats['test']['images']} images found.")

    # 4. Print table of images and labeled objects per class
    print("\nSPLIT SUMMARY TABLE")
    print("-" * 70)
    header = f"{'Split':<10} | {'Images':<8} | {'Total Objs':<12}"
    for idx, name in enumerate(names):
        header += f" | {name + f' (cls {idx})':<16}"
    print(header)
    print("-" * 70)

    for split in splits:
        info = split_stats[split]
        if not info["exists"]:
            row = f"{split:<10} | {'0 (None)':<8} | {'0':<12}"
            for idx in range(len(names)):
                row += f" | {'0':<16}"
            print(row)
            continue
        row = f"{split:<10} | {info['images']:<8} | {info['total_objs']:<12}"
        for idx in range(len(names)):
            c_cnt = info["counts"].get(idx, 0)
            row += f" | {c_cnt:<16}"
        print(row)
    print("-" * 70)

    # Check for classes with fewer than 100 training objects
    train_counts = split_stats.get("train", {}).get("counts", Counter())
    for idx, name in enumerate(names):
        train_obj_cnt = train_counts.get(idx, 0)
        if train_obj_cnt < 100:
            warnings.append(f"Class '{name}' (ID {idx}) has fewer than 100 training objects ({train_obj_cnt} objects)!")

    # 5. Output warnings and violation analysis
    print("\nDATASET AUDIT & WARNINGS:")
    print(f"- Violation Class Analysis: {violation_status}")
    if warnings:
        for w in warnings:
            print(f"- WARNING: {w}")
    else:
        print("- No naming conflicts or low-sample classes detected.")

    # 6. Create data_fixed.yaml with absolute paths
    fixed_cfg = {
        "path": dataset_dir.resolve().as_posix(),
        "train": split_paths["train"],
        "val": split_paths["valid"],
        "test": split_paths["test"],
        "nc": len(names),
        "names": names
    }

    with open(fixed_yaml_path, "w", encoding="utf-8") as f:
        yaml.dump(fixed_cfg, f, sort_keys=False, default_flow_style=None)

    print(f"\nCreated data_fixed.yaml with absolute paths: {fixed_yaml_path}")
    print("=" * 70)

if __name__ == "__main__":
    main()
