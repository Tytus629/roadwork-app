/** drivePhotosRepo.ts — local Drive Mode photos (migration 15). */
import { db } from "../db/db";
import { ensureDbSchemaReady } from "../db/migrations";
import type { CaptureReason, StoredPhoto } from "../roughness/photoPolicy";

export type DrivePhotoRow = {
  id: string; orgId: string | null; sessionId: string; eventId: string | null; reason: CaptureReason;
  capturedAt: number; localUri: string; width: number | null; height: number | null; sizeBytes: number;
  lat: number | null; lng: number | null; headingDeg: number | null; speedMps: number | null; accuracyM: number | null;
  storagePath: string | null; uploadedAt: number | null; workOrderLinked: number; prunedAt: number | null;
};

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}

export function insertDrivePhoto(p: Omit<DrivePhotoRow, "storagePath" | "uploadedAt" | "workOrderLinked" | "prunedAt">) {
  ensureDbSchemaReady("drivePhotos");
  db.executeSync(
    `INSERT INTO drive_photos(id, orgId, sessionId, eventId, reason, capturedAt, localUri, width, height, sizeBytes, lat, lng, headingDeg, speedMps, accuracyM)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?);`,
    [p.id, p.orgId, p.sessionId, p.eventId, p.reason, p.capturedAt, p.localUri, p.width, p.height, p.sizeBytes, p.lat, p.lng, p.headingDeg, p.speedMps, p.accuracyM]
  );
}

export function getDrivePhoto(id: string): DrivePhotoRow | null {
  ensureDbSchemaReady("drivePhotos");
  return (rows(db.executeSync(`SELECT * FROM drive_photos WHERE id = ? LIMIT 1;`, [id]))[0] as DrivePhotoRow) ?? null;
}

export function listDrivePhotos(f: { sessionId?: string | null; eventId?: string | null; limit?: number } = {}): DrivePhotoRow[] {
  ensureDbSchemaReady("drivePhotos");
  const c = ["prunedAt IS NULL"];
  const a: any[] = [];
  if (f.sessionId) { c.push("sessionId = ?"); a.push(f.sessionId); }
  if (f.eventId) { c.push("eventId = ?"); a.push(f.eventId); }
  return rows(db.executeSync(`SELECT * FROM drive_photos WHERE ${c.join(" AND ")} ORDER BY capturedAt DESC LIMIT ?;`, [...a, f.limit ?? 500])) as DrivePhotoRow[];
}

export function markDrivePhotoUploaded(id: string, storagePath: string) {
  db.executeSync(`UPDATE drive_photos SET storagePath = ?, uploadedAt = ? WHERE id = ?;`, [storagePath, Date.now(), id]);
}
export function markDrivePhotoWorkOrderLinked(id: string) {
  db.executeSync(`UPDATE drive_photos SET workOrderLinked = 1 WHERE id = ?;`, [id]);
}
export function markDrivePhotoPruned(id: string) {
  // Row kept (metadata + any cloud copy); only the local file is removed.
  db.executeSync(`UPDATE drive_photos SET prunedAt = ? WHERE id = ?;`, [Date.now(), id]);
}

export function listPhotosForPrune(): StoredPhoto[] {
  ensureDbSchemaReady("drivePhotos");
  return rows(db.executeSync(`SELECT id, capturedAt, sizeBytes, reason, uploadedAt, orgId, workOrderLinked FROM drive_photos WHERE prunedAt IS NULL;`)).map((r: any) => ({
    id: r.id, capturedAt: r.capturedAt, sizeBytes: r.sizeBytes ?? 0, reason: r.reason, uploadedAt: r.uploadedAt ?? null,
    willSync: !!r.orgId, linkedToWorkOrder: !!r.workOrderLinked,
  }));
}
