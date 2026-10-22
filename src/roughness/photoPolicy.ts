/**
 * photoPolicy.ts — pure scheduling + storage-cap pruning for Drive Mode photos.
 * No RN imports; unit tested.
 */
import { haversineMeters } from "../tools/measure/haversine";

export type PhotoMode = "off" | "time" | "distance";
export type PhotoSettings = {
  mode: PhotoMode;
  everySeconds: number; // time mode
  everyMeters: number; // distance mode
  photoOnBump: boolean;
  minGapMs: number; // never shoot faster than this (heat / storage)
  storageCapMb: number;
};
export const DEFAULT_PHOTO_SETTINGS: PhotoSettings = {
  mode: "off",
  everySeconds: 10,
  everyMeters: 50,
  photoOnBump: true,
  minGapMs: 2000,
  storageCapMb: 500,
};

export type CaptureReason = "timed" | "distance" | "bump";

/** Decides when to shoot. Feed it GPS fixes (tick) and bumps; it returns a reason or null. */
export class PhotoScheduler {
  private lastShotT = -Infinity;
  private lastShotPos: { lat: number; lng: number } | null = null;
  private distSinceShot = 0;
  private lastPos: { lat: number; lng: number } | null = null;
  private busy = false;
  constructor(private s: PhotoSettings = DEFAULT_PHOTO_SETTINGS) {}

  update(settings: PhotoSettings) {
    this.s = settings;
  }

  /** Call when a capture starts/ends so overlapping shots are skipped. */
  setBusy(b: boolean) {
    this.busy = b;
  }

  private canShoot(t: number) {
    return !this.busy && t - this.lastShotT >= Math.max(500, this.s.minGapMs);
  }

  private mark(t: number) {
    this.lastShotT = t;
    this.lastShotPos = this.lastPos;
    this.distSinceShot = 0;
  }

  onFix(t: number, pos: { lat: number; lng: number }): CaptureReason | null {
    if (this.lastPos) this.distSinceShot += haversineMeters(this.lastPos, pos);
    this.lastPos = pos;
    if (this.s.mode === "off" || !this.canShoot(t)) return null;
    if (this.s.mode === "time" && t - this.lastShotT >= this.s.everySeconds * 1000) {
      this.mark(t);
      return "timed";
    }
    if (this.s.mode === "distance" && (this.lastShotPos == null || this.distSinceShot >= this.s.everyMeters)) {
      this.mark(t);
      return "distance";
    }
    return null;
  }

  onBump(t: number): CaptureReason | null {
    if (!this.s.photoOnBump || this.busy) return null;
    // Bumps may preempt the min gap down to 500 ms — the bump frame matters most.
    if (t - this.lastShotT < 500) return null;
    this.mark(t);
    return "bump";
  }
}

export type StoredPhoto = {
  id: string;
  capturedAt: number;
  sizeBytes: number;
  reason: CaptureReason;
  uploadedAt: number | null; // safe copy in Firebase Storage
  willSync: boolean; // false when there's no org (local-only)
  linkedToWorkOrder: boolean; // attached to a work-order draft/record — never pruned here
};

/**
 * Oldest-first pruning until total <= cap. Order of victims:
 *   1. already uploaded (cloud copy exists) or local-only timed/distance photos
 *   2. not-yet-uploaded timed/distance photos (lose route context only)
 * Never prunes: bump photos that aren't uploaded yet, or photos linked to a work order.
 */
export function planPrune(photos: StoredPhoto[], capBytes: number): string[] {
  let total = photos.reduce((a, p) => a + Math.max(0, p.sizeBytes), 0);
  if (total <= capBytes) return [];
  const safe = (p: StoredPhoto) => !p.linkedToWorkOrder && (p.uploadedAt != null || (!p.willSync && p.reason !== "bump"));
  const lossy = (p: StoredPhoto) => !p.linkedToWorkOrder && p.uploadedAt == null && p.reason !== "bump" && p.willSync;
  const byAge = (a: StoredPhoto, b: StoredPhoto) => a.capturedAt - b.capturedAt;
  const order = [...photos.filter(safe).sort(byAge), ...photos.filter(lossy).sort(byAge)];
  const out: string[] = [];
  for (const p of order) {
    if (total <= capBytes) break;
    out.push(p.id);
    total -= Math.max(0, p.sizeBytes);
  }
  return out;
}
