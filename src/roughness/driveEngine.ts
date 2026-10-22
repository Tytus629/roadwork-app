/**
 * driveEngine.ts — Platform-free Drive Mode pipeline: IMU + GPS in,
 * segments / events / live status out. Unit-testable with synthetic data.
 */
import {
  GravityFilter,
  Segmenter,
  SpikeDetector,
  looksMounted,
  speedStatus,
  ROUGHNESS_DEFAULTS,
  type GpsFix,
  type ImuSample,
  type Segment,
  type SpeedStatus,
  type SpikeEvent,
  type Vec3,
} from "./signal";

export type LocatedEvent = SpikeEvent & { lat: number; lng: number; speedMps: number | null };
export type DriveStatus = { speed: SpeedStatus; speedMps: number | null; mounted: boolean; sampleRateHz: number };

export type DriveEngineCallbacks = {
  onSegment?: (s: Segment) => void;
  onEvent?: (e: LocatedEvent) => void;
};

export class DriveEngine {
  private gravity: GravityFilter;
  private segmenter: Segmenter;
  private spikes: SpikeDetector;
  private lastGyro: Vec3 | null = null;
  private window: ImuSample[] = [];
  private sampleTimes: number[] = [];
  private mounted = true;
  private warmupLeft = 100; // let the gravity filter settle before detecting spikes

  constructor(private cb: DriveEngineCallbacks = {}, private cfg = ROUGHNESS_DEFAULTS) {
    this.gravity = new GravityFilter(cfg.gravityAlpha);
    this.segmenter = new Segmenter(cfg);
    this.spikes = new SpikeDetector(cfg);
  }

  pushGyro(g: Vec3) {
    this.lastGyro = g;
  }

  pushAccel(t: number, a: Vec3) {
    const { vertical } = this.gravity.push(a);
    this.window.push({ t, accel: a, gyro: this.lastGyro });
    while (this.window.length && t - this.window[0].t > 2000) this.window.shift();
    this.sampleTimes.push(t);
    while (this.sampleTimes.length && t - this.sampleTimes[0] > 1000) this.sampleTimes.shift();
    if (this.warmupLeft > 0) {
      this.warmupLeft--;
      return;
    }
    if (this.window.length % 25 === 0) this.mounted = looksMounted(this.window, this.cfg);
    // Don't score data from a loose phone; it would read as rough road.
    if (!this.mounted) return;
    this.segmenter.addVertical(t, vertical);
    const sp = this.segmenter.currentSpeed;
    if (sp == null || sp < this.cfg.minSpeedMps) return;
    const ev = this.spikes.push(t, vertical);
    const loc = this.segmenter.lastLocation;
    if (ev && loc) this.cb.onEvent?.({ ...ev, lat: loc.lat, lng: loc.lng, speedMps: sp });
  }

  pushFix(fix: GpsFix) {
    const seg = this.segmenter.addFix(fix);
    if (seg) this.cb.onSegment?.(seg);
  }

  stop() {
    const seg = this.segmenter.flush();
    if (seg) this.cb.onSegment?.(seg);
  }

  status(): DriveStatus {
    const sp = this.segmenter.currentSpeed;
    return { speed: speedStatus(sp, this.cfg), speedMps: sp, mounted: this.mounted, sampleRateHz: this.sampleTimes.length };
  }
}
