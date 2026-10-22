/**
 * driveSyncMapping.ts — pure mapping of local Drive Mode rows to Firestore docs.
 *
 * Cost control: segments are packed into chunk docs (SEGMENTS_PER_CHUNK each)
 * instead of one doc per 100 m. A 30-mile drive (~480 segments) = 10 chunk
 * writes, not 480. Paths are flat [lat,lng,lat,lng,...] arrays (Firestore
 * forbids nested arrays) rounded to 6 dp (~0.1 m).
 * Doc ids are deterministic so retries overwrite instead of duplicating.
 */
import type { DriveEventRow, DriveSegmentRow, DriveSessionRow } from "../repositories/roughnessRepo";

export const SEGMENTS_PER_CHUNK = 50;
export const FIRESTORE_BATCH_LIMIT = 450; // < 500 hard limit
export const DRIVE_SYNC_SCHEMA = 1;

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const r3 = (n: number) => Math.round(n * 1e3) / 1e3;

export type Writer = { uid: string; orgId: string };

export function sessionDoc(s: DriveSessionRow, w: Writer, extra: { segmentChunkCount: number; bbox: Bbox | null }) {
  return {
    id: s.id,
    orgId: w.orgId,
    createdByUid: w.uid,
    startedAt: s.startedAt,
    endedAt: s.endedAt ?? null,
    distanceM: r3(s.distanceM ?? 0),
    segmentCount: s.segmentCount ?? 0,
    eventCount: s.eventCount ?? 0,
    segmentChunkCount: extra.segmentChunkCount,
    bbox: extra.bbox,
    algoVersion: s.algoVersion,
    calibrated: false,
    schema: DRIVE_SYNC_SCHEMA,
  };
}

export type Bbox = { minLat: number; minLng: number; maxLat: number; maxLng: number };

export function bboxOf(segs: Pick<DriveSegmentRow, "path">[]): Bbox | null {
  const pts = segs.flatMap((s) => s.path);
  if (!pts.length) return null;
  return {
    minLat: r6(Math.min(...pts.map((p) => p.lat))),
    minLng: r6(Math.min(...pts.map((p) => p.lng))),
    maxLat: r6(Math.max(...pts.map((p) => p.lat))),
    maxLng: r6(Math.max(...pts.map((p) => p.lng))),
  };
}

export function segmentChunkDocs(sessionId: string, segs: DriveSegmentRow[], w: Writer) {
  const sorted = [...segs].sort((a, b) => a.seq - b.seq);
  const out = [];
  for (let i = 0; i < sorted.length; i += SEGMENTS_PER_CHUNK) {
    const part = sorted.slice(i, i + SEGMENTS_PER_CHUNK);
    const chunkIndex = i / SEGMENTS_PER_CHUNK;
    out.push({
      id: `${sessionId}_${String(chunkIndex).padStart(4, "0")}`,
      orgId: w.orgId,
      createdByUid: w.uid,
      sessionId,
      chunkIndex,
      startedAt: part[0].startedAt,
      endedAt: part[part.length - 1].endedAt,
      bbox: bboxOf(part),
      segments: part.map((s) => ({
        seq: s.seq,
        t0: s.startedAt,
        t1: s.endedAt,
        path: s.path.flatMap((p) => [r6(p.lat), r6(p.lng)]),
        lengthM: r3(s.lengthM),
        n: s.sampleCount,
        rms: r3(s.rmsVertical),
        speed: r3(s.meanSpeedMps),
        idx: r3(s.roughnessIndex),
        cls: s.roughnessClass,
      })),
    });
  }
  return out;
}

export function eventDoc(e: DriveEventRow, w: Writer) {
  return {
    id: e.id,
    orgId: w.orgId,
    createdByUid: w.uid,
    sessionId: e.sessionId,
    occurredAt: e.occurredAt,
    lat: r6(e.lat),
    lng: r6(e.lng),
    speedMps: e.speedMps == null ? null : r3(e.speedMps),
    peakMps2: r3(e.peakMps2),
    severity: e.severity,
    workOrderId: e.workOrderId ?? null,
  };
}

export type DriveWrite = { collection: "driveSessions" | "driveSegments" | "driveEvents"; id: string; data: Record<string, any> };

/** All writes for one session, session doc LAST so readers only see complete sessions. */
export function buildSessionWrites(s: DriveSessionRow, segs: DriveSegmentRow[], evs: DriveEventRow[], w: Writer): DriveWrite[] {
  const chunks = segmentChunkDocs(s.id, segs, w);
  const writes: DriveWrite[] = [
    ...chunks.map((c) => ({ collection: "driveSegments" as const, id: c.id, data: c })),
    ...evs.map((e) => ({ collection: "driveEvents" as const, id: e.id, data: eventDoc(e, w) })),
  ];
  writes.push({ collection: "driveSessions", id: s.id, data: sessionDoc(s, w, { segmentChunkCount: chunks.length, bbox: bboxOf(segs) }) });
  return writes;
}

/** Firestore doc limit is 1 MiB; keep each chunk well under it. */
export function approxDocBytes(d: unknown) {
  return JSON.stringify(d).length;
}

export function splitIntoBatches<T>(items: T[], size = FIRESTORE_BATCH_LIMIT): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
