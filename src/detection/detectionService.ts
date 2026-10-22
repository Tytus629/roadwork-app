/**
 * detectionService.ts — runs the optional on-device detector on SAVED drive photos
 * after a drive stops (not live video → less heat). No model file → graceful no-op.
 *
 * Model drop-in: put `road_damage.tflite` (+ optional `road_damage.json` meta) in
 * DocumentDirectory/models/. Supported exports: YOLOv8/11 (single output) or
 * EfficientDet-Lite / MediaPipe Model Maker (4 outputs). See ml/README.md.
 */
import RNFS from "react-native-fs";
import { db } from "../db/db";
import { listDriveSegments } from "../repositories/roughnessRepo";
import { detectionToRow, insertDetections } from "../repositories/detectionsRepo";
import { decodeEfficientDet, decodeYolo } from "./decode";
import { base64ToBytes, bytesToBase64, decodeJpeg, encodeJpeg, letterbox } from "./imagePrep";
import { segmentForTime } from "./rating";
import { redactImage, type RegionDetector } from "./blur";
import type { Detection, RgbImage, RoadDamageDetector } from "./types";

export const MODEL_DIR = `${RNFS.DocumentDirectoryPath}/models`;
const MODEL_PATH = `${MODEL_DIR}/road_damage.tflite`;
const META_PATH = `${MODEL_DIR}/road_damage.json`;

type Meta = { name?: string; version?: string; inputSize?: number; format?: "yolo" | "efficientdet"; scoreThresh?: number; inputType?: "float32" | "uint8" };

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}

let cached: RoadDamageDetector | null | undefined;

/** Loads the TFLite detector if a model file exists; otherwise null (feature off). */
export async function getRoadDamageDetector(): Promise<RoadDamageDetector | null> {
  if (cached !== undefined) return cached;
  try {
    if (!(await RNFS.exists(MODEL_PATH))) return (cached = null);
    const meta: Meta = (await RNFS.exists(META_PATH)) ? JSON.parse(await RNFS.readFile(META_PATH, "utf8")) : {};
    const { loadTensorflowModel } = require("react-native-fast-tflite");
    const model = await loadTensorflowModel({ url: `file://${MODEL_PATH}` }, "default");
    const size = meta.inputSize ?? model.inputs?.[0]?.shape?.[1] ?? 640;
    const inputType = meta.inputType ?? (model.inputs?.[0]?.dataType === "uint8" ? "uint8" : "float32");
    const format = meta.format ?? (model.outputs?.length >= 4 ? "efficientdet" : "yolo");
    cached = {
      name: meta.name ?? "road_damage",
      version: meta.version ?? "unknown",
      async detect(img: RgbImage): Promise<Detection[]> {
        const { tensor, lb } = letterbox(img as any, size, inputType);
        const outs = await model.run([tensor]);
        if (format === "efficientdet") {
          return decodeEfficientDet({ boxes: outs[0] as Float32Array, classes: outs[1] as Float32Array, scores: outs[2] as Float32Array, count: Number((outs[3] as Float32Array)[0]) }, { scoreThresh: meta.scoreThresh, letterbox: lb });
        }
        return decodeYolo(outs[0] as Float32Array, model.outputs[0].shape, { inputSize: size, scoreThresh: meta.scoreThresh, letterbox: lb });
      },
    };
    return cached;
  } catch (e) {
    console.warn("[detection] model load failed; detection disabled", e);
    return (cached = null);
  }
}

/** Privacy detectors (faces/plates). None shipped → empty list → redaction no-op. */
export async function getPrivacyDetectors(): Promise<RegionDetector[]> {
  return [];
}

/**
 * Analyse up to `limit` un-analysed photos of a session: redact (if detectors exist),
 * then detect damage and store results linked to photo + segment.
 */
export async function analyseSessionPhotos(sessionId: string, limit = 60): Promise<{ analysed: number; detections: number; skipped: string | null }> {
  const detector = await getRoadDamageDetector();
  const privacy = await getPrivacyDetectors();
  if (!detector && !privacy.length) return { analysed: 0, detections: 0, skipped: "no_model" };
  // jpeg-js's encoder needs Buffer, which RN doesn't provide.
  if (!(globalThis as any).Buffer) (globalThis as any).Buffer = require("buffer").Buffer;
  const photos = rows(db.executeSync(
    `SELECT * FROM drive_photos WHERE sessionId = ? AND prunedAt IS NULL AND detectedAt IS NULL ORDER BY capturedAt LIMIT ?;`, [sessionId, limit]));
  const segs = listDriveSegments({ sessionId }, 100000);
  let total = 0;
  for (const p of photos) {
    const path = String(p.localUri).replace(/^file:\/\//, "");
    try {
      const img = decodeJpeg(base64ToBytes(await RNFS.readFile(path, "base64")));
      if (privacy.length && !p.blurredAt) {
        const r = await redactImage(img, privacy);
        if (r.blurred) {
          await RNFS.writeFile(path, bytesToBase64(encodeJpeg(img, 80)), "base64");
          db.executeSync(`UPDATE drive_photos SET blurredAt = ? WHERE id = ?;`, [Date.now(), p.id]);
        }
      }
      if (detector) {
        const dets = await detector.detect(img);
        const seg = segmentForTime(segs, p.capturedAt);
        insertDetections(dets.map((d) => detectionToRow(d, { photoId: p.id, sessionId, segmentId: seg?.id ?? null, lat: p.lat, lng: p.lng, modelName: detector.name, modelVersion: detector.version, now: Date.now() })));
        db.executeSync(`UPDATE drive_photos SET detectedAt = ?, detectorVersion = ? WHERE id = ?;`, [Date.now(), `${detector.name}@${detector.version}`, p.id]);
        total += dets.length;
      }
    } catch (e) {
      console.warn("[detection] photo failed", p.id, e);
    }
    await new Promise<void>((r) => setTimeout(() => r(), 50)); // yield to UI between photos
  }
  return { analysed: photos.length, detections: total, skipped: null };
}
