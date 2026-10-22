/**
 * rating.ts — 1–5 segment SCREENING rating combining roughness + photo detections.
 * 5 = good … 1 = poor (same direction as many county visual scales). UNCALIBRATED:
 * NOT PCI, NOT a CRAB/VisRate rating. Weights are starting guesses to tune on real data.
 *
 *  roughnessPenalty: smooth 0, fair 1, rough 2, very_rough 3
 *  distressPenalty (per segment, from detections with score ≥ minScore, deduplicated per class):
 *     D40 pothole 1.5, D20 alligator 1.0, D10 transverse 0.5, D00 longitudinal 0.5 — capped at 2.5
 *  rating = clamp(round(5 − roughnessPenalty − distressPenalty), 1, 5)
 *  If neither roughness nor photos are available → null.
 */
import type { DamageClass } from "./types";
import type { RoughnessClass } from "../roughness/signal";

export const ROUGHNESS_PENALTY: Record<RoughnessClass, number> = { smooth: 0, fair: 1, rough: 2, very_rough: 3 };
export const DISTRESS_WEIGHT: Record<DamageClass, number> = { D40: 1.5, D20: 1.0, D10: 0.5, D00: 0.5 };
export const DISTRESS_CAP = 2.5;

export type RatingInput = {
  roughnessClass?: RoughnessClass | null;
  detections?: Array<{ cls: DamageClass; score: number }>;
  photosChecked?: number; // photos analysed for this segment
  minScore?: number;
};

export function distressPenalty(dets: RatingInput["detections"] = [], minScore = 0.4) {
  const seen = new Set<DamageClass>();
  for (const d of dets) if (d.score >= minScore) seen.add(d.cls);
  let p = 0;
  seen.forEach((c) => (p += DISTRESS_WEIGHT[c]));
  return Math.min(DISTRESS_CAP, p);
}

export function segmentRating(i: RatingInput): number | null {
  const hasRough = !!i.roughnessClass;
  const hasPhotos = (i.photosChecked ?? 0) > 0;
  if (!hasRough && !hasPhotos) return null;
  const r = hasRough ? ROUGHNESS_PENALTY[i.roughnessClass!] : 0;
  const d = hasPhotos ? distressPenalty(i.detections, i.minScore) : 0;
  return Math.min(5, Math.max(1, Math.round(5 - r - d)));
}

/** Attach a photo/detection to the segment whose time window contains it (else nearest). */
export function segmentForTime<T extends { id: string; startedAt: number; endedAt: number }>(segs: T[], t: number): T | null {
  let best: T | null = null, bestGap = Infinity;
  for (const s of segs) {
    if (t >= s.startedAt && t <= s.endedAt) return s;
    const gap = Math.min(Math.abs(t - s.startedAt), Math.abs(t - s.endedAt));
    if (gap < bestGap) { bestGap = gap; best = s; }
  }
  return bestGap <= 15000 ? best : null;
}
