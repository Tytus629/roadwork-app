/** detectionsRepo.ts — drive_detections (migration 16). Screening data only. */
import { db } from "../db/db";
import { ensureDbSchemaReady } from "../db/migrations";
import { makeClientId } from "./repoUtils";
import type { DamageClass, Detection } from "../detection/types";

export type DetectionRow = {
  id: string; photoId: string; sessionId: string; segmentId: string | null; cls: DamageClass; score: number;
  boxX: number; boxY: number; boxW: number; boxH: number; lat: number | null; lng: number | null;
  modelName: string; modelVersion: string; createdAt: number;
};

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}

/** Pure mapping (tested). */
export function detectionToRow(d: Detection, ctx: { photoId: string; sessionId: string; segmentId: string | null; lat: number | null; lng: number | null; modelName: string; modelVersion: string; now: number; id?: string }): DetectionRow {
  return {
    id: ctx.id ?? makeClientId("det"), photoId: ctx.photoId, sessionId: ctx.sessionId, segmentId: ctx.segmentId,
    cls: d.cls, score: Math.round(d.score * 1000) / 1000,
    boxX: d.box.x, boxY: d.box.y, boxW: d.box.w, boxH: d.box.h, lat: ctx.lat, lng: ctx.lng,
    modelName: ctx.modelName, modelVersion: ctx.modelVersion, createdAt: ctx.now,
  };
}

export function insertDetections(rs: DetectionRow[]) {
  for (const r of rs) {
    db.executeSync(
      `INSERT OR IGNORE INTO drive_detections(id, photoId, sessionId, segmentId, cls, score, boxX, boxY, boxW, boxH, lat, lng, modelName, modelVersion, createdAt)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
      [r.id, r.photoId, r.sessionId, r.segmentId, r.cls, r.score, r.boxX, r.boxY, r.boxW, r.boxH, r.lat, r.lng, r.modelName, r.modelVersion, r.createdAt]
    );
  }
}

export function listDetections(f: { sessionId?: string | null; fromMs?: number | null; minScore?: number } = {}): DetectionRow[] {
  ensureDbSchemaReady("detections");
  const c: string[] = ["score >= ?"];
  const a: any[] = [f.minScore ?? 0.4];
  if (f.sessionId) { c.push("sessionId = ?"); a.push(f.sessionId); }
  if (f.fromMs != null) { c.push("createdAt >= ?"); a.push(f.fromMs); }
  return rows(db.executeSync(`SELECT * FROM drive_detections WHERE ${c.join(" AND ")} ORDER BY createdAt DESC LIMIT 5000;`, a)) as DetectionRow[];
}

/** Number of analysed photos per segment (for rating: "photos checked"). */
export function photosCheckedBySegment(sessionId?: string | null): Map<string, number> {
  ensureDbSchemaReady("detections");
  const m = new Map<string, number>();
  const r = rows(db.executeSync(
    `SELECT s.id AS segId, COUNT(p.id) AS n FROM drive_segments s JOIN drive_photos p
       ON p.sessionId = s.sessionId AND p.capturedAt BETWEEN s.startedAt AND s.endedAt AND p.detectedAt IS NOT NULL
     ${sessionId ? "WHERE s.sessionId = ?" : ""} GROUP BY s.id;`, sessionId ? [sessionId] : []));
  for (const x of r) m.set(String(x.segId), Number(x.n));
  return m;
}
