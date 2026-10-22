import { DEFAULT_PHOTO_SETTINGS, PhotoScheduler, planPrune, type StoredPhoto } from '../src/roughness/photoPolicy';

const M_LAT = 1 / 111195;
const fix = (m: number) => ({ lat: 47 + m * M_LAT, lng: -122 });

describe('PhotoScheduler', () => {
  it('off mode never shoots timed, but bump still works', () => {
    const s = new PhotoScheduler({ ...DEFAULT_PHOTO_SETTINGS, mode: 'off' });
    for (let t = 0; t < 60000; t += 1000) expect(s.onFix(t, fix(t / 100))).toBeNull();
    expect(s.onBump(60000)).toBe('bump');
  });
  it('time mode fires every N seconds', () => {
    const s = new PhotoScheduler({ ...DEFAULT_PHOTO_SETTINGS, mode: 'time', everySeconds: 10 });
    const shots = [];
    for (let t = 0; t <= 60000; t += 1000) if (s.onFix(t, fix(0))) shots.push(t);
    expect(shots).toEqual([0, 10000, 20000, 30000, 40000, 50000, 60000]);
  });
  it('distance mode fires every ~N meters', () => {
    const s = new PhotoScheduler({ ...DEFAULT_PHOTO_SETTINGS, mode: 'distance', everyMeters: 50, minGapMs: 2000 });
    const shots = [];
    for (let i = 0; i <= 30; i++) if (s.onFix(i * 1000, fix(i * 13.4))) shots.push(i);
    expect(shots[0]).toBe(0);
    for (let k = 1; k < shots.length; k++) {
      const meters = (shots[k] - shots[k - 1]) * 13.4;
      expect(meters).toBeGreaterThanOrEqual(50);
      expect(meters).toBeLessThan(50 + 13.4 * 1.01);
    }
  });
  it('respects min gap (heat) and busy flag; bump allowed after 500 ms but not overlapping', () => {
    const s = new PhotoScheduler({ ...DEFAULT_PHOTO_SETTINGS, mode: 'distance', everyMeters: 5, minGapMs: 3000 });
    expect(s.onFix(0, fix(0))).toBe('distance');
    expect(s.onFix(1000, fix(30))).toBeNull(); // gap
    expect(s.onBump(300)).toBeNull(); // < 500 ms
    expect(s.onBump(1200)).toBe('bump');
    s.setBusy(true);
    expect(s.onFix(9000, fix(200))).toBeNull();
    expect(s.onBump(9000)).toBeNull();
    s.setBusy(false);
    expect(s.onFix(9100, fix(210))).toBe('distance');
  });
  it('photoOnBump off disables bump shots', () => {
    const s = new PhotoScheduler({ ...DEFAULT_PHOTO_SETTINGS, photoOnBump: false });
    expect(s.onBump(10000)).toBeNull();
  });
});

describe('planPrune', () => {
  const p = (id: string, at: number, o: Partial<StoredPhoto> = {}): StoredPhoto => ({ id, capturedAt: at, sizeBytes: 100, reason: 'timed', uploadedAt: null, willSync: true, linkedToWorkOrder: false, ...o });
  it('no-op under cap', () => expect(planPrune([p('a', 1), p('b', 2)], 500)).toEqual([]));
  it('prunes uploaded oldest first, then unsynced timed, never pending bump or linked', () => {
    const photos = [
      p('bumpPending', 1, { reason: 'bump' }),
      p('linked', 2, { uploadedAt: 5, linkedToWorkOrder: true }),
      p('upNew', 9, { uploadedAt: 10 }),
      p('upOld', 3, { uploadedAt: 4 }),
      p('timedPending', 4),
      p('localOnly', 5, { willSync: false }),
      p('bumpUploaded', 6, { reason: 'bump', uploadedAt: 7 }),
    ];
    expect(planPrune(photos, 300)).toEqual(['upOld', 'localOnly', 'bumpUploaded', 'upNew']);
    expect(planPrune(photos, 0)).toEqual(['upOld', 'localOnly', 'bumpUploaded', 'upNew', 'timedPending']);
  });
  it('local-only bump photos are kept', () => {
    expect(planPrune([p('b', 1, { reason: 'bump', willSync: false }), p('t', 2, { willSync: false })], 0)).toEqual(['t']);
  });
});
