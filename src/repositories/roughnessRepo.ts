/**
 * roughnessRepo.ts — local-only storage for Drive Mode sessions, segments and
 * bump/pothole events (tables from migration 13). Nothing here syncs yet.
 */
import { db } from "../db/db";
import { ensureDbSchemaReady } from "../db/migrations";
import { makeClientId } from "./repoUtils";
import type { Segment } from "../roughness/signal";
import type { LocatedEvent } from "../roughness/driveEngine";

export const ROUGHNESS_ALGO_VERSION = "phase0-rms-v1";

export type DriveSessionRow = {
  id: string; orgId: string | null; startedAt: number; endedAt: number | null;
  distanceM: number; segmentCount: number; eventCount: number; algoVersion: string;
};
export type DriveSegmentRow = Omit<Segment, "start" | "end" | "index" | "startT" | "endT"> & {
  id: string; sessionId: string; seq: number; startedAt: number; endedAt: number;
};
export type DriveEventRow = {
  id: string; sessionId: string; occurredAt: number; lat: number; lng: number;
  speedMps: number | null; peakMps2: number; severity: LocatedEvent["severity"]; workOrderId: string | null;
};

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}

export function createDriveSession(orgId: string | null, meta?: { deviceId?: string; appVersion?: string }): string {
  ensureDbSchemaReady("roughness");
  const id = makeClientId("drv");
  db.executeSync(
    `INSERT INTO drive_sessions(id, orgId, startedAt, algoVersion, deviceId, appVersion) VALUES (?,?,?,?,?,?);`,
    [id, orgId, Date.now(), ROUGHNESS_ALGO_VERSION, meta?.deviceId ?? null, meta?.appVersion ?? null]
  );
  return id;
}

export function finishDriveSession(id: string) {
  db.executeSync(
    `UPDATE drive_sessions SET endedAt = ?,
       distanceM = COALESCE((SELECT SUM(lengthM) FROM drive_segments WHERE sessionId = ?), 0),
       segmentCount = (SELECT COUNT(*) FROM drive_segments WHERE sessionId = ?),
       eventCount = (SELECT COUNT(*) FROM drive_events WHERE sessionId = ?)
     WHERE id = ?;`,
    [Date.now(), id, id, id, id]
  );
}

export function insertDriveSegment(sessionId: string, s: Segment) {
  const lats = s.path.map((p) => p.lat);
  const lngs = s.path.map((p) => p.lng);
  db.executeSync(
    `INSERT INTO drive_segments(id, sessionId, seq, startedAt, endedAt, pathJson, lengthM, sampleCount,
       rmsVertical, meanSpeedMps, roughnessIndex, roughnessClass, minLat, minLng, maxLat, maxLng)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [makeClientId("seg"), sessionId, s.index, s.startT, s.endT, JSON.stringify(s.path), s.lengthM, s.sampleCount,
      s.rmsVertical, s.meanSpeedMps, s.roughnessIndex, s.roughnessClass,
      Math.min(...lats), Math.min(...lngs), Math.max(...lats), Math.max(...lngs)]
  );
}

export function insertDriveEvent(sessionId: string, e: LocatedEvent): string {
  const id = makeClientId("evt");
  db.executeSync(
    `INSERT INTO drive_events(id, sessionId, occurredAt, lat, lng, speedMps, peakMps2, severity) VALUES (?,?,?,?,?,?,?,?);`,
    [id, sessionId, e.t, e.lat, e.lng, e.speedMps, e.peakMps2, e.severity]
  );
  return id;
}

export function linkEventToWorkOrder(eventId: string, workOrderId: string) {
  db.executeSync(`UPDATE drive_events SET workOrderId = ? WHERE id = ?;`, [workOrderId, eventId]);
}

export type RoughnessFilter = { orgId?: string | null; sessionId?: string | null; fromMs?: number | null; toMs?: number | null };

function where(f: RoughnessFilter, timeCol: string, prefix = "") {
  const c: string[] = [];
  const a: any[] = [];
  if (f.sessionId) { c.push(`${prefix}sessionId = ?`); a.push(f.sessionId); }
  if (f.orgId) { c.push(`${prefix}sessionId IN (SELECT id FROM drive_sessions WHERE orgId IS ?)`); a.push(f.orgId); }
  if (f.fromMs != null) { c.push(`${timeCol} >= ?`); a.push(f.fromMs); }
  if (f.toMs != null) { c.push(`${timeCol} <= ?`); a.push(f.toMs); }
  return { sql: c.length ? `WHERE ${c.join(" AND ")}` : "", args: a };
}

export function listDriveSessions(orgId?: string | null, limit = 50): DriveSessionRow[] {
  ensureDbSchemaReady("roughness");
  const r = orgId
    ? db.executeSync(`SELECT * FROM drive_sessions WHERE orgId IS ? ORDER BY startedAt DESC LIMIT ?;`, [orgId, limit])
    : db.executeSync(`SELECT * FROM drive_sessions ORDER BY startedAt DESC LIMIT ?;`, [limit]);
  return rows(r) as DriveSessionRow[];
}

export function listDriveSegments(f: RoughnessFilter = {}, limit = 5000): DriveSegmentRow[] {
  ensureDbSchemaReady("roughness");
  const w = where(f, "startedAt");
  return rows(db.executeSync(`SELECT * FROM drive_segments ${w.sql} ORDER BY startedAt DESC LIMIT ?;`, [...w.args, limit])).map(
    (r: any) => ({ ...r, path: safePath(r.pathJson) })
  );
}

export function listDriveEvents(f: RoughnessFilter = {}, limit = 2000): DriveEventRow[] {
  ensureDbSchemaReady("roughness");
  const w = where(f, "occurredAt");
  return rows(db.executeSync(`SELECT * FROM drive_events ${w.sql} ORDER BY occurredAt DESC LIMIT ?;`, [...w.args, limit])) as DriveEventRow[];
}

function safePath(json: string) {
  try {
    const p = JSON.parse(json);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}
