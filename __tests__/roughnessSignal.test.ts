import {
  G,
  GravityFilter,
  Segmenter,
  SpikeDetector,
  classifyRoughness,
  looksMounted,
  normalizeRoughness,
  removeGravity,
  speedStatus,
  ROUGHNESS_DEFAULTS,
  type ImuSample,
} from '../src/roughness/signal';
import { DriveEngine } from '../src/roughness/driveEngine';

const HZ = 100;
// ~1 m of latitude in degrees
const M_LAT = 1 / 111195;

/** Phone tilted in a mount: gravity split across y/z. */
const tiltedGravity = { x: 0, y: G * Math.sin(Math.PI / 4), z: G * Math.cos(Math.PI / 4) };

function sine(n: number, ampl: number, freqHz: number) {
  return Array.from({ length: n }, (_, i) => ampl * Math.sin((2 * Math.PI * freqHz * i) / HZ));
}

describe('gravity removal', () => {
  it('removes constant gravity in any orientation', () => {
    const samples = Array.from({ length: 1000 }, () => ({ ...tiltedGravity }));
    const v = removeGravity(samples);
    expect(Math.abs(v[v.length - 1])).toBeLessThan(1e-6);
  });

  it('recovers vertical vibration along the gravity axis', () => {
    const vib = sine(2000, 2, 8);
    const ux = tiltedGravity.y / G, uz = tiltedGravity.z / G;
    const samples = vib.map((a) => ({ x: 0, y: tiltedGravity.y + a * ux, z: tiltedGravity.z + a * uz }));
    const v = removeGravity(samples).slice(1000);
    const rms = Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
    expect(rms).toBeGreaterThan(2 / Math.SQRT2 * 0.85);
    expect(rms).toBeLessThan(2 / Math.SQRT2 * 1.15);
  });

  it('tracks gravity estimate', () => {
    const f = new GravityFilter();
    for (let i = 0; i < 500; i++) f.push({ x: 0, y: 0, z: G });
    expect(f.gravity!.z).toBeCloseTo(G, 3);
  });
});

describe('normalization and classes', () => {
  it('scales by reference speed and clamps low speed', () => {
    expect(normalizeRoughness(1, ROUGHNESS_DEFAULTS.referenceSpeedMps)).toBeCloseTo(1);
    expect(normalizeRoughness(1, 26.8)).toBeCloseTo(0.5, 1);
    expect(normalizeRoughness(1, 0)).toBeCloseTo(ROUGHNESS_DEFAULTS.referenceSpeedMps / ROUGHNESS_DEFAULTS.minSpeedMps);
  });
  it('classifies', () => {
    expect(classifyRoughness(0.2)).toBe('smooth');
    expect(classifyRoughness(1)).toBe('fair');
    expect(classifyRoughness(1.5)).toBe('rough');
    expect(classifyRoughness(3)).toBe('very_rough');
  });
  it('speed band', () => {
    expect(speedStatus(null)).toBe('no_gps');
    expect(speedStatus(5)).toBe('too_slow');
    expect(speedStatus(13)).toBe('ok');
    expect(speedStatus(25)).toBe('too_fast');
  });
});

describe('segmenting', () => {
  it('closes a segment every ~100 m with RMS of vertical accel', () => {
    const seg = new Segmenter();
    const out: any[] = [];
    const speed = 13.4;
    // 1 Hz GPS, 100 Hz vertical samples of constant 1 m/s^2 magnitude (rms = 1)
    for (let s = 0; s <= 40; s++) {
      const r = seg.addFix({ t: s * 1000, lat: 47 + s * speed * M_LAT, lng: -122, speedMps: speed });
      if (r) out.push(r);
      for (let k = 0; k < HZ; k++) seg.addVertical(s * 1000 + k * 10, k % 2 ? 1 : -1);
    }
    expect(out.length).toBe(5); // ~536 m
    for (const o of out) {
      expect(o.lengthM).toBeGreaterThanOrEqual(100);
      expect(o.lengthM).toBeLessThan(115);
      expect(o.rmsVertical).toBeCloseTo(1, 5);
      expect(o.roughnessIndex).toBeCloseTo(1, 1);
    }
    expect(out[1].start).toEqual(out[0].end); // contiguous
  });

  it('does not score samples below minimum speed', () => {
    const seg = new Segmenter();
    let got: any = null;
    for (let s = 0; s <= 60; s++) {
      got = seg.addFix({ t: s * 1000, lat: 47 + s * 2 * M_LAT, lng: -122, speedMps: 2 }) ?? got;
      seg.addVertical(s * 1000, 5);
    }
    expect(got).toBeNull();
  });

  it('derives speed from positions when GPS speed missing', () => {
    const seg = new Segmenter();
    seg.addFix({ t: 0, lat: 47, lng: -122, speedMps: null });
    seg.addFix({ t: 1000, lat: 47 + 15 * M_LAT, lng: -122, speedMps: null });
    expect(seg.currentSpeed).toBeCloseTo(15, 0);
  });
});

describe('spike detection', () => {
  it('emits one event per spike with peak and severity, respecting refractory', () => {
    const d = new SpikeDetector();
    const evs: any[] = [];
    const sig = new Array(500).fill(0.2);
    sig[100] = 5; sig[101] = 11; sig[102] = 3; // pothole-ish, peak 11 => severe (>=10)
    sig[150] = 6; // within 1 s refractory -> ignored
    sig[300] = 6.5; // bump->pothole (>=6)
    sig[450] = 4.2; // bump
    sig.forEach((v, i) => { const e = d.push(i * 10, v); if (e) evs.push(e); });
    expect(evs.map((e) => e.severity)).toEqual(['severe', 'pothole', 'bump']);
    expect(evs[0].peakMps2).toBe(11);
    expect(evs[0].t).toBe(1010);
  });
  it('ignores noise below threshold', () => {
    const d = new SpikeDetector();
    const evs = sine(1000, 3, 10).map((v, i) => d.push(i * 10, v)).filter(Boolean);
    expect(evs).toHaveLength(0);
  });
});

describe('mount check', () => {
  const mk = (n: number, f: (i: number) => Partial<ImuSample>): ImuSample[] =>
    Array.from({ length: n }, (_, i) => ({ t: i * 10, accel: { x: 0, y: 0, z: G }, gyro: { x: 0, y: 0, z: 0 }, ...f(i) }));
  it('passes a steady mount', () => expect(looksMounted(mk(200, () => ({})))).toBe(true));
  it('fails with high rotation', () => expect(looksMounted(mk(200, () => ({ gyro: { x: 1.5, y: 0, z: 0 } })))).toBe(false));
  it('fails when the phone tips over', () => {
    expect(looksMounted(mk(200, (i) => ({ accel: i < 100 ? { x: 0, y: 0, z: G } : { x: G, y: 0, z: 0 } })))).toBe(false);
  });
});

describe('DriveEngine end to end (synthetic drive)', () => {
  it('produces segments and a located pothole event', () => {
    const segs: any[] = [];
    const evs: any[] = [];
    const eng = new DriveEngine({ onSegment: (s) => segs.push(s), onEvent: (e) => evs.push(e) });
    const speed = 13.4;
    for (let s = 0; s < 30; s++) {
      eng.pushFix({ t: s * 1000, lat: 47 + s * speed * M_LAT, lng: -122, speedMps: speed });
      for (let k = 0; k < HZ; k++) {
        const t = s * 1000 + k * 10;
        const bump = s === 15 && k === 50 ? 8 : 0;
        const noise = 0.5 * Math.sin((2 * Math.PI * 12 * t) / 1000);
        eng.pushAccel(t, { x: 0, y: 0, z: G + noise + bump });
      }
    }
    eng.stop();
    expect(segs.length).toBeGreaterThanOrEqual(3);
    expect(evs).toHaveLength(1);
    expect(evs[0].severity).toBe('pothole');
    expect(evs[0].lat).toBeCloseTo(47 + 15 * speed * M_LAT, 6);
    expect(eng.status().mounted).toBe(true);
    expect(eng.status().speed).toBe('ok');
  });
});
