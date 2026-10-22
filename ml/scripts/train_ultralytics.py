#!/usr/bin/env python3
"""INTERNAL BENCHMARK ONLY — Ultralytics is AGPL-3.0 (code AND weights).
Do not ship the resulting model in a closed-source/paid app without an Ultralytics Enterprise license.

python train_ultralytics.py --data data/us/data.yaml --model yolov8n.pt --imgsz 640 --epochs 100
Exports int8 TFLite (`*_int8.tflite`) usable by the app's YOLO decoder.
"""
import argparse, sys

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--model", default="yolov8n.pt")
    ap.add_argument("--imgsz", type=int, default=640); ap.add_argument("--epochs", type=int, default=100)
    ap.add_argument("--i-understand-agpl", action="store_true")
    a = ap.parse_args()
    if not a.i_understand_agpl:
        sys.exit("Refusing: pass --i-understand-agpl (AGPL-3.0; internal use only, see ml/README.md)")
    from ultralytics import YOLO  # noqa
    m = YOLO(a.model)
    m.train(data=a.data, imgsz=a.imgsz, epochs=a.epochs, batch=16, patience=20)
    print(m.export(format="tflite", imgsz=a.imgsz, int8=True, data=a.data))

if __name__ == "__main__":
    main()
