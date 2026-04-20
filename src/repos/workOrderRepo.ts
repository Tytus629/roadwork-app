// Applies to: MOBILE APP
// File: src/repos/workOrderRepo.ts
//
// Offline-first CRUD for work orders, geometry, audit log, and outbox queue.
// Uses synchronous op-sqlite via db.executeSync() to match existing codebase patterns.

import { db } from "../db/db";
import { v4 as uuidv4 } from "uuid";

// ─── Types ───────────────────────────────────────────────────────────────

export type GeometryType = "Point" | "Line";

export type OfflineWorkOrderRow = {
  id: string;
  orgId: string;
  type: string;
  status: string;
  priority: number;
  note?: string | null;
  geometryType: GeometryType;
  createdAt: number;
  updatedAt: number;
  createdByUid: string;
  assignedToUid?: string | null;
  needsSync: 0 | 1;
  deleted: 0 | 1;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

function now() {
  return Date.now();
}

function readRows(r: any): any[] {
  const rows = r?.rows;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows.item === "function") {
    const out: any[] = [];
    for (let i = 0; i < (rows.length ?? 0); i++) out.push(rows.item(i));
    return out;
  }
  return rows ? Array.from(rows) : [];
}

function enqueue(orgId: string, kind: string, entityId: string, payload: any) {
  const id = uuidv4();
  db.executeSync(
    `INSERT INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, kind, entityId, JSON.stringify(payload), now()]
  );
}

// ─── CRUD ────────────────────────────────────────────────────────────────

export function upsertWorkOrderLocal(input: {
  orgId: string;
  id?: string;
  type: string;
  status: string;
  priority: number;
  note?: string | null;
  geometryType: GeometryType;
  geo: any; // point {lat,lng} or line [{lat,lng},...]
  createdByUid: string;
  assignedToUid?: string | null;
}): { id: string } {
  const id = input.id ?? uuidv4();
  const t = now();

  db.executeSync("BEGIN");
  try {
    // Upsert main row
    db.executeSync(
      `INSERT INTO offline_work_orders
        (id, orgId, type, status, priority, note, geometryType, createdAt, updatedAt, createdByUid, assignedToUid, needsSync, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
       ON CONFLICT(id) DO UPDATE SET
         type=excluded.type,
         status=excluded.status,
         priority=excluded.priority,
         note=excluded.note,
         geometryType=excluded.geometryType,
         updatedAt=excluded.updatedAt,
         assignedToUid=excluded.assignedToUid,
         needsSync=1,
         deleted=0`,
      [
        id,
        input.orgId,
        input.type,
        input.status,
        input.priority,
        input.note ?? null,
        input.geometryType,
        t,
        t,
        input.createdByUid,
        input.assignedToUid ?? null,
      ]
    );

    // Upsert geometry
    db.executeSync(
      `INSERT INTO offline_work_order_geometry (workOrderId, orgId, geoJson)
       VALUES (?, ?, ?)
       ON CONFLICT(workOrderId) DO UPDATE SET geoJson=excluded.geoJson`,
      [id, input.orgId, JSON.stringify(input.geo)]
    );

    // Audit log
    const auditId = uuidv4();
    db.executeSync(
      `INSERT INTO audit_log (id, orgId, entityType, entityId, action, payloadJson, createdAt, createdByUid, needsSync)
       VALUES (?, ?, 'work_order', ?, 'upserted', ?, ?, ?, 1)`,
      [auditId, input.orgId, id, JSON.stringify({ ...input, id }), t, input.createdByUid]
    );

    // Outbox
    enqueue(input.orgId, "UPSERT_WORK_ORDER", id, { ...input, id, updatedAt: t });

    db.executeSync("COMMIT");
    return { id };
  } catch (e) {
    db.executeSync("ROLLBACK");
    throw e;
  }
}

export function softDeleteWorkOrder(orgId: string, workOrderId: string, uid: string) {
  const t = now();

  db.executeSync("BEGIN");
  try {
    db.executeSync(
      `UPDATE offline_work_orders SET deleted=1, needsSync=1, updatedAt=? WHERE id=? AND orgId=?`,
      [t, workOrderId, orgId]
    );

    const auditId = uuidv4();
    db.executeSync(
      `INSERT INTO audit_log (id, orgId, entityType, entityId, action, payloadJson, createdAt, createdByUid, needsSync)
       VALUES (?, ?, 'work_order', ?, 'deleted', NULL, ?, ?, 1)`,
      [auditId, orgId, workOrderId, t, uid]
    );

    enqueue(orgId, "DELETE_WORK_ORDER", workOrderId, { orgId, workOrderId, deletedAt: t });

    db.executeSync("COMMIT");
  } catch (e) {
    db.executeSync("ROLLBACK");
    throw e;
  }
}

export function listWorkOrdersByOrg(
  orgId: string
): Array<OfflineWorkOrderRow & { geo: any }> {
  const woResult = db.executeSync(
    `SELECT * FROM offline_work_orders WHERE orgId=? AND deleted=0 ORDER BY updatedAt DESC`,
    [orgId]
  );
  const rows = readRows(woResult) as OfflineWorkOrderRow[];
  if (!rows.length) return [];

  const geoResult = db.executeSync(
    `SELECT workOrderId, geoJson FROM offline_work_order_geometry WHERE orgId=?`,
    [orgId]
  );
  const geos = readRows(geoResult) as { workOrderId: string; geoJson: string }[];
  const geoMap = new Map(geos.map((g) => [g.workOrderId, JSON.parse(g.geoJson)]));

  return rows.map((r) => ({ ...r, geo: geoMap.get(r.id) ?? null }));
}

export function getWorkOrderById(
  id: string
): (OfflineWorkOrderRow & { geo: any }) | null {
  const woResult = db.executeSync(
    `SELECT * FROM offline_work_orders WHERE id=? AND deleted=0 LIMIT 1`,
    [id]
  );
  const rows = readRows(woResult) as OfflineWorkOrderRow[];
  if (!rows.length) return null;

  const geoResult = db.executeSync(
    `SELECT geoJson FROM offline_work_order_geometry WHERE workOrderId=? LIMIT 1`,
    [id]
  );
  const geos = readRows(geoResult);
  const geo = geos.length ? JSON.parse(geos[0].geoJson) : null;

  return { ...rows[0], geo };
}

// ─── Outbox queries ──────────────────────────────────────────────────────

export function getPendingOutbox(orgId: string, limit = 50) {
  const result = db.executeSync(
    `SELECT * FROM outbox WHERE orgId=? ORDER BY createdAt ASC LIMIT ?`,
    [orgId, limit]
  );
  return readRows(result);
}

export function markOutboxAttempt(id: string, error?: string) {
  db.executeSync(
    `UPDATE outbox SET attempts = attempts + 1, lastError = ? WHERE id = ?`,
    [error ?? null, id]
  );
}

export function removeOutboxItem(id: string) {
  db.executeSync(`DELETE FROM outbox WHERE id = ?`, [id]);
}

// ─── Sync helpers ────────────────────────────────────────────────────────

export function markSynced(workOrderId: string) {
  db.executeSync(
    `UPDATE offline_work_orders SET needsSync=0 WHERE id=?`,
    [workOrderId]
  );
}

export function getUnsyncedCount(orgId: string): number {
  const result = db.executeSync(
    `SELECT COUNT(*) as cnt FROM offline_work_orders WHERE orgId=? AND needsSync=1`,
    [orgId]
  );
  const rows = readRows(result);
  return rows[0]?.cnt ?? 0;
}
