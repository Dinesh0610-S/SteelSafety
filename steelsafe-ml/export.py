import sys
from pathlib import Path
from ultralytics import YOLO

def main():
    base_dir = Path(__file__).resolve().parent
    weights_path = base_dir / "runs" / "ppe_v8n" / "weights" / "best.pt"

    if not weights_path.exists():
        raise FileNotFoundError(
            f"Weights file not found at {weights_path}. Please complete training first."
        )

    print(f"Loading best weights from: {weights_path}")
    model = YOLO(str(weights_path))

    # Print class index to class name mapping
    print("\n" + "=" * 50)
    print("CLASS INDEX TO CLASS NAME MAPPING")
    print("=" * 50)
    for idx, name in sorted(model.names.items()):
        print(f"Index {idx} -> '{name}'")
    print("=" * 50)

    # Export to ONNX
    print("\nExporting model to ONNX format (imgsz=416, opset=12, simplify=True)...")
    try:
        exported_path = model.export(
            format="onnx",
            imgsz=416,
            opset=12,
            simplify=True
        )
        print(f"\nONNX export successful: {exported_path}")
    except Exception as e:
        print(f"\nStandard export encountered an issue: {e}")
        print("Retrying export without simplify...")
        exported_path = model.export(
            format="onnx",
            imgsz=416,
            opset=12,
            simplify=False
        )
        print(f"\nONNX export successful without simplify: {exported_path}")

    # Verify ONNX model with onnxruntime
    try:
        import onnxruntime as ort
        session = ort.InferenceSession(str(exported_path))
        input_names = [i.name for i in session.get_inputs()]
        input_shapes = [i.shape for i in session.get_inputs()]
        output_names = [o.name for o in session.get_outputs()]
        output_shapes = [o.shape for o in session.get_outputs()]
        print("\nONNX Model Verification:")
        print(f"  Inputs:  {input_names} | Shapes: {input_shapes}")
        print(f"  Outputs: {output_names} | Shapes: {output_shapes}")
        print("ONNX model loaded successfully into onnxruntime!")
    except Exception as e:
        print(f"Note: ONNX runtime verification test skipped/warning: {e}")

if __name__ == "__main__":
    main()
