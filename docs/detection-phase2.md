# Phase 2 groundwork — photo damage detection, 1–5 rating, privacy blur

**Status:** IMPLEMENTED (pipeline, storage, map, export, rating, blur engine) · LOCALLY TESTED (unit tests) ·
**NOT TESTED on device · NO MODEL SHIPPED** → in the app today, detection and blur are graceful no-ops.

## Detection pipeline
- Interface `RoadDamageDetector` (`src/detection/types.ts`); default implementation = TFLite via
  `react-native-fast-tflite` 1.6.1 (MIT, JSI; 2.x/3.x need Nitro modules — upgrade later with the new-arch move).
- Runs on **saved drive photos after a drive stops** (not live video) — one photo at a time with a UI yield, ≤60 per drive.
- Pre-processing: jpeg-js decode → letterbox to model size. Decoders for YOLOv8/11 single-output and
  EfficientDet-Lite/MediaPipe 4-output exports, class-wise NMS, letterbox undo.
- Model drop-in: `Documents/models/road_damage.tflite` + optional `road_damage.json` (`format`, `inputSize`, `inputType`, `scoreThresh`, `name`, `version`). Missing/invalid → disabled, logged once.
- Classes (RDD2022): D00 longitudinal, D10 transverse, D20 alligator, D40 pothole.
- Storage: `drive_detections` (migration 16, new table) linked to photo, session and segment (photo time inside segment window, else nearest ≤15 s). `drive_photos` gains `detectedAt`, `detectorVersion`, `blurredAt` via addColumnIfMissing (additive).
- Map: violet pins on the Road Condition Map ("screening"). Summary shows photo-AI flags + average screening rating.
- Export: new dataset **Photo damage detections** (CSV/GeoJSON, DISTRESS_CODE/TYPE, CONFIDENCE, bbox, MODEL, DATA_QUALITY=UNCALIBRATED_SCREENING); segment export gains SCREEN_RATING_1_5, DETECTED_DISTRESS, PHOTOS_ANALYSED.
- Not synced to Firestore yet (design: `orgs/{orgId}/driveDetections`, same owner-write rules pattern).

## 1–5 screening rating (uncalibrated — NOT PCI, NOT CRAB/VisRate)
`rating = clamp(round(5 − roughnessPenalty − distressPenalty), 1, 5)`, 5 = good.
- roughnessPenalty: smooth 0 · fair 1 · rough 2 · very rough 3
- distressPenalty (detections ≥ 0.4 confidence, once per class per segment, only if ≥1 photo was analysed): D40 1.5 · D20 1.0 · D10 0.5 · D00 0.5, capped at 2.5
- null when neither roughness nor analysed photos exist.
Weights are starting guesses; calibrate against county-rated roads before using for anything but screening.

## Privacy blur
- `src/detection/blur.ts`: `RegionDetector` interface, pure **pixelation** (mosaic, padded boxes), `redactImage()` fails closed (reports not blurred on error).
- Pipeline (in `analyseSessionPhotos`): decode → detect faces/plates → pixelate → re-encode JPEG in place → `blurredAt` set — **before** damage detection, before export/upload would ideally run.
- **No detector shipped**, so blur is currently a no-op and photos stay `blurred: false`.
- License-clean plan: faces — MediaPipe **BlazeFace short-range** (Apache-2.0, ~200 KB TFLite) as a `RegionDetector`; plates — no well-known permissive plate model → train one with the `ml/` kit (MediaPipe Model Maker, Apache-2.0) on a permissively licensed plate dataset, or use a county-approved vendor.
- Gap to close before rollout: uploads currently happen right after capture; once blur exists, gate `UPLOAD_DRIVE_PHOTO` on `blurredAt` (or blur at capture time).

## Licensing finding (summary — see ml/README.md)
- RDD2022: **CC BY-SA 4.0** — commercial use OK with attribution; share-alike on adapted data; weights' status unsettled → legal review before selling a model trained on it.
- Ultralytics YOLO: **AGPL-3.0** incl. weights → don't ship in a closed paid app without an Enterprise license. Use **MediaPipe Model Maker / EfficientDet-Lite (Apache-2.0)**, YOLOX or RT-DETR (Apache-2.0) instead.
- App deps added: react-native-fast-tflite (MIT), jpeg-js (BSD-3), buffer (MIT).
