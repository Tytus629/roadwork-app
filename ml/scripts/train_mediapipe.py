#!/usr/bin/env python3
"""Fine-tune EfficientDet-Lite0 with MediaPipe Model Maker (Apache-2.0) and export int8 TFLite.

Input: COCO folders from prepare_rdd2022.py --format coco  (<data>/train, <data>/val each with images/ + labels.json)
Output: exported/road_damage.tflite + road_damage.json
Needs a GPU for reasonable time (Colab free tier works). Not run on the shared box.
"""
import argparse, json
from pathlib import Path

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", required=True); ap.add_argument("--epochs", type=int, default=50)
    ap.add_argument("--batch", type=int, default=16); ap.add_argument("--out", default="exported")
    a = ap.parse_args()
    from mediapipe_model_maker import object_detector, quantization  # noqa: lazy import
    train = object_detector.Dataset.from_coco_folder(str(Path(a.data) / "train"), cache_dir="/tmp/mm_train")
    val = object_detector.Dataset.from_coco_folder(str(Path(a.data) / "val"), cache_dir="/tmp/mm_val")
    opts = object_detector.ObjectDetectorOptions(
        supported_model=object_detector.SupportedModels.MOBILENET_MULTI_AVG,  # 320px, mobile friendly, Apache-2.0
        hparams=object_detector.HParams(epochs=a.epochs, batch_size=a.batch, export_dir=a.out),
    )
    model = object_detector.ObjectDetector.create(train_data=train, validation_data=val, options=opts)
    loss, coco_metrics = model.evaluate(val, batch_size=a.batch)
    print("val", loss, coco_metrics)
    model.export_model("road_damage_fp32.tflite")
    model.restore_float_ckpt()
    model.quantization_aware_training(train, val, epochs=max(5, a.epochs // 5), batch_size=a.batch, learning_rate=0.3)
    model.export_model("road_damage.tflite", quantization_config=quantization.QuantizationConfig.for_int8(train))
    Path(a.out, "road_damage.json").write_text(json.dumps({
        "name": "rdd-mp-mobilenet", "version": "dev", "format": "efficientdet", "inputSize": 256, "inputType": "uint8", "scoreThresh": 0.35,
        "license": "model code Apache-2.0; trained on RDD2022 (CC BY-SA 4.0) — attribution required",
    }, indent=2))

if __name__ == "__main__":
    main()
