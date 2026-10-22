# WayCrew road-damage model kit (Phase 2)

Train a small on-device detector for the 4 RDD2022 / CRDDC'2022 classes and export TFLite for the app.

| Class | Meaning |
|---|---|
| D00 | Longitudinal crack |
| D10 | Transverse crack |
| D20 | Alligator crack |
| D40 | Pothole |

**No weights are committed.** The app runs without a model (detection silently disabled). To try a model, copy
`road_damage.tflite` (+ optional `road_damage.json`) to the app's `Documents/models/` folder.

## ⚠️ Licensing — read before training or selling

| Component | License | What it means for WayCrew |
|---|---|---|
| **RDD2022 dataset** (Arya et al., figshare 10.6084/m9.figshare.21431547) | **CC BY-SA 4.0** | Commercial use allowed **with attribution**. Share-alike applies to redistributed/adapted *data*. Whether trained weights are an "adaptation" is legally unsettled → get counsel before selling a model trained on it; always credit the authors. |
| **Ultralytics YOLOv8/YOLO11** (code **and** pretrained/fine-tuned weights) | **AGPL-3.0** (or paid Ultralytics Enterprise license) | Shipping an AGPL-trained model inside a closed-source paid app generally requires releasing the app source under AGPL **or** buying an Enterprise license. Fine for internal experiments/benchmarks. |
| **MediaPipe Model Maker / EfficientDet-Lite** | **Apache-2.0** | ✅ Recommended for a commercial product. Exports TFLite directly. |
| YOLOX (Megvii) | Apache-2.0 | ✅ Alternative (export via ONNX → TFLite). |
| RT-DETR (PaddleDetection / lyuwenyu) | Apache-2.0 | ✅ Alternative, heavier. |
| react-native-fast-tflite | MIT | ✅ Used by the app. |
| jpeg-js / buffer | BSD-3 / MIT | ✅ Used by the app. |
| MediaPipe BlazeFace (face blur) | Apache-2.0 | ✅ Candidate for privacy blur (not shipped). |

**Recommendation:** if WayCrew will be sold, use `scripts/train_mediapipe.py` (Apache-2.0 stack). Keep
`scripts/train_ultralytics.py` for internal accuracy comparisons only, unless Kyle buys an Ultralytics license.

## Steps
1. Download RDD2022 yourself from figshare (≈ 12 GB; not done on the shared box). Optionally only `United_States` + `Norway` + `Czech` subsets — closest to WA roads.
2. Convert: `python scripts/prepare_rdd2022.py --src RDD2022/United_States/train --out data/us --format yolo|coco --val 0.15`
3. Train:
   - Apache path: `python scripts/train_mediapipe.py --data data/us_coco --epochs 50` → `exported/road_damage.tflite` (EfficientDet-Lite0, 320 px, int8)
   - AGPL path (internal only): `python scripts/train_ultralytics.py --data data/us/data.yaml --model yolov8n.pt --imgsz 640 --epochs 100`
4. Write `road_damage.json`, e.g. `{"name":"rdd-effdet-lite0","version":"2026.10","format":"efficientdet","inputSize":320,"inputType":"uint8","scoreThresh":0.35}`
5. Validate on held-out **Washington** photos from Drive Mode before trusting it; publish precision/recall per class.

## Smoke test (runs on the box, no downloads)
`python scripts/smoke_test.py` — builds a synthetic VOC sample, converts it, checks labels. Training itself is not run here.
