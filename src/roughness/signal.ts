/**
 * signal.ts — Pure signal processing for Drive Mode road roughness logging.
 *
 * IMPORTANT: Everything here produces an UNCALIBRATED roughness ESTIMATE for
 * screening only. It is NOT IRI (International Roughness Index), NOT PCI and
 * NOT a CRAB/VisRate rating. Values depend on vehicle suspension, tyre
 * pressure, phone mount and speed. Use it to find spots worth a closer look.
 *
 * No React Native imports here so it can be unit tested with synthetic data.
 */
import { haversineMeters, type LatLng } from "../tools/measure/haversine";

export type Vec3 = { x: number; y: number; z: number };
export type ImuSample = { t: number; accel: Vec3; gyro?: Vec3 | null }; // t = epoch ms, accel m/s^2 incl. gravity
export type GpsFix = { t: number; lat: number; lng: number; speedMps: number | null; accuracyM?: number | null };

export const G = 9.80665;

/** Defaults; tuned conservatively, all overridable. */
export const ROUGHNESS_DEFAULTS = {
  gravityAlpha: 0.98, // low-pass factor at ~100 Hz (time constant ~0.5 s)
  segmentLengthM: 100,
  referenceSpeedMps: 13.4, // ~30 mph — roughness is normalized to this speed
  minSpeedMps: 4.5, // ~10 mph: below this we do not score samples
  speedBandMinMps: 8.9, // ~20 mph
  speedBandMaxMps: 20.1, // ~45 mph
  spikeThresholdMps2: 4.0, // ~0.4 g vertical deviation
  spikeRefractoryMs: 1000,
  mountGyroRmsMaxRadS: 0.6,
  mountTiltChangeMaxDeg: 20,
};

const len = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;

/**
 * Exponential low-pass gravity estimator. linear = raw - gravity; vertical is
 * the linear acceleration projected onto the gravity direction (positive = up
 * relative to the road), so it is independent of how the phone is rotated in
 * the mount, as long as the mount is rigid.
 */
export class GravityFilter {
  private g: Vec3 | null = null;
  constructor(private alpha = ROUGHNESS_DEFAULTS.gravityAlpha) {}
  get gravity(): Vec3 | null {
    return this.g;
  }
  push(a: Vec3): { linear: Vec3; vertical: number; gravity: Vec3 } {
    if (!this.g) this.g = { ...a };
    else {
      const k = this.alpha;
      this.g = { x: k * this.g.x + (1 - k) * a.x, y: k * this.g.y + (1 - k) * a.y, z: k * this.g.z + (1 - k) * a.z };
    }
    const linear = { x: a.x - this.g.x, y: a.y - this.g.y, z: a.z - this.g.z };
    const gl = len(this.g) || 1;
    const unit = { x: this.g.x / gl, y: this.g.y / gl, z: this.g.z / gl };
    return { linear, vertical: dot(linear, unit), gravity: { ...this.g } };
  }
}

export function removeGravity(samples: Vec3[], alpha = ROUGHNESS_DEFAULTS.gravityAlpha): number[] {
  const f = new GravityFilter(alpha);
  return samples.map((s) => f.push(s).vertical);
}

/** rms(verticalAccel) * (referenceSpeed / speed). Uncalibrated, m/s^2-equivalent. */
export function normalizeRoughness(rms: number, speedMps: number, cfg = ROUGHNESS_DEFAULTS): number {
  const v = Math.max(speedMps, cfg.minSpeedMps);
  return rms * (cfg.referenceSpeedMps / v);
}

export type RoughnessClass = "smooth" | "fair" | "rough" | "very_rough";
export function classifyRoughness(index: number): RoughnessClass {
  if (index < 0.6) return "smooth";
  if (index < 1.2) return "fair";
  if (index < 2.0) return "rough";
  return "very_rough";
}
export const ROUGHNESS_COLORS: Record<RoughnessClass, string> = {
  smooth: "#16a34a",
  fair: "#eab308",
  rough: "#f97316",
  very_rough: "#dc2626",
};
export const ROUGHNESS_LABELS: Record<RoughnessClass, string> = {
  smooth: "Smooth (< 0.6)",
  fair: "Fair (0.6–1.2)",
  rough: "Rough (1.2–2.0)",
  very_rough: "Very rough (≥ 2.0)",
};

export type Segment = {
  index: number;
  startT: number;
  endT: number;
  start: LatLng;
  end: LatLng;
  path: LatLng[];
  lengthM: number;
  sampleCount: number;
  rmsVertical: number;
  meanSpeedMps: number;
  roughnessIndex: number;
  roughnessClass: RoughnessClass;
};

/**
 * Accumulates vertical-accel samples and GPS fixes and closes a segment every
 * `segmentLengthM` of travelled distance. Samples taken below minSpeed are ignored.
 */
export class Segmenter {
  private segIndex = 0;
  private path: LatLng[] = [];
  private distM = 0;
  private sumSq = 0;
  private n = 0;
  private speedSum = 0;
  private speedN = 0;
  private startT = 0;
  private lastFix: GpsFix | null = null;
  constructor(private cfg = ROUGHNESS_DEFAULTS) {}

  get currentSpeed(): number | null {
    return this.lastFix?.speedMps ?? null;
  }
  get lastLocation(): LatLng | null {
    return this.lastFix ? { lat: this.lastFix.lat, lng: this.lastFix.lng } : null;
  }

  addVertical(_t: number, vertical: number) {
    const v = this.lastFix?.speedMps;
    if (v == null || v < this.cfg.minSpeedMps || this.path.length === 0) return;
    this.sumSq += vertical * vertical;
    this.n++;
  }

  /** Returns a completed segment when this fix crosses the segment length. */
  addFix(fix: GpsFix): Segment | null {
    const p = { lat: fix.lat, lng: fix.lng };
    let speed = fix.speedMps;
    if ((speed == null || speed < 0) && this.lastFix) {
      const dt = (fix.t - this.lastFix.t) / 1000;
      speed = dt > 0 ? haversineMeters(this.lastFix, p) / dt : null;
    }
    const normalized: GpsFix = { ...fix, speedMps: speed ?? null };
    if (!this.lastFix || this.path.length === 0) {
      this.lastFix = normalized;
      this.path = [p];
      this.startT = fix.t;
      return null;
    }
    this.distM += haversineMeters(this.lastFix, p);
    this.path.push(p);
    if (speed != null) {
      this.speedSum += speed;
      this.speedN++;
    }
    this.lastFix = normalized;
    if (this.distM >= this.cfg.segmentLengthM) return this.close(fix.t);
    return null;
  }

  /** Close the in-progress segment (e.g. on stop). Returns null if too short/empty. */
  flush(minLengthM = 20): Segment | null {
    if (this.path.length < 2 || this.distM < minLengthM || !this.lastFix) return null;
    return this.close(this.lastFix.t);
  }

  private close(t: number): Segment | null {
    const path = this.path;
    const lengthM = this.distM;
    const meanSpeed = this.speedN ? this.speedSum / this.speedN : 0;
    const n = this.n;
    const rms = n ? Math.sqrt(this.sumSq / n) : 0;
    const startT = this.startT;
    // next segment starts where this one ended
    this.path = [path[path.length - 1]];
    this.distM = 0;
    this.sumSq = 0;
    this.n = 0;
    this.speedSum = 0;
    this.speedN = 0;
    this.startT = t;
    if (n === 0) return null; // not scored (too slow / no IMU data)
    const roughnessIndex = normalizeRoughness(rms, meanSpeed, this.cfg);
    return {
      index: this.segIndex++,
      startT,
      endT: t,
      start: path[0],
      end: path[path.length - 1],
      path,
      lengthM,
      sampleCount: n,
      rmsVertical: rms,
      meanSpeedMps: meanSpeed,
      roughnessIndex,
      roughnessClass: classifyRoughness(roughnessIndex),
    };
  }
}

export type SpikeEvent = { t: number; peakMps2: number; severity: "bump" | "pothole" | "severe" };

/** Peak detector on |vertical| with a refractory window; reports one event per hit. */
export class SpikeDetector {
  private active: SpikeEvent | null = null;
  private lastEventT = -Infinity;
  constructor(private cfg = ROUGHNESS_DEFAULTS) {}
  /** Feed a sample; returns an event once the spike has ended (or null). */
  push(t: number, vertical: number): SpikeEvent | null {
    const a = Math.abs(vertical);
    const th = this.cfg.spikeThresholdMps2;
    if (a >= th) {
      if (this.active) {
        if (a > this.active.peakMps2) this.active = { t, peakMps2: a, severity: spikeSeverity(a, th) };
      } else if (t - this.lastEventT >= this.cfg.spikeRefractoryMs) {
        this.active = { t, peakMps2: a, severity: spikeSeverity(a, th) };
      }
      return null;
    }
    if (this.active) {
      const ev = this.active;
      this.active = null;
      this.lastEventT = ev.t;
      return ev;
    }
    return null;
  }
}

export function spikeSeverity(peak: number, threshold = ROUGHNESS_DEFAULTS.spikeThresholdMps2): SpikeEvent["severity"] {
  if (peak >= threshold * 2.5) return "severe";
  if (peak >= threshold * 1.5) return "pothole";
  return "bump";
}

export type SpeedStatus = "no_gps" | "too_slow" | "ok" | "too_fast";
export function speedStatus(speedMps: number | null, cfg = ROUGHNESS_DEFAULTS): SpeedStatus {
  if (speedMps == null || !Number.isFinite(speedMps)) return "no_gps";
  if (speedMps < cfg.speedBandMinMps) return "too_slow";
  if (speedMps > cfg.speedBandMaxMps) return "too_fast";
  return "ok";
}

/**
 * Mount check over a recent window: a loose phone shows high rotation rate
 * and/or large swings in gravity direction. Returns false when it looks unmounted.
 */
export function looksMounted(window: ImuSample[], cfg = ROUGHNESS_DEFAULTS): boolean {
  if (window.length < 10) return true;
  const gy = window.filter((s) => s.gyro).map((s) => s.gyro as Vec3);
  if (gy.length) {
    const rms = Math.sqrt(gy.reduce((acc, g) => acc + dot(g, g), 0) / gy.length);
    if (rms > cfg.mountGyroRmsMaxRadS) return false;
  }
  // compare gravity direction (crude mean) of first vs last quarter
  const q = Math.max(1, Math.floor(window.length / 4));
  const mean = (arr: ImuSample[]) => {
    const s = arr.reduce((a, x) => ({ x: a.x + x.accel.x, y: a.y + x.accel.y, z: a.z + x.accel.z }), { x: 0, y: 0, z: 0 });
    return { x: s.x / arr.length, y: s.y / arr.length, z: s.z / arr.length };
  };
  const a = mean(window.slice(0, q));
  const b = mean(window.slice(-q));
  const cos = dot(a, b) / ((len(a) || 1) * (len(b) || 1));
  const deg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  return deg <= cfg.mountTiltChangeMaxDeg;
}
