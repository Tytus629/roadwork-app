/**
 * decode.ts — pure output decoders + NMS for common TFLite detector exports.
 *  - YOLOv8/YOLO11 TFLite: one output [1, 4+nc, N] (or [1, N, 4+nc]); boxes cx,cy,w,h in input pixels or 0..1.
 *  - EfficientDet-Lite / MediaPipe Model Maker: 4 outputs boxes[1,N,4](ymin,xmin,ymax,xmax 0..1), classes[1,N], scores[1,N], count[1].
 */
import { DAMAGE_CLASSES, type Box, type DamageClass, type Detection } from "./types";
import type { Letterbox } from "./imagePrep";

export function iou(a: Box, b: Box) {
  const x1 = Math.max(a.x, b.x), y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w), y2 = Math.min(a.y + a.h, b.y + b.h);
  const inter = Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
  const u = a.w * a.h + b.w * b.h - inter;
  return u > 0 ? inter / u : 0;
}

/** Class-wise greedy NMS. */
export function nms(dets: Detection[], iouThresh = 0.5, maxDet = 50): Detection[] {
  const out: Detection[] = [];
  for (const d of [...dets].sort((a, b) => b.score - a.score)) {
    if (out.every((o) => o.cls !== d.cls || iou(o.box, d.box) < iouThresh)) out.push(d);
    if (out.length >= maxDet) break;
  }
  return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
function clampBox(b: Box): Box | null {
  const x = clamp01(b.x), y = clamp01(b.y);
  const w = clamp01(b.x + b.w) - x, h = clamp01(b.y + b.h) - y;
  return w > 0 && h > 0 ? { x, y, w, h } : null;
}

/** Undo letterboxing: model-input-normalized box → original-image-normalized box. */
export function unletterbox(b: Box, lb: Letterbox): Box {
  const px = b.x * lb.size, py = b.y * lb.size, pw = b.w * lb.size, ph = b.h * lb.size;
  return {
    x: (px - lb.padX) / (lb.scale * lb.srcW),
    y: (py - lb.padY) / (lb.scale * lb.srcH),
    w: pw / (lb.scale * lb.srcW),
    h: ph / (lb.scale * lb.srcH),
  };
}

export function decodeYolo(out: Float32Array, shape: number[], opts: { numClasses?: number; scoreThresh?: number; inputSize: number; letterbox?: Letterbox; classMap?: DamageClass[] }): Detection[] {
  const nc = opts.numClasses ?? 4;
  const classMap = opts.classMap ?? DAMAGE_CLASSES;
  const th = opts.scoreThresh ?? 0.25;
  const [, a, b] = shape.length === 3 ? shape : [1, ...shape];
  const channelsFirst = a === 4 + nc; // [1, 4+nc, N]
  const n = channelsFirst ? b : a;
  const get = (i: number, c: number) => (channelsFirst ? out[c * n + i] : out[i * (4 + nc) + c]);
  const dets: Detection[] = [];
  for (let i = 0; i < n; i++) {
    let best = -1, bestS = 0;
    for (let c = 0; c < nc; c++) {
      const s = get(i, 4 + c);
      if (s > bestS) { bestS = s; best = c; }
    }
    if (best < 0 || bestS < th || !classMap[best]) continue;
    let cx = get(i, 0), cy = get(i, 1), w = get(i, 2), h = get(i, 3);
    if (Math.max(cx, cy, w, h) > 2) { cx /= opts.inputSize; cy /= opts.inputSize; w /= opts.inputSize; h /= opts.inputSize; }
    let box: Box = { x: cx - w / 2, y: cy - h / 2, w, h };
    if (opts.letterbox) box = unletterbox(box, opts.letterbox);
    const cb = clampBox(box);
    if (cb) dets.push({ cls: classMap[best], score: bestS, box: cb });
  }
  return nms(dets);
}

export function decodeEfficientDet(outs: { boxes: Float32Array; classes: Float32Array; scores: Float32Array; count: number }, opts: { scoreThresh?: number; letterbox?: Letterbox; classMap?: DamageClass[] }): Detection[] {
  const classMap = opts.classMap ?? DAMAGE_CLASSES;
  const th = opts.scoreThresh ?? 0.3;
  const dets: Detection[] = [];
  const n = Math.min(outs.count, outs.scores.length);
  for (let i = 0; i < n; i++) {
    const s = outs.scores[i];
    const cls = classMap[Math.round(outs.classes[i])];
    if (s < th || !cls) continue;
    const [ymin, xmin, ymax, xmax] = [outs.boxes[i * 4], outs.boxes[i * 4 + 1], outs.boxes[i * 4 + 2], outs.boxes[i * 4 + 3]];
    let box: Box = { x: xmin, y: ymin, w: xmax - xmin, h: ymax - ymin };
    if (opts.letterbox) box = unletterbox(box, opts.letterbox);
    const cb = clampBox(box);
    if (cb) dets.push({ cls, score: s, box: cb });
  }
  return nms(dets);
}
