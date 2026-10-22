import {
  SEGMENTS_PER_CHUNK,
  approxDocBytes,
  bboxOf,
  buildSessionWrites,
  eventDoc,
  segmentChunkDocs,
  splitIntoBatches,
} from '../src/sync/driveSyncMapping';

const w = { uid: 'u1', orgId: 'org1' };
const seg = (seq: number) => ({
  id: `seg${seq}`, sessionId: 's1', seq, startedAt: 1000 + seq * 7000, endedAt: 1000 + (seq + 1) * 7000,
  path: Array.from({ length: 8 }, (_, i) => ({ lat: 47.1234567 + seq * 0.001 + i * 0.0001, lng: -122.7654321 })),
  lengthM: 100.12345, sampleCount: 700, rmsVertical: 0.81234, meanSpeedMps: 13.4567,
  roughnessIndex: 0.80111, roughnessClass: 'fair' as const,
});
const session = { id: 's1', orgId: 'org1', startedAt: 1000, endedAt: 999999, distanceM: 12010, segmentCount: 120, eventCount: 2, algoVersion: 'phase0-rms-v1' };
const ev = (i: number) => ({ id: `e${i}`, sessionId: 's1', occurredAt: 5000 + i, lat: 47.12345678, lng: -122.1, speedMps: 13.33333, peakMps2: 6.66666, severity: 'pothole' as const, workOrderId: null });

describe('drive sync mapping', () => {
  it('packs segments into chunks with deterministic ids and flat paths', () => {
    const segs = Array.from({ length: 120 }, (_, i) => seg(i)).reverse();
    const chunks = segmentChunkDocs('s1', segs, w);
    expect(chunks).toHaveLength(Math.ceil(120 / SEGMENTS_PER_CHUNK));
    expect(chunks.map((c) => c.id)).toEqual(['s1_0000', 's1_0001', 's1_0002']);
    expect(chunks[0].segments[0].seq).toBe(0); // sorted
    expect(chunks[2].segments).toHaveLength(20);
    const p = chunks[0].segments[0].path;
    expect(p).toHaveLength(16);
    expect(p.every((n) => typeof n === 'number')).toBe(true); // no nested arrays
    expect(p[0]).toBe(47.123457);
    expect(chunks[0].segments[0].idx).toBe(0.801);
    expect(chunks[0]).toMatchObject({ orgId: 'org1', createdByUid: 'u1', sessionId: 's1', chunkIndex: 0 });
    for (const c of chunks) expect(approxDocBytes(c)).toBeLessThan(200_000);
  });

  it('maps events with rounding and owner fields', () => {
    expect(eventDoc(ev(1), w)).toEqual({
      id: 'e1', orgId: 'org1', createdByUid: 'u1', sessionId: 's1', occurredAt: 5001,
      lat: 47.123457, lng: -122.1, speedMps: 13.333, peakMps2: 6.667, severity: 'pothole', workOrderId: null,
    });
  });

  it('builds all writes with the session doc last and correct counts', () => {
    const writes = buildSessionWrites(session, Array.from({ length: 120 }, (_, i) => seg(i)), [ev(1), ev(2)], w);
    expect(writes).toHaveLength(3 + 2 + 1);
    const last = writes[writes.length - 1];
    expect(last.collection).toBe('driveSessions');
    expect(last.data).toMatchObject({ id: 's1', createdByUid: 'u1', segmentChunkCount: 3, calibrated: false, segmentCount: 120 });
    expect(last.data.bbox.minLat).toBeLessThan(last.data.bbox.maxLat);
  });

  it('handles empty sessions and batch splitting', () => {
    expect(bboxOf([])).toBeNull();
    const writes = buildSessionWrites({ ...session, segmentCount: 0, eventCount: 0 }, [], [], w);
    expect(writes).toHaveLength(1);
    expect(splitIntoBatches(Array.from({ length: 1000 }, (_, i) => i)).map((b) => b.length)).toEqual([450, 450, 100]);
  });
});
