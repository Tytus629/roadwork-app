/**
 * blur.ts — privacy redaction for drive photos.
 * Pure pixelation (no deps) + pluggable detectors. Ships with NO detector models:
 * without models, redactPhoto() is a no-op and reports blurred=false.
 * License-clean candidates (see docs/detection-phase2.md): MediaPipe BlazeFace short-range (Apache-2.0) for faces;
 * plates need a custom model (train with the ml/ kit on a permissively licensed plate dataset).
 */
import type { Box, RgbaImage } from "./types";

export interface RegionDetector {
  readonly name: string;
  detect(img: RgbaImage): Promise<Box[]>; // normalized boxes
}

/** Pixelate (mosaic) boxes in place. block = cell size in px. Expands boxes by pad fraction. */
export function pixelate(img: RgbaImage, boxes: Box[], block = 12, pad = 0.15): number {
  let changed = 0;
  for (const b of boxes) {
    const x0 = Math.max(0, Math.floor((b.x - b.w * pad) * img.width));
    const y0 = Math.max(0, Math.floor((b.y - b.h * pad) * img.height));
    const x1 = Math.min(img.width, Math.ceil((b.x + b.w * (1 + pad)) * img.width));
    const y1 = Math.min(img.height, Math.ceil((b.y + b.h * (1 + pad)) * img.height));
    for (let by = y0; by < y1; by += block) {
      for (let bx = x0; bx < x1; bx += block) {
        const ex = Math.min(x1, bx + block), ey = Math.min(y1, by + block);
        const sum = [0, 0, 0];
        let n = 0;
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
          const i = (y * img.width + x) * 4;
          sum[0] += img.data[i]; sum[1] += img.data[i + 1]; sum[2] += img.data[i + 2]; n++;
        }
        if (!n) continue;
        const avg = sum.map((s) => Math.round(s / n));
        for (let y = by; y < ey; y++) for (let x = bx; x < ex; x++) {
          const i = (y * img.width + x) * 4;
          img.data[i] = avg[0]; img.data[i + 1] = avg[1]; img.data[i + 2] = avg[2];
        }
        changed++;
      }
    }
  }
  return changed;
}

export async function redactImage(img: RgbaImage, detectors: RegionDetector[]): Promise<{ boxes: Box[]; blurred: boolean }> {
  if (!detectors.length) return { boxes: [], blurred: false };
  const boxes: Box[] = [];
  for (const d of detectors) {
    try {
      boxes.push(...(await d.detect(img)));
    } catch (e) {
      console.warn(`[blur] ${d.name} failed`, e);
      return { boxes: [], blurred: false }; // fail closed: report not blurred
    }
  }
  pixelate(img, boxes);
  return { boxes, blurred: true };
}
