// ═══════════════════════════════════════════════════════════════════════════
// OFFLINE-FIRST: Save Work Order + Enqueue for Sync
// ═══════════════════════════════════════════════════════════════════════════
//
// Applies to: MOBILE APP
// File: src/sync/enqueueWorkOrderUpsert.ts
//
// PURPOSE:
// Implements the "local-first" write pattern. When a user creates or edits
// a work order, this module:
//   1. Saves to offline_work_orders (local SQLite table)
//   2. Saves geometry to offline_work_order_geometry
//   3. Enqueues an UPSERT_WORK_ORDER entry in the outbox
//   4. All three operations in a single SQLite transaction (atomic)
//
// IMPORTANT — callers should NOT construct geometry/bbox.
// This function derives everything from the canonical WorkOrder object
// (which was already written to work_orders by workOrdersRepo.upsert).

import { addColumnIfMissing, db } from "../db/db";
import { requireOrgId } from "../org/requireOrg";
import { notifyEnqueued } from "./syncScheduler";
import type { WorkOrder } from "../types/WorkOrder";
import { normalizeWorkOrderDetailsForType } from "../workOrders/pavementDetails";
import { getTypeGroup } from "../workOrders/typeGroups";
import { toCreatorIdentitySnapshot } from "../utils/userIdentity";
import { normalizeWorkTypeKey } from "../constants/workOrderTypes";
import { normalizeWorkOrderAttachments } from "../workOrders/attachments";
import { updatePhotoDevDiagnostics } from "../services/workOrderPhotoDiagnosticsStore";

function now() {
  return Date.now();
}

function sanitizeLinePoints(line: any[] | null | undefined) {
  if (!Array.isArray(line)) return [];

  const cleaned: Array<{ lat: number; lng: number }> = [];

  for (const p of line) {
    if (!p || typeof p !== "object") continue;

    const lat =
      typeof (p as any).lat === "number"
        ? (p as any).lat
        : typeof (p as any).latitude === "number"
          ? (p as any).latitude
          : null;

    const lng =
      typeof (p as any).lng === "number"
        ? (p as any).lng
        : typeof (p as any).longitude === "number"
          ? (p as any).longitude
          : null;

    if (typeof lat !== "number" || typeof lng !== "number") continue;
    if (!isFinite(lat) || !isFinite(lng)) continue;

    cleaned.push({ lat, lng });
  }

  return cleaned;
}

function toGeoJsonCoords(line: Array<{ lat: number; lng: number }>) {
  return line.map((p) => [p.lng, p.lat]);
}

function inferAssetTypeFromWorkOrderType(typeRaw: string | null | undefined): "SIGN" | "GUARDRAIL" | "CULVERT" | null {
  switch (getTypeGroup(typeRaw)) {
    case "sign":
      return "SIGN";
    case "guardrail":
      return "GUARDRAIL";
    case "culvert":
      return "CULVERT";
    default:
      return null;
  }
}

/** Ensure offline tables exist even if migration 4 hasn't run yet. */
function ensureTables() {
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS offline_work_orders (
      id TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL,
      note TEXT,
      geometryType TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      createdByUid TEXT NOT NULL,
      createdByEmail TEXT,
      createdByFirstName TEXT,
      createdByLastName TEXT,
      createdByDisplayName TEXT,
      assignedToUid TEXT,
      assignedToName TEXT,
      assignedToEmail TEXT,
      assetId TEXT,
      assetMatchJson TEXT,
      attachmentsJson TEXT,
      detailsJson TEXT,
      needsSync INTEGER NOT NULL DEFAULT 1,
      deleted INTEGER NOT NULL DEFAULT 0
    );`
  );
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS offline_work_order_geometry (
      workOrderId TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      geoJson TEXT NOT NULL
    );`
  );
  db.executeSync(
    `CREATE TABLE IF NOT EXISTS outbox (
      id TEXT PRIMARY KEY NOT NULL,
      orgId TEXT NOT NULL,
      kind TEXT NOT NULL,
      entityId TEXT NOT NULL,
      payloadJson TEXT NOT NULL,
      createdAt INTEGER NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      lastError TEXT
    );`
  );

  // Backfill columns for users with older offline_work_orders schema.
  addColumnIfMissing("offline_work_orders", "detailsJson", "TEXT");
  addColumnIfMissing(
    "offline_work_orders",
    "needsSync",
    "INTEGER NOT NULL DEFAULT 1",
  );
  addColumnIfMissing(
    "offline_work_orders",
    "deleted",
    "INTEGER NOT NULL DEFAULT 0",
  );
  addColumnIfMissing("offline_work_orders", "createdByEmail", "TEXT");
  addColumnIfMissing("offline_work_orders", "createdByFirstName", "TEXT");
  addColumnIfMissing("offline_work_orders", "createdByLastName", "TEXT");
  addColumnIfMissing("offline_work_orders", "createdByDisplayName", "TEXT");
  addColumnIfMissing("offline_work_orders", "assignedToUid", "TEXT");
  addColumnIfMissing("offline_work_orders", "assignedToName", "TEXT");
  addColumnIfMissing("offline_work_orders", "assignedToEmail", "TEXT");
  addColumnIfMissing("offline_work_orders", "assetId", "TEXT");
  addColumnIfMissing("offline_work_orders", "assetMatchJson", "TEXT");
  addColumnIfMissing("offline_work_orders", "attachmentsJson", "TEXT");
}

let _tablesReady = false;

function ensureTablesOnce() {
  if (_tablesReady) return;
  ensureTables();
  _tablesReady = true;
  console.log("[Offline] outbox tables verified/created");
}

function enqueue(orgId: string, kind: string, entityId: string, payload: any) {
  const id = `${entityId}:${kind}:${now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, kind, entityId, JSON.stringify(payload), now()]
  );
}

// ─── Priority mapping (domain → offline table) ──────────────────────
const PRIORITY_TO_NUM: Record<string, number> = {
  None: 0,
  Low: 1,
  Medium: 2,
  High: 3,
  Urgent: 4,
};

/**
 * Accept the canonical WorkOrder (from workOrdersRepo) and enqueue for sync.
 * Maps domain values to the offline table's own schema internally.
 */
export function saveAndEnqueueWorkOrder(wo: WorkOrder) {
  const orgId = requireOrgId(wo.orgId);

  ensureTablesOnce();

  const t = wo.updatedAt || now();
  const numericPriority = PRIORITY_TO_NUM[wo.priority] ?? 0;
  const normalizedType = normalizeWorkTypeKey(wo.type);
  const payloadType = normalizedType || String(wo.type ?? "").trim();
  const geometryType = wo.geomType === "line" ? "Line" : "Point";
  const normalizedDetails = normalizeWorkOrderDetailsForType(wo.type, wo.details);
  const creator = toCreatorIdentitySnapshot({
    uid: wo.createdByUid,
    email: wo.createdByEmail,
    firstName: wo.createdByFirstName,
    lastName: wo.createdByLastName,
    displayName: wo.createdByDisplayName,
  });
  const assetId = wo.assetId ?? null;
  const assetType =
    assetId != null ? wo.assetType ?? inferAssetTypeFromWorkOrderType(wo.type) : null;
  const assetMatch = wo.assetMatch ?? null;
  const assetMatchJson = assetMatch ? JSON.stringify(assetMatch) : null;
  const attachments = normalizeWorkOrderAttachments(wo.attachments, {
    orgId,
    workOrderId: wo.id,
  });
  const attachmentsJson = attachments.length ? JSON.stringify(attachments) : null;
  const originalLine = Array.isArray(wo.line) ? wo.line : [];
  const cleanLine = sanitizeLinePoints(originalLine);
  const safeLine = cleanLine.length >= 2 ? cleanLine : [];
  const geo =
    geometryType === "Line"
      ? { type: "LineString", coordinates: toGeoJsonCoords(safeLine) }
      : { type: "Point", coordinates: [wo.lng ?? 0, wo.lat ?? 0] };
  const linePointCount = Array.isArray(wo.line) ? wo.line.length : 0;

  if (__DEV__ && String(wo.type ?? "").toLowerCase().includes("culvert")) {
    console.log("[CULVERT][CREATE] enqueue payload", {
      workOrderId: wo.id,
      orgId,
      geomType: wo.geomType,
      linePoints: Array.isArray(wo.line) ? wo.line.length : 0,
      geo,
    });
  }

  console.log("[Offline] saveAndEnqueueWorkOrder START", {
    id: wo.id,
    orgId,
    type: payloadType,
  });

  if (__DEV__) {
    console.log("[OutboxDiag][line-sanitized]", {
      originalCount: originalLine.length,
      cleanedCount: safeLine.length,
      sample: safeLine.slice(0, 2),
    });
    console.log("[OutboxDiag][geo-final]", JSON.stringify(geo));
  }

  db.executeSync("BEGIN");
  try {
    // Upsert offline_work_orders
    db.executeSync(
      `INSERT INTO offline_work_orders
        (id, orgId, type, status, priority, note, geometryType, createdAt, updatedAt, createdByUid, createdByEmail, createdByFirstName, createdByLastName, createdByDisplayName, assignedToUid, assignedToName, assignedToEmail, assetId, assetMatchJson, attachmentsJson, detailsJson, needsSync, deleted)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 0)
       ON CONFLICT(id) DO UPDATE SET
         type=excluded.type,
         status=excluded.status,
         priority=excluded.priority,
         note=excluded.note,
         geometryType=excluded.geometryType,
         updatedAt=excluded.updatedAt,
         createdByEmail=excluded.createdByEmail,
         createdByFirstName=excluded.createdByFirstName,
         createdByLastName=excluded.createdByLastName,
         createdByDisplayName=excluded.createdByDisplayName,
         assignedToUid=excluded.assignedToUid,
         assignedToName=excluded.assignedToName,
         assignedToEmail=excluded.assignedToEmail,
         assetId=excluded.assetId,
         assetMatchJson=excluded.assetMatchJson,
         attachmentsJson=excluded.attachmentsJson,
         detailsJson=excluded.detailsJson,
         needsSync=1,
         deleted=0`,
      [
        wo.id,
        orgId,
        wo.type,
        wo.status,
        numericPriority,
        wo.note ?? null,
        geometryType,
        wo.createdAt || t,
        t,
        creator.uid,
        creator.email,
        creator.firstName,
        creator.lastName,
        creator.displayName,
        wo.assignedToUid ?? null,
        wo.assignedToName ?? null,
        wo.assignedToEmail ?? null,
        assetId,
        assetMatchJson,
        attachmentsJson,
        normalizedDetails ? JSON.stringify(normalizedDetails) : null,
      ]
    );

    // Upsert geometry
    db.executeSync(
      `INSERT INTO offline_work_order_geometry (workOrderId, orgId, geoJson)
       VALUES (?, ?, ?)
       ON CONFLICT(workOrderId) DO UPDATE SET geoJson=excluded.geoJson`,
      [wo.id, orgId, JSON.stringify(geo)]
    );

    if (__DEV__ && String(wo.type ?? "").toLowerCase().includes("culvert")) {
      console.log("[CULVERT][CREATE] geometry saved", {
        workOrderId: wo.id,
        orgId,
        geometryType,
        geo,
      });
    }

    // Enqueue for sync
    if (__DEV__) {
      console.log(`[Sync] UPSERT_WORK_ORDER enqueue attachments count: ${attachments.length}`);
      const woAny = wo as any;
      console.log("[OutboxDiag][local] work-order row", {
        workOrderId: wo.id,
        orgId,
        type: payloadType,
        status: wo.status,
        priority: wo.priority,
        geometryType,
        lat: wo.lat ?? null,
        lng: wo.lng ?? null,
        hasLineJson: linePointCount > 0,
        linePointCount,
        hasDetailsJson: normalizedDetails != null,
        assetId,
        assetType,
        assetMatchMethod: assetMatch?.method ?? null,
        attachmentsCount: attachments.length,
        assignedToUserId: wo.assignedToUid ?? null,
        assignedToName: wo.assignedToName ?? null,
        createdBy: creator.uid ?? null,
        createdByName: creator.displayName ?? null,
        updatedBy: woAny.updatedByUid ?? null,
        updatedByName: woAny.updatedByDisplayName ?? woAny.updatedByName ?? null,
      });
    }

    const outboxPayload = {
      id: wo.id,
      orgId,
      type: payloadType,
      status: wo.status,
      priority: numericPriority,
      note: wo.note ?? null,
      geometryType,
      geo,
      createdAt: wo.createdAt || t,
      createdByUid: creator.uid,
      createdByEmail: creator.email,
      createdByFirstName: creator.firstName,
      createdByLastName: creator.lastName,
      createdByDisplayName: creator.displayName,
      assignedToUid: wo.assignedToUid ?? null,
      assignedToName: wo.assignedToName ?? null,
      assignedToEmail: wo.assignedToEmail ?? null,
      assetId,
      assetType,
      assetMatch,
      attachments,
      updatedAt: t,
      details: normalizedDetails,
    };

    if (__DEV__) {
      const payloadAttachmentsCount = Array.isArray(outboxPayload.attachments)
        ? outboxPayload.attachments.length
        : 0;
      if (attachments.length > 0 && payloadAttachmentsCount < 1) {
        console.error("attachments dropped before outbox payload", {
          workOrderId: wo.id,
          attachmentsCountBeforePayload: attachments.length,
          payloadAttachmentsCount,
        });
      }

      console.log("[Sync][enqueueWorkOrderUpsert]", {
        workOrderId: wo.id,
        attachmentsCount: payloadAttachmentsCount,
        storagePaths: Array.isArray(outboxPayload.attachments)
          ? outboxPayload.attachments.map((a: any) => a?.storagePath).filter(Boolean)
          : [],
      });

      updatePhotoDevDiagnostics(wo.id, {
        latestQueuedAttachmentsCount: payloadAttachmentsCount,
        latestQueuedAttachmentStoragePaths: Array.isArray(outboxPayload.attachments)
          ? outboxPayload.attachments.map((a: any) => String(a?.storagePath ?? "")).filter(Boolean)
          : [],
        latestAttachmentWriteStage: "enqueueWorkOrderUpsert",
      });
    }

    enqueue(orgId, "UPSERT_WORK_ORDER", wo.id, outboxPayload);

    db.executeSync("COMMIT");
    console.log("[Offline] saveAndEnqueueWorkOrder COMMITTED", {
      id: wo.id,
    });

    // Trigger an immediate scheduler pass after outbox write is durable.
    notifyEnqueued();
  } catch (e) {
    db.executeSync("ROLLBACK");
    console.error("[Offline] saveAndEnqueueWorkOrder ROLLBACK", e);
    throw e;
  }
}
