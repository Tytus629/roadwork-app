// src/repositories/workOrdersRepo.ts
//
// Single source of truth for work order SQLite reads + writes.
// Uses direct SQL against the real work_orders schema:
//   id, orgId, type, createdAt, updatedAt, status, priority, note,
//   geomType ("point"|"line"), lat, lng, lineJson,
//   minLat, minLng, maxLat, maxLng,
//   detailsJson, createdByUid, createdByEmail, createdByFirstName,
//   createdByLastName, createdByDisplayName,
//   assignedToUid, assignedToName, assignedToEmail,
//   deviceId, appVersion,
//   assetId, assetMatchJson

import { addColumnIfMissing, db, ensureWorkOrdersOrgIdColumn } from "../db/db";
import { withTxSync } from "../db/tx";
import { WorkOrder, WorkOrderAttachment } from "../types/WorkOrder";
import { decodeDetails, encodeDetails } from "./detailsCodec";
import { safeJsonParse, safeJsonStringify } from "./repoUtils";
import { requireOrgId } from "../org/requireOrg";
import { normalizeWorkOrderAttachments } from "../workOrders/attachments";

let orgIdColumnCheckDone = false;
let attachmentsColumnCheckDone = false;

function ensureAttachmentsColumnReady() {
  if (attachmentsColumnCheckDone) return;
  try {
    addColumnIfMissing("work_orders", "attachmentsJson", "TEXT");
    attachmentsColumnCheckDone = true;
  } catch (e) {
    console.warn("[DB][runtime] Failed ensuring work_orders.attachmentsJson", e);
  }
}

function ensureOrgIdColumnReady(context: string) {
  if (orgIdColumnCheckDone) return;
  try {
    const result = ensureWorkOrdersOrgIdColumn();
    if (result === "added") {
      console.log(`[DB][runtime] Added missing work_orders.orgId in ${context}`);
    }
    if (result !== "table-missing") {
      orgIdColumnCheckDone = true;
    }
  } catch (e) {
    console.warn(`[DB][runtime] Failed ensuring work_orders.orgId in ${context}`, e);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function rowsToArray(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.item === "function") {
    const out: any[] = [];
    for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
    return out;
  }
  return [];
}

function bboxFromPoint(lat: number, lng: number) {
  return { minLat: lat, minLng: lng, maxLat: lat, maxLng: lng };
}

function bboxFromLine(points: { lat: number; lng: number }[]) {
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  if (!Number.isFinite(minLat)) minLat = 0;
  if (!Number.isFinite(minLng)) minLng = 0;
  if (!Number.isFinite(maxLat)) maxLat = 0;
  if (!Number.isFinite(maxLng)) maxLng = 0;

  return { minLat, minLng, maxLat, maxLng };
}

// ─── Row → Domain mapping ────────────────────────────────────────────

function mapRowToWorkOrder(r: any): WorkOrder {
  const assetMatch = safeJsonParse<WorkOrder["assetMatch"]>(r.assetMatchJson, null);
  const line = safeJsonParse<{ lat: number; lng: number }[] | null>(r.lineJson, null);
  const attachmentsRaw = safeJsonParse<WorkOrderAttachment[] | null>(r.attachmentsJson, null);
  const orgId = requireOrgId(r.orgId);

  return {
    id: String(r.id),
    orgId,
    type: String(r.type),

    status: String(r.status) as any,
    priority: String(r.priority) as any,

    geomType: String(r.geomType) as any,

    lat: r.lat != null ? Number(r.lat) : null,
    lng: r.lng != null ? Number(r.lng) : null,

    line: line ?? null,

    minLat: Number(r.minLat),
    minLng: Number(r.minLng),
    maxLat: Number(r.maxLat),
    maxLng: Number(r.maxLng),

    note: r.note ?? null,

    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),

    createdByUid: r.createdByUid ?? null,
    createdByEmail: r.createdByEmail ?? null,
    createdByFirstName: r.createdByFirstName ?? null,
    createdByLastName: r.createdByLastName ?? null,
    createdByDisplayName: r.createdByDisplayName ?? null,
    assignedToUid: r.assignedToUid ?? null,
    assignedToName: r.assignedToName ?? null,
    assignedToEmail: r.assignedToEmail ?? null,
    deviceId: r.deviceId ?? null,
    appVersion: r.appVersion ?? null,

    assetId: r.assetId ?? null,
    assetMatch: assetMatch ?? null,

    details: decodeDetails(r.detailsJson),
    attachments: normalizeWorkOrderAttachments(attachmentsRaw, {
      orgId,
      workOrderId: String(r.id),
    }),
  };
}

// ─── Public interface ─────────────────────────────────────────────────

export type WorkOrdersRepo = {
  getById(args: { orgId: string; id: string }): Promise<WorkOrder | null>;

  listForAsset(args: {
    orgId: string;
    assetId: string;
    limit?: number;
  }): Promise<WorkOrder[]>;

  getInViewport(args: {
    orgId: string;
    minLat: number;
    minLng: number;
    maxLat: number;
    maxLng: number;
    limit?: number;
  }): Promise<WorkOrder[]>;

  upsert(workOrder: WorkOrder): Promise<void>;

  deleteById(args: { orgId: string; id: string }): Promise<void>;

  updateFields(args: {
    orgId: string;
    id: string;
    patch: Partial<
      Pick<
        WorkOrder,
        | "type"
        | "status"
        | "priority"
        | "note"
        | "details"
        | "assetId"
        | "assetMatch"
        | "attachments"
        | "updatedAt"
        | "createdByUid"
        | "createdByEmail"
        | "createdByFirstName"
        | "createdByLastName"
        | "createdByDisplayName"
        | "assignedToUid"
        | "assignedToName"
        | "assignedToEmail"
        | "deviceId"
        | "appVersion"
      >
    >;
  }): Promise<void>;
};

export const workOrdersRepo: WorkOrdersRepo = {
  async getById({ orgId, id }) {
    ensureOrgIdColumnReady("repositories.getById");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(orgId);
    const r = db.executeSync(
      `SELECT * FROM work_orders WHERE orgId = ? AND id = ? LIMIT 1`,
      [safeOrgId, id],
    );
    const rows = rowsToArray(r?.rows);
    if (!rows.length) return null;
    return mapRowToWorkOrder(rows[0]);
  },

  async listForAsset({ orgId, assetId, limit = 250 }) {
    ensureOrgIdColumnReady("repositories.listForAsset");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(orgId);
    const r = db.executeSync(
      `
      SELECT *
      FROM work_orders
      WHERE orgId = ?
        AND assetId = ?
      ORDER BY updatedAt DESC
      LIMIT ?
      `,
      [safeOrgId, assetId, limit],
    );
    const rows = rowsToArray(r?.rows);
    return rows.map(mapRowToWorkOrder);
  },

  async getInViewport({ orgId, minLat, minLng, maxLat, maxLng, limit = 500 }) {
    ensureOrgIdColumnReady("repositories.getInViewport");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(orgId);
    // bbox overlap: NOT (maxLat < viewMin OR minLat > viewMax …)
    const r = db.executeSync(
      `
      SELECT *
      FROM work_orders
      WHERE orgId = ?
        AND NOT (
          maxLat < ? OR minLat > ? OR
          maxLng < ? OR minLng > ?
        )
      ORDER BY updatedAt DESC
      LIMIT ?
      `,
      [safeOrgId, minLat, maxLat, minLng, maxLng, limit],
    );
    const rows = rowsToArray(r?.rows);
    return rows.map(mapRowToWorkOrder);
  },

  async upsert(wo) {
    ensureOrgIdColumnReady("repositories.upsert");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(wo.orgId);
    withTxSync(() => {
      const detailsJson = encodeDetails(wo.details);
      const assetMatchJson = wo.assetMatch ? safeJsonStringify(wo.assetMatch) : null;
      const attachments = normalizeWorkOrderAttachments(wo.attachments, {
        orgId: safeOrgId,
        workOrderId: wo.id,
      });
      const attachmentsJson = attachments.length ? safeJsonStringify(attachments) : null;

      // Compute bbox from geometry
      let { minLat, minLng, maxLat, maxLng } = wo;

      if (wo.geomType === "point") {
        const lat = wo.lat ?? null;
        const lng = wo.lng ?? null;
        if (lat == null || lng == null) {
          throw new Error("workOrdersRepo.upsert: geomType=point requires lat/lng");
        }
        const b = bboxFromPoint(lat, lng);
        minLat = b.minLat;
        minLng = b.minLng;
        maxLat = b.maxLat;
        maxLng = b.maxLng;
      } else {
        const pts = wo.line ?? [];
        if (!pts.length) {
          throw new Error("workOrdersRepo.upsert: geomType=line requires non-empty line[]");
        }
        const b = bboxFromLine(pts);
        minLat = b.minLat;
        minLng = b.minLng;
        maxLat = b.maxLat;
        maxLng = b.maxLng;
      }

      const insertColumns = [
        "id",
        "type",
        "createdAt",
        "updatedAt",
        "status",
        "priority",
        "note",
        "geomType",
        "lat",
        "lng",
        "lineJson",
        "minLat",
        "minLng",
        "maxLat",
        "maxLng",
        "orgId",
        "detailsJson",
        "createdByUid",
        "createdByEmail",
        "createdByFirstName",
        "createdByLastName",
        "createdByDisplayName",
        "assignedToUid",
        "assignedToName",
        "assignedToEmail",
        "deviceId",
        "appVersion",
        "assetId",
        "assetMatchJson",
        "attachmentsJson",
      ];

      const insertValues = [
        wo.id,
        wo.type,
        wo.createdAt,
        wo.updatedAt,
        wo.status,
        wo.priority,
        wo.note ?? null,

        wo.geomType,
        wo.geomType === "point" ? wo.lat ?? null : null,
        wo.geomType === "point" ? wo.lng ?? null : null,
        wo.geomType === "line" ? safeJsonStringify(wo.line ?? null) : null,

        minLat,
        minLng,
        maxLat,
        maxLng,

        safeOrgId,

        detailsJson,

        wo.createdByUid ?? null,
        wo.createdByEmail ?? null,
        wo.createdByFirstName ?? null,
        wo.createdByLastName ?? null,
        wo.createdByDisplayName ?? null,
        wo.assignedToUid ?? null,
        wo.assignedToName ?? null,
        wo.assignedToEmail ?? null,
        wo.deviceId ?? null,
        wo.appVersion ?? null,

        wo.assetId ?? null,
        assetMatchJson,
        attachmentsJson,
      ];

      const placeholders = insertValues.map(() => "?").join(", ");

      db.executeSync(
        `
        INSERT OR REPLACE INTO work_orders (${insertColumns.join(", ")})
        VALUES (${placeholders})
        `,
        insertValues,
      );
    });
  },

  async deleteById({ orgId, id }) {
    ensureOrgIdColumnReady("repositories.deleteById");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(orgId);
    db.executeSync(`DELETE FROM work_orders WHERE orgId = ? AND id = ?`, [safeOrgId, id]);
  },

  async updateFields({ orgId, id, patch }) {
    ensureOrgIdColumnReady("repositories.updateFields");
    ensureAttachmentsColumnReady();
    const safeOrgId = requireOrgId(orgId);
    withTxSync(() => {
      const sets: string[] = [];
      const vals: any[] = [];

      const set = (col: string, val: any) => {
        sets.push(`${col} = ?`);
        vals.push(val);
      };

      if (patch.type != null) set("type", patch.type);
      if (patch.status != null) set("status", patch.status);
      if (patch.priority != null) set("priority", patch.priority);
      if (patch.note !== undefined) set("note", patch.note ?? null);

      if (patch.details !== undefined) set("detailsJson", encodeDetails(patch.details));

      if (patch.createdByUid !== undefined) set("createdByUid", patch.createdByUid ?? null);
      if (patch.createdByEmail !== undefined) set("createdByEmail", patch.createdByEmail ?? null);
      if (patch.createdByFirstName !== undefined) set("createdByFirstName", patch.createdByFirstName ?? null);
      if (patch.createdByLastName !== undefined) set("createdByLastName", patch.createdByLastName ?? null);
      if (patch.createdByDisplayName !== undefined) set("createdByDisplayName", patch.createdByDisplayName ?? null);
      if (patch.assignedToUid !== undefined) set("assignedToUid", patch.assignedToUid ?? null);
      if (patch.assignedToName !== undefined) set("assignedToName", patch.assignedToName ?? null);
      if (patch.assignedToEmail !== undefined) set("assignedToEmail", patch.assignedToEmail ?? null);
      if (patch.deviceId !== undefined) set("deviceId", patch.deviceId ?? null);
      if (patch.appVersion !== undefined) set("appVersion", patch.appVersion ?? null);

      if (patch.assetId !== undefined) set("assetId", patch.assetId ?? null);
      if (patch.assetMatch !== undefined)
        set("assetMatchJson", patch.assetMatch ? safeJsonStringify(patch.assetMatch) : null);
      if (patch.attachments !== undefined) {
        const attachments = normalizeWorkOrderAttachments(patch.attachments, {
          orgId: safeOrgId,
          workOrderId: id,
        });
        if (__DEV__) {
          console.log("[workOrdersRepo.updateFields] attachments patch", {
            orgId: safeOrgId,
            workOrderId: id,
            attachmentsCount: attachments.length,
            storagePaths: attachments.map((a) => a.storagePath),
          });
        }
        set("attachmentsJson", attachments.length ? safeJsonStringify(attachments) : null);
      }

      // Always bump updatedAt unless caller explicitly set it
      const updatedAt = patch.updatedAt ?? Date.now();
      set("updatedAt", updatedAt);

      if (!sets.length) return;

      db.executeSync(
        `
        UPDATE work_orders
        SET ${sets.join(", ")}
        WHERE orgId = ? AND id = ?
        `,
        [...vals, safeOrgId, id],
      );
    });
  },
};
