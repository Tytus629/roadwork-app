// Applies to: MOBILE APP
// File: src/sync/outboxSync.ts
//
// Outbox sync engine: processes queued offline operations and sends them
// to Firebase Cloud Functions. Uses synchronous op-sqlite (db.executeSync).

import { db } from "../db/db";
import { requireOrgId } from "../org/requireOrg";
import { getApp } from "@react-native-firebase/app";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";
import { assertOrgScopedPathsInPayload } from "../firebase/storagePaths";
import {
  isPavementRepairType,
  normalizePavementRepairDetails,
  normalizeWorkOrderDetailsForType,
  validatePavementRepairDetails,
} from "../workOrders/pavementDetails";
import { normalizeWorkOrderAttachments } from "../workOrders/attachments";
import { getTypeGroup } from "../workOrders/typeGroups";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";
import { updatePhotoDevDiagnostics } from "../services/workOrderPhotoDiagnosticsStore";

// ─── Types ───────────────────────────────────────────────────────────────

export type OutboxKind =
  | "UPSERT_WORK_ORDER"
  | "DELETE_WORK_ORDER"
  | "UPSERT_ASSET"
  | "ADD_ASSET_EVENT"
  | "UPSERT_TAILGATE"
  | "UPSERT_MAINTENANCE_SLIP"
  | "UPSERT_DMI"
  | "UPSERT_COUNTER";

type OutboxRow = {
  id: string;
  orgId: string;
  kind: string;
  entityId: string;
  payloadJson: string;
  createdAt: number;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
};

export const OUTBOX_MAX_ROW_ATTEMPTS = 10;

// ─── Row-level backoff ───────────────────────────────────────────────────

/** Minimum seconds to wait before retrying a row, based on its attempt count. */
function rowBackoffMs(attempts: number): number {
  if (attempts <= 0) return 0;
  // 5s → 10s → 20s → 40s → 80s → … caps at 1 hour
  return Math.min(60 * 60 * 1000, Math.pow(2, attempts) * 5_000);
}

// ─── Helpers ─────────────────────────────────────────────────────────────

let _syncInFlight = false;

function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
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

function normalizeLinkedAssetType(raw: unknown): "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE" | null {
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return null;

  if (t === "sign" || t === "signs") return "SIGN";
  if (t === "guardrail" || t === "guard_rail" || t === "guardrails") return "GUARDRAIL";
  if (t === "culvert" || t === "culverts" || t === "drain_pipe" || t === "drainpipe") {
    return "CULVERT";
  }
  if (t === "bridge" || t === "bridges") return "BRIDGE";

  return null;
}

function normalizeAssetMatchMethod(raw: unknown): "USER_SELECTED" | "AUTO_MATCH" | "AUTO_CREATE" | null {
  const method = String(raw ?? "").trim().toUpperCase();
  if (method === "USER_SELECTED" || method === "AUTO_MATCH" || method === "AUTO_CREATE") {
    return method;
  }
  return null;
}

function normalizeAssetType(raw: unknown): "sign" | "guardrail" | "culvert" | "bridge" | null {
  const normalized = normalizeLinkedAssetType(raw);
  if (normalized === "SIGN") return "sign";
  if (normalized === "GUARDRAIL") return "guardrail";
  if (normalized === "CULVERT") return "culvert";
  if (normalized === "BRIDGE") return "bridge";
  return null;
}

function isRecord(value: unknown): value is Record<string, any> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function cloneRetryPayload(payload: Record<string, any>): Record<string, any> {
  const clone: Record<string, any> = { ...payload };
  if (isRecord(payload.assetMatch)) clone.assetMatch = { ...payload.assetMatch };
  if (isRecord(payload.assetRef)) clone.assetRef = { ...payload.assetRef };
  if (isRecord(payload.assetLinkage)) {
    clone.assetLinkage = { ...payload.assetLinkage };
    if (isRecord(payload.assetLinkage.asset)) {
      clone.assetLinkage.asset = { ...payload.assetLinkage.asset };
    }
  }
  return clone;
}

function applyLinkageCompatibilityAliases(linkage: Record<string, any>) {
  const assetId = linkage.assetId ?? null;
  const assetType = normalizeAssetType(linkage.assetType ?? linkage.type ?? linkage.asset_type);
  const assetMatchMethod = linkage.assetMatchMethod ?? null;

  // Compatibility aliases for older backend linkage contracts.
  linkage.type = assetType;
  linkage.asset_type = assetType;
  linkage.assetType = assetType;
  linkage.method = assetMatchMethod;
  linkage.matchMethod = assetMatchMethod;

  const nestedAsset = isRecord(linkage.asset) ? { ...linkage.asset } : {};
  nestedAsset.id = assetId;
  nestedAsset.assetType = assetType;
  nestedAsset.type = assetType;
  linkage.asset = nestedAsset;
}

function applyTopLevelAssetRefCompatibility(payload: Record<string, any>) {
  const existingAssetRef = isRecord(payload.assetRef) ? payload.assetRef : {};
  const assetMatchMethod = normalizeAssetMatchMethod(
    payload.assetMatch?.method ?? payload.assetMatchMethod ?? null
  );
  const assetTypeSlug = normalizeAssetType(payload.assetType ?? existingAssetRef.assetType ?? existingAssetRef.type);

  payload.assetRef = {
    ...existingAssetRef,
    id: payload.assetId ?? null,
    assetId: payload.assetId ?? null,
    // Backend validator currently expects lowercase here.
    assetType: assetTypeSlug ?? null,
    type: assetTypeSlug ?? null,
    matchMethod: assetMatchMethod,
    method: assetMatchMethod,
  };
}

type LinkageRepairSummary = {
  assetTypeSource: "payload" | "assets-table" | "type-group" | "sign-fallback" | null;
  assetMatchMethod: "USER_SELECTED" | "AUTO_MATCH" | "AUTO_CREATE" | null;
  hasAssetLinkageObject: boolean;
};

function repairWorkOrderLinkagePayload(payload: Record<string, any>): LinkageRepairSummary {
  if (payload.assetMatch === undefined && typeof payload.assetMatchJson === "string") {
    try {
      payload.assetMatch = JSON.parse(payload.assetMatchJson);
    } catch {
      payload.assetMatch = null;
    }
  }

  const existingLinkage = isRecord(payload.assetLinkage) ? payload.assetLinkage : null;

  if (payload.assetId == null && existingLinkage?.assetId != null) payload.assetId = existingLinkage.assetId;
  if (payload.assetType == null && existingLinkage?.assetType != null) payload.assetType = existingLinkage.assetType;
  if (payload.assetMatchMethod == null && existingLinkage?.assetMatchMethod != null) {
    payload.assetMatchMethod = existingLinkage.assetMatchMethod;
  }

  if (payload.assetId === undefined) payload.assetId = null;
  if (payload.assetType === undefined) payload.assetType = null;

  const canonicalPayloadAssetType = normalizeAssetType(
    payload.assetType ?? existingLinkage?.assetType ?? null
  );
  if (canonicalPayloadAssetType) {
    payload.assetType = canonicalPayloadAssetType;
  }

  const assetMatchMethod = normalizeAssetMatchMethod(
    payload.assetMatch?.method ?? payload.assetMatchMethod ?? existingLinkage?.assetMatchMethod ?? null
  );

  if (assetMatchMethod) {
    payload.assetMatchMethod = assetMatchMethod;
    if (isRecord(payload.assetMatch)) {
      payload.assetMatch = { ...payload.assetMatch, method: assetMatchMethod };
    } else {
      payload.assetMatch = { method: assetMatchMethod };
    }
  }

  let assetTypeSource: "payload" | "assets-table" | "type-group" | "sign-fallback" | null = null;

  if (payload.assetId) {
    const existing = normalizeAssetType(payload.assetType ?? existingLinkage?.assetType ?? null);
    if (existing) {
      payload.assetType = existing;
      assetTypeSource = "payload";
    } else {
      const fromAssetRow = normalizeAssetType(
        readAssetTypeForAssetId(payload.orgId, payload.assetId)
      );
      if (fromAssetRow) {
        payload.assetType = fromAssetRow;
        assetTypeSource = "assets-table";
      } else {
        const inferred = inferAssetTypeFromWorkOrderType(payload.type);
        if (inferred) {
          payload.assetType = normalizeAssetType(inferred);
          assetTypeSource = "type-group";
        } else {
          const typeRaw = String(payload.type ?? "").trim().toLowerCase();
          if (typeRaw === "sign") {
            payload.assetType = "sign";
            assetTypeSource = "sign-fallback";
          }
        }
      }
    }
  }

  const shouldAttachLinkage =
    !!payload.assetId ||
    !!payload.assetType ||
    !!assetMatchMethod ||
    !!existingLinkage;

  if (shouldAttachLinkage) {
    const linkage = existingLinkage ? { ...existingLinkage } : {};
    linkage.assetId = payload.assetId ?? null;
    linkage.assetType = normalizeAssetType(payload.assetType ?? linkage.assetType ?? null);
    if (assetMatchMethod) {
      linkage.assetMatchMethod = assetMatchMethod;
    }
    applyLinkageCompatibilityAliases(linkage);
    payload.assetLinkage = linkage;
  }

  if (payload.assetId || payload.assetType) {
    applyTopLevelAssetRefCompatibility(payload);
  }

  return {
    assetTypeSource,
    assetMatchMethod,
    hasAssetLinkageObject: shouldAttachLinkage,
  };
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function lineCoordsToLegacyGeo(
  coordinates: unknown,
): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(coordinates)) return [];

  const legacy: Array<{ lat: number; lng: number }> = [];
  for (const c of coordinates) {
    if (!Array.isArray(c) || c.length < 2) continue;
    const lng = c[0];
    const lat = c[1];
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) continue;
    legacy.push({ lat, lng });
  }
  return legacy;
}

function legacyGeoToLineString(
  line: unknown,
): { type: "LineString"; coordinates: number[][] } | null {
  if (!Array.isArray(line)) return null;

  const coords: number[][] = [];
  for (const p of line) {
    if (!isRecord(p)) continue;
    const lat = p.lat;
    const lng = p.lng;
    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) continue;
    coords.push([lng, lat]);
  }

  return coords.length >= 2 ? { type: "LineString", coordinates: coords } : null;
}

function legacyGeoToPoint(
  point: unknown,
): { type: "Point"; coordinates: [number, number] } | null {
  if (!isRecord(point)) return null;
  const lat = point.lat;
  const lng = point.lng;
  if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) return null;
  return { type: "Point", coordinates: [lng, lat] };
}

function normalizeWorkOrderGeometryPayload(payload: Record<string, any>) {
  const geometryObj = isRecord(payload.geometry) ? payload.geometry : null;
  const geoObj = isRecord(payload.geo) ? payload.geo : null;

  if (!geometryObj && geoObj && typeof geoObj.type === "string" && Array.isArray(geoObj.coordinates)) {
    payload.geometry = {
      type: geoObj.type,
      coordinates: geoObj.coordinates,
    };
  }

  const geometry = isRecord(payload.geometry) ? payload.geometry : null;
  const geometryType = String(geometry?.type ?? payload.geometryType ?? "").toLowerCase();

  if (geometryType === "linestring") {
    const legacyLine = lineCoordsToLegacyGeo(geometry?.coordinates);
    if (legacyLine.length >= 2) {
      payload.geo = legacyLine;
    }
    return;
  }

  if (geometryType === "point") {
    if (Array.isArray(geometry?.coordinates) && geometry.coordinates.length >= 2) {
      const lng = geometry.coordinates[0];
      const lat = geometry.coordinates[1];
      if (isFiniteNumber(lat) && isFiniteNumber(lng)) {
        payload.geo = { lat, lng };
      }
    }
    return;
  }

  const geoLineGeometry = legacyGeoToLineString(payload.geo);
  if (geoLineGeometry) {
    payload.geometry = geoLineGeometry;
    return;
  }

  const geoPointGeometry = legacyGeoToPoint(payload.geo);
  if (geoPointGeometry) {
    payload.geometry = geoPointGeometry;
  }
}

function summarizeGeometryPresence(payload: Record<string, any>) {
  const geo = payload.geo;
  const geometry = isRecord(payload.geometry) ? payload.geometry : null;

  return {
    hasGeoArray: Array.isArray(geo),
    hasGeoPointObject: isRecord(geo) && isFiniteNumber(geo.lat) && isFiniteNumber(geo.lng),
    hasGeometryObject: !!geometry,
    geometryShapeType: typeof geometry?.type === "string" ? geometry.type : null,
    linePointCount: Array.isArray(geo) ? geo.length : 0,
    lineCoordCount: Array.isArray(geometry?.coordinates) ? geometry.coordinates.length : 0,
    payloadGeoPresent: payload.geo !== undefined,
    payloadGeometryPresent: payload.geometry !== undefined,
  };
}

function logOutgoingWorkOrderPayload(
  stage: string,
  rowId: string,
  payload: Record<string, any>
) {
  if (!__DEV__) return;
  const linkage = isRecord(payload.assetLinkage) ? payload.assetLinkage : null;
  const assetMatchMethod = normalizeAssetMatchMethod(
    payload.assetMatch?.method ?? payload.assetMatchMethod ?? linkage?.assetMatchMethod ?? null
  );
  const finalAssetType = normalizeAssetType(payload.assetType ?? linkage?.assetType ?? null);
  const geometryPresence = summarizeGeometryPresence(payload);

  console.log("[Sync] roadwork_upsertWorkOrder outgoing", {
    stage,
    rowId,
    workOrderId: payload.id ?? payload.workOrderId ?? null,
    type: payload.type ?? null,
    assetId: payload.assetId ?? null,
    assetType: finalAssetType,
    assetMatchMethod,
    hasAssetLinkageObject: !!linkage,
    linkageAssetId: linkage?.assetId ?? null,
    linkageAssetType: normalizeAssetType(linkage?.assetType ?? null),
    linkageTypeAlias: linkage?.type ?? null,
    linkageNestedAssetType:
      isRecord(linkage?.asset)
        ? normalizeAssetType(linkage?.asset?.assetType ?? linkage?.asset?.type ?? null)
        : null,
    assetRefAssetType:
      isRecord(payload.assetRef)
        ? normalizeAssetType(payload.assetRef.assetType ?? payload.assetRef.type ?? null)
        : null,
    ...geometryPresence,
  });
}

function readAssetTypeForAssetId(orgIdRaw: string | null | undefined, assetIdRaw: string | null | undefined): string | null {
  const orgId = requireOrgId(orgIdRaw);
  const assetId = String(assetIdRaw ?? "").trim();
  if (!assetId) return null;

  const r = db.executeSync(
    `SELECT assetType FROM assets WHERE orgId = ? AND id = ? LIMIT 1`,
    [orgId, assetId]
  );
  const rows = readRows(r);
  if (!rows.length) return null;
  return rows[0]?.assetType ?? null;
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

function parsePayloadJson(payloadJson: string): any {
  try {
    return JSON.parse(payloadJson);
  } catch {
    return null;
  }
}

function getWorkOrderLinePoints(payload: any): any[] | null {
  if (Array.isArray(payload?.geo)) return payload.geo;
  if (Array.isArray(payload?.geo?.line)) return payload.geo.line;
  if (Array.isArray(payload?.line)) return payload.line;
  if (Array.isArray(payload?.geometry?.coordinates)) return payload.geometry.coordinates;
  return null;
}

function summarizeWorkOrderPayload(
  payload: any,
  rowId: string | null = null,
): Record<string, any> {
  const linePoints = getWorkOrderLinePoints(payload);
  const details =
    payload?.details && typeof payload.details === "object" && !Array.isArray(payload.details)
      ? payload.details
      : null;
  const linkage = isRecord(payload?.assetLinkage) ? payload.assetLinkage : null;
  const assetRef = isRecord(payload?.assetRef) ? payload.assetRef : null;

  return {
    rowId,
    workOrderId: payload?.workOrderId ?? payload?.id ?? null,
    orgId: payload?.orgId ?? null,
    type: payload?.type ?? null,
    status: payload?.status ?? null,
    priority: payload?.priority ?? null,
    geometryType: payload?.geometryType ?? payload?.geometry?.type ?? null,
    hasGeo: !!payload?.geo || !!payload?.geometry,
    pointLat: payload?.lat ?? payload?.geo?.lat ?? payload?.point?.lat ?? null,
    pointLng: payload?.lng ?? payload?.geo?.lng ?? payload?.point?.lng ?? null,
    linePointCount: Array.isArray(linePoints) ? linePoints.length : 0,
    hasDetails: !!details,
    detailsKeys: details ? Object.keys(details).sort() : [],
    attachmentsCount: Array.isArray(payload?.attachments) ? payload.attachments.length : 0,
    assetId: payload?.assetId ?? assetRef?.assetId ?? assetRef?.id ?? null,
    assetType: payload?.assetType ?? assetRef?.assetType ?? assetRef?.type ?? null,
    assetMatchMethod: payload?.assetMatchMethod ?? payload?.assetMatch?.method ?? null,
    hasAssetRef: !!assetRef,
    hasAssetLinkageObject: !!linkage,
    linkageAssetId: linkage?.assetId ?? null,
    linkageAssetType: linkage?.assetType ?? linkage?.type ?? null,
    createdBy: payload?.createdByUid ?? payload?.createdBy ?? null,
    createdByName:
      payload?.createdByDisplayName ?? payload?.createdByName ?? payload?.createdBy ?? null,
    updatedBy: payload?.updatedByUid ?? payload?.updatedBy ?? null,
    updatedByName: payload?.updatedByDisplayName ?? payload?.updatedByName ?? null,
    appVersion: payload?.appVersion ?? null,
    schemaVersion: payload?.schemaVersion ?? null,
    topLevelKeys:
      payload && typeof payload === "object" && !Array.isArray(payload)
        ? Object.keys(payload).sort()
        : [],
  };
}

function logWorkOrderRetryDiff(
  rowId: string,
  stepLabel: string,
  beforePayload: Record<string, any>,
  afterPayload: Record<string, any>,
) {
  if (!__DEV__) return;

  const before = summarizeWorkOrderPayload(beforePayload, rowId);
  const after = summarizeWorkOrderPayload(afterPayload, rowId);

  const beforeKeys = new Set(before.topLevelKeys as string[]);
  const afterKeys = new Set(after.topLevelKeys as string[]);

  const droppedTopLevelKeys = Array.from(beforeKeys).filter((k) => !afterKeys.has(k)).sort();
  const addedTopLevelKeys = Array.from(afterKeys).filter((k) => !beforeKeys.has(k)).sort();

  const changed: Record<string, { before: any; after: any }> = {};
  const tracked = [
    "type",
    "status",
    "priority",
    "geometryType",
    "assetId",
    "assetType",
    "assetMatchMethod",
    "hasAssetRef",
    "hasAssetLinkageObject",
    "linkageAssetId",
    "linkageAssetType",
    "hasDetails",
    "detailsKeys",
    "linePointCount",
  ];

  for (const key of tracked) {
    const prev = (before as any)[key];
    const next = (after as any)[key];
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      changed[key] = { before: prev, after: next };
    }
  }

  console.log("[OutboxDiag][retry-diff] roadwork_upsertWorkOrder", {
    rowId,
    step: stepLabel,
    droppedTopLevelKeys,
    addedTopLevelKeys,
    changed,
  });
}

function compactPayloadSummary(payload: any, row: Pick<OutboxRow, "orgId" | "entityId">) {
  const workOrderId = payload?.id ?? payload?.workOrderId ?? row.entityId ?? null;
  const assetMatchMethod = payload?.assetMatch?.method ?? payload?.assetMatchMethod ?? null;
  const hasGeo =
    !!payload?.geo ||
    (!!payload?.lat && !!payload?.lng) ||
    (Array.isArray(payload?.line) && payload.line.length > 0);

  return {
    workOrderId,
    type: payload?.type ?? null,
    orgId: payload?.orgId ?? row.orgId ?? null,
    assetId: payload?.assetId ?? null,
    assetType: payload?.assetType ?? null,
    assetMatchMethod,
    hasDetails: payload?.details != null,
    status: payload?.status ?? null,
    hasGeometry: hasGeo,
  };
}

function getRowRetryState(rowId: string): {
  exists: boolean;
  attempts: number | null;
  nextAttemptAt: number | null;
  lastError: string | null;
} {
  const r = db.executeSync(
    `SELECT attempts, nextAttemptAt, lastError FROM outbox WHERE id = ? LIMIT 1`,
    [rowId]
  );
  const rows = readRows(r);
  if (!rows.length) {
    return { exists: false, attempts: null, nextAttemptAt: null, lastError: null };
  }

  const row = rows[0] ?? {};
  return {
    exists: true,
    attempts: Number(row.attempts ?? 0),
    nextAttemptAt: row.nextAttemptAt != null ? Number(row.nextAttemptAt) : null,
    lastError: row.lastError ?? null,
  };
}

/**
 * Temporary Metro debug helper: prints all pending outbox rows and compact payload summaries.
 */
export function debugDumpPendingOutboxRows(orgIdRaw: string, context = "manual") {
  if (!__DEV__) return;

  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `SELECT * FROM outbox WHERE orgId = ? AND attempts < ? ORDER BY createdAt ASC`,
    [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
  );
  const rows = readRows(result) as OutboxRow[];
  const staleResult = db.executeSync(
    `SELECT COUNT(1) AS c FROM outbox WHERE orgId = ? AND attempts >= ?`,
    [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
  );
  const staleCount = Number(readRows(staleResult)?.[0]?.c ?? 0);
  const failedCount = rows.filter((r) => (r.attempts ?? 0) > 0 || !!r.lastError).length;

  console.log(`[OutboxDebug] cycle context=${context} pending=${rows.length} failed=${failedCount} stale=${staleCount}`);

  for (const row of rows) {
    const payload = parsePayloadJson(row.payloadJson);
    const payloadSummary = compactPayloadSummary(payload, row);
    const nextAttemptAt = row.nextAttemptAt != null ? Number(row.nextAttemptAt) : null;
    const dueInMs =
      nextAttemptAt != null && Number.isFinite(nextAttemptAt)
        ? Math.max(0, nextAttemptAt - Date.now())
        : 0;
    console.log("[OutboxDebug] row", {
      rowId: row.id,
      kind: row.kind,
      entityId: row.entityId ?? null,
      workOrderId: payloadSummary.workOrderId,
      createdAt: row.createdAt ?? payload?.createdAt ?? null,
      updatedAt: payload?.updatedAt ?? null,
      attemptCount: row.attempts ?? 0,
      nextAttemptAt,
      dueInMs,
      lastError: row.lastError ?? null,
      payload: payloadSummary,
    });
    console.log(
      `[OutboxDebug] row-summary rowId=${row.id} kind=${row.kind} workOrderId=${String(payloadSummary.workOrderId ?? "")} type=${String(payloadSummary.type ?? "")} orgId=${String(payloadSummary.orgId ?? "")} assetId=${String(payloadSummary.assetId ?? "")} assetType=${String(payloadSummary.assetType ?? "")} assetMatchMethod=${String(payloadSummary.assetMatchMethod ?? "")} hasDetails=${payloadSummary.hasDetails ? "1" : "0"} status=${String(payloadSummary.status ?? "")} hasGeometry=${payloadSummary.hasGeometry ? "1" : "0"} attempts=${row.attempts ?? 0} dueInMs=${dueInMs} lastError=${String(row.lastError ?? "")}`
    );
  }
}

/**
 * DEV-ONLY SAFETY HELPER:
 * Removes rows that repeatedly fail with invalid_argument payload errors.
 * Intended for stale pre-fix work-order rows that cannot recover.
 */
export async function clearFailedOutboxRows(orgIdRaw?: string): Promise<number> {
  if (!__DEV__) {
    return 0;
  }

  const whereOrg = orgIdRaw ? " AND orgId = ?" : "";
  const args: any[] = [];
  if (orgIdRaw) {
    args.push(requireOrgId(orgIdRaw));
  }

  const rowsResult = db.executeSync(
    `SELECT id FROM outbox
     WHERE attempts >= 3
       AND LOWER(COALESCE(lastError, '')) LIKE '%invalid_argument%'
       ${whereOrg}`,
    args
  );

  const rows = readRows(rowsResult);
  let removed = 0;

  for (const r of rows) {
    const id = String(r?.id ?? "").trim();
    if (!id) continue;
    db.executeSync(`DELETE FROM outbox WHERE id = ?`, [id]);
    removed += 1;
  }

  console.log("[OutboxDev] clearFailedOutboxRows", {
    orgId: orgIdRaw ?? null,
    removed,
  });

  return removed;
}

function markWorkOrderSynced(orgId: string, workOrderId: string) {
  db.executeSync(
    `UPDATE offline_work_orders SET needsSync=0 WHERE orgId=? AND id=?`,
    [orgId, workOrderId]
  );
}

function deleteOutboxRow(id: string) {
  db.executeSync(`DELETE FROM outbox WHERE id=?`, [id]);
}

function bumpOutboxError(id: string, errMsg: string, currentAttempts: number) {
  const attempts = currentAttempts + 1;
  const delayMs = rowBackoffMs(attempts);
  const now = Date.now();
  const nextAttemptAt = now + delayMs;
  db.executeSync(
    `UPDATE outbox SET attempts=?, lastError=?, lastAttemptAt=?, nextAttemptAt=? WHERE id=?`,
    [attempts, errMsg.slice(0, 500), now, nextAttemptAt, id]
  );
}

// ─── Callable references (lazy-init) ────────────────────────────────────

// In dev/emulator mode, the Android Firebase SDK's httpsCallable fails with
// "1 out of 2 underlying tasks failed" because it tries to fetch an App Check
// token alongside the Auth token. App Check isn't configured for emulators,
// so we bypass the native SDK entirely and use a direct HTTP fetch.

async function callFn(name: string, data: any): Promise<any> {
  if (__DEV__) {
    return callDevFunctionHttp(name, data);
  }

  // Production: use the native SDK
  const fn = httpsCallable(getFunctions(getApp()), name);
  return fn(data);
}

// ─── Row handler ─────────────────────────────────────────────────────────

async function handleRow(row: OutboxRow) {
  const payload = JSON.parse(row.payloadJson);
  // Validate orgId before sending to Cloud Function
  requireOrgId(payload.orgId);
  // Enforce org-scoped storage path convention when payload includes uploads.
  assertOrgScopedPathsInPayload(payload.orgId, payload);

  switch (row.kind) {
    case "UPSERT_WORK_ORDER": {
      const workOrderId = payload.id ?? payload.workOrderId;
      setCustomKeySafe("orgId", payload.orgId ?? row.orgId ?? "");
      setCustomKeySafe("workOrderId", workOrderId ?? row.entityId ?? "");
      setCustomKeySafe("syncDirection", "outbound");
      setCustomKeySafe("syncStage", "row_start");
      logSyncBreadcrumb("outbound wo row start", {
        syncDirection: "outbound",
        syncStage: "row_start",
        orgId: payload.orgId ?? row.orgId ?? null,
        workOrderId: workOrderId ?? row.entityId ?? null,
        attempts: row.attempts ?? 0,
      });

      const {
        assetTypeSource,
        assetMatchMethod,
        hasAssetLinkageObject,
      } = repairWorkOrderLinkagePayload(payload);

      normalizeWorkOrderGeometryPayload(payload);
      const geometryPresence = summarizeGeometryPresence(payload);

      payload.details = normalizeWorkOrderDetailsForType(payload.type, payload.details);
      payload.attachments = normalizeWorkOrderAttachments(payload.attachments, {
        orgId: payload.orgId,
        workOrderId: workOrderId ?? row.entityId,
      });

      if (__DEV__) {
        const attachmentsCount = Array.isArray(payload.attachments) ? payload.attachments.length : 0;
        const attachmentStoragePaths = Array.isArray(payload.attachments)
          ? payload.attachments.map((a: any) => a?.storagePath).filter(Boolean)
          : [];
        console.log(`[Sync] UPSERT_WORK_ORDER attachments count: ${attachmentsCount}`);
        console.log(`[Sync] UPSERT_WORK_ORDER attachment storagePaths: ${JSON.stringify(attachmentStoragePaths)}`);
        console.log("[Sync] UPSERT_WORK_ORDER attachments", {
          orgId: payload.orgId,
          workOrderId,
          attachmentsCount,
          storagePaths: attachmentStoragePaths,
        });

        if (workOrderId) {
          updatePhotoDevDiagnostics(String(workOrderId), {
            latestSentAttachmentsCount: attachmentsCount,
            latestSentAttachmentStoragePaths: attachmentStoragePaths,
            latestAttachmentWriteStage: "outboxSync-before-send",
          });
        }
      }

      if (isPavementRepairType(payload.type)) {
        const normalized = normalizePavementRepairDetails(payload.details);
        const errors = validatePavementRepairDetails(normalized);
        if (errors.length) {
          throw new Error(`Invalid pavement details: ${errors.join(" ")}`);
        }
        payload.details = normalized ?? null;
      }

      if (__DEV__) {
        console.log("[Sync] UPSERT_WORK_ORDER payload", {
          orgId: payload.orgId,
          workOrderId,
          type: payload.type,
          geometryType: payload.geometryType,
          hasGeo: !!payload.geo,
          ...geometryPresence,
          hasDetails: !!payload.details,
          attachmentsCount: Array.isArray(payload.attachments) ? payload.attachments.length : 0,
          hasAssetId: !!payload.assetId,
          assetType: payload.assetType ?? null,
          assetTypeSource,
          assetMatchMethod,
          hasAssetLinkageObject,
        });
        console.log("[Sync] UPSERT_WORK_ORDER linkage", {
          workOrderId,
          assetId: payload.assetId ?? null,
          assetType: payload.assetType ?? null,
          assetTypeSource,
          assetMatchMethod,
          hasAssetLinkageObject,
        });
      }

      // Step 1: Call the Cloud Function
      if (__DEV__) {
        const payloadSummary = summarizeWorkOrderPayload(payload, row.id);
        console.log("[OutboxDiag][send-initial] roadwork_upsertWorkOrder", payloadSummary);
        console.log("[OutboxDebug] sending roadwork_upsertWorkOrder", {
          rowId: row.id,
          kind: row.kind,
          attemptCount: row.attempts ?? 0,
          payload: compactPayloadSummary(payload, row),
        });
      }
      console.log("[Sync] step 1 START — calling roadwork_upsertWorkOrder");
      setCustomKeySafe("syncStage", "step1_start");
      logSyncBreadcrumb("outbound wo step1 start", {
        syncDirection: "outbound",
        syncStage: "step1_start",
        orgId: payload.orgId ?? row.orgId ?? null,
        workOrderId: workOrderId ?? row.entityId ?? null,
      });
      let res: any;
      try {
        logOutgoingWorkOrderPayload("initial", row.id, payload);
        res = await callFn("roadwork_upsertWorkOrder", payload);
        console.log("[Sync] step 1 OK — response:", res?.data ?? res?.result);
        if (__DEV__) {
          const attachmentsCountSent = Array.isArray(payload.attachments) ? payload.attachments.length : 0;
          console.log("[Sync][outboxSync-after-send]", {
            workOrderId,
            backendResult: "success",
            attachmentsCountSent,
          });
          if (workOrderId) {
            updatePhotoDevDiagnostics(String(workOrderId), {
              latestBackendUpsertResult: "success",
              latestSentAttachmentsCount: attachmentsCountSent,
              latestAttachmentWriteStage: "outboxSync-after-send-success",
            });
          }
        }
        setCustomKeySafe("syncStage", "step1_success");
        logSyncBreadcrumb("outbound wo step1 success", {
          syncDirection: "outbound",
          syncStage: "step1_success",
          orgId: payload.orgId ?? row.orgId ?? null,
          workOrderId: workOrderId ?? row.entityId ?? null,
        });
      } catch (e1: any) {
        const msg = String(e1?.message ?? "");
        const looksInternal = /\bINTERNAL\b/i.test(msg);
        const hasAutoCreateWithAssetId =
          !!payload?.assetId && payload?.assetMatch?.method === "AUTO_CREATE";
        const hasLinkedAsset =
          !!payload?.assetId ||
          !!payload?.assetType ||
          isRecord(payload?.assetLinkage) ||
          isRecord(payload?.assetRef);
        const hasLinkageWrappers =
          isRecord(payload?.assetLinkage) ||
          isRecord(payload?.assetRef) ||
          payload?.assetMatchMethod != null;

        const typeGroup = getTypeGroup(payload?.type);
        const normalizedType = String(payload?.type ?? "")
          .trim()
          .toLowerCase()
          .replace(/\s+/g, "_");
        const signNeedsDetailsObject =
          typeGroup === "sign" &&
          (payload?.details == null ||
            typeof payload?.details !== "object" ||
            Array.isArray(payload?.details));
        const signTypeNeedsLegacyLabel =
          normalizedType === "sign" && payload?.type !== "Sign";
        const guardrailNeedsDetailsObject =
          typeGroup === "guardrail" &&
          (payload?.details == null ||
            typeof payload?.details !== "object" ||
            Array.isArray(payload?.details));
        const guardrailTypeNeedsLegacyLabel =
          normalizedType === "guardrail" && payload?.type !== "Guardrail";

        if (!looksInternal) {
          console.error("[Sync] step 1 FAILED — callable threw", e1);
          if (__DEV__ && workOrderId) {
            updatePhotoDevDiagnostics(String(workOrderId), {
              latestBackendUpsertResult: `failed:${String(e1?.message ?? "unknown")}`,
              latestAttachmentWriteStage: "outboxSync-after-send-failed",
              latestAttachmentWriteErrorMessage: String(e1?.message ?? "Unknown send error"),
            });
          }
          setCustomKeySafe("syncStage", "step1_failed");
          recordErrorWithContext(e1, {
            message: "outbound wo step1 callable failed",
            extras: {
              syncDirection: "outbound",
              syncStage: "step1_failed",
              orgId: payload.orgId ?? row.orgId ?? null,
              workOrderId: workOrderId ?? row.entityId ?? null,
            },
          });
          throw e1;
        }

        // Staged backend-compat retries for legacy function contracts.
        const retryBasePayload: any = cloneRetryPayload(payload);
        let lastRetryError: any = e1;

        type RetryStep = {
          label: string;
          enabled: boolean;
          apply: (p: Record<string, any>) => void;
        };

        const retrySteps: RetryStep[] = [
          {
            label: "drop assetMatch for AUTO_CREATE + assetId",
            enabled: hasAutoCreateWithAssetId,
            apply: (p) => {
              delete (p as any).assetMatch;
              delete (p as any).assetMatchJson;
            },
          },
          {
            label: "drop asset linkage wrappers for AUTO_CREATE",
            enabled: hasAutoCreateWithAssetId && hasLinkageWrappers,
            apply: (p) => {
              delete (p as any).assetLinkage;
              delete (p as any).assetRef;
              delete (p as any).assetMatchMethod;
            },
          },
          {
            label: "drop all asset linkage fields for backend-compat",
            enabled: hasLinkedAsset,
            apply: (p) => {
              delete (p as any).assetId;
              delete (p as any).assetType;
              delete (p as any).assetMatch;
              delete (p as any).assetMatchJson;
              delete (p as any).assetMatchMethod;
              delete (p as any).assetLinkage;
              delete (p as any).assetRef;
            },
          },
          {
            label: "coerce sign details to empty object",
            enabled: signNeedsDetailsObject,
            apply: (p) => {
              p.details = {};
            },
          },
          {
            label: "coerce sign type to legacy 'Sign'",
            enabled: signTypeNeedsLegacyLabel,
            apply: (p) => {
              p.type = "Sign";
            },
          },
          {
            label: "coerce guardrail details to empty object",
            enabled: guardrailNeedsDetailsObject,
            apply: (p) => {
              p.details = {};
            },
          },
          {
            label: "coerce guardrail type to legacy 'Guardrail'",
            enabled: guardrailTypeNeedsLegacyLabel,
            apply: (p) => {
              p.type = "Guardrail";
            },
          },
          {
            label: "coerce guardrail legacy payload",
            enabled: guardrailTypeNeedsLegacyLabel || guardrailNeedsDetailsObject,
            apply: (p) => {
              p.type = "Guardrail";
              p.details = {};
            },
          },
          {
            label: "coerce guardrail legacy payload + drop linkage wrappers",
            enabled:
              (guardrailTypeNeedsLegacyLabel || guardrailNeedsDetailsObject) &&
              hasLinkageWrappers,
            apply: (p) => {
              p.type = "Guardrail";
              p.details = {};
              delete (p as any).assetLinkage;
              delete (p as any).assetRef;
              delete (p as any).assetMatchMethod;
            },
          },
          {
            label: "coerce guardrail minimal payload",
            enabled: guardrailTypeNeedsLegacyLabel || guardrailNeedsDetailsObject || hasLinkedAsset,
            apply: (p) => {
              p.type = "Guardrail";
              p.details = {};
              delete (p as any).assetId;
              delete (p as any).assetType;
              delete (p as any).assetMatch;
              delete (p as any).assetMatchJson;
              delete (p as any).assetMatchMethod;
              delete (p as any).assetLinkage;
              delete (p as any).assetRef;
            },
          },
        ];

        let retrySucceeded = false;
        for (const step of retrySteps) {
          if (!step.enabled) continue;

          const retryPayload: any = cloneRetryPayload(retryBasePayload);

          step.apply(retryPayload);

          logWorkOrderRetryDiff(row.id, step.label, retryBasePayload, retryPayload);

          const retryLinkage = repairWorkOrderLinkagePayload(retryPayload);

          if (__DEV__) {
            console.warn(`[Sync] step 1 RETRY — ${step.label}`, {
              workOrderId,
              type: retryPayload.type,
              hasAssetId: !!retryPayload.assetId,
              assetType: retryPayload.assetType ?? null,
              assetMatchMethod: retryLinkage.assetMatchMethod,
              hasAssetLinkageObject: retryLinkage.hasAssetLinkageObject,
              assetTypeSource: retryLinkage.assetTypeSource,
              hasDetails: !!retryPayload.details,
            });
          }

          try {
            logOutgoingWorkOrderPayload(`retry:${step.label}`, row.id, retryPayload);
            res = await callFn("roadwork_upsertWorkOrder", retryPayload);
            console.log("[Sync] step 1 OK (retry) — response:", res?.data ?? res?.result);
            setCustomKeySafe("syncStage", "step1_retry_success");
            logSyncBreadcrumb("outbound wo retry success", {
              syncDirection: "outbound",
              syncStage: "step1_retry_success",
              orgId: payload.orgId ?? row.orgId ?? null,
              workOrderId: workOrderId ?? row.entityId ?? null,
              retryLabel: step.label,
            });
            retrySucceeded = true;
            break;
          } catch (eRetry: any) {
            lastRetryError = eRetry;
            console.error("[Sync] step 1 RETRY FAILED — callable threw", eRetry, {
              workOrderId,
              type: retryPayload.type,
              hasAssetId: !!retryPayload.assetId,
              assetType: retryPayload.assetType ?? null,
              assetMatchMethod: retryLinkage.assetMatchMethod,
              hasAssetLinkageObject: retryLinkage.hasAssetLinkageObject,
              assetTypeSource: retryLinkage.assetTypeSource,
              hasDetails: !!retryPayload.details,
            });
          }
        }

        if (!retrySucceeded) {
          setCustomKeySafe("syncStage", "step1_retry_failed");
          recordErrorWithContext(lastRetryError, {
            message: "outbound wo retry sequence failed",
            extras: {
              syncDirection: "outbound",
              syncStage: "step1_retry_failed",
              orgId: payload.orgId ?? row.orgId ?? null,
              workOrderId: workOrderId ?? row.entityId ?? null,
            },
          });
          throw lastRetryError;
        }
      }

      // Step 2: Mark synced + remove outbox row
      console.log("[Sync] step 2 START — markSynced + deleteOutbox");
      setCustomKeySafe("syncStage", "step2_start");
      logSyncBreadcrumb("outbound wo step2 start", {
        syncDirection: "outbound",
        syncStage: "step2_start",
        orgId: payload.orgId ?? row.orgId ?? null,
        workOrderId: workOrderId ?? row.entityId ?? null,
      });
      try {
        markWorkOrderSynced(row.orgId, row.entityId);
        deleteOutboxRow(row.id);
        console.log("[Sync] step 2 OK");
        setCustomKeySafe("syncStage", "step2_success");
        logSyncBreadcrumb("outbound wo step2 success", {
          syncDirection: "outbound",
          syncStage: "step2_success",
          orgId: payload.orgId ?? row.orgId ?? null,
          workOrderId: workOrderId ?? row.entityId ?? null,
        });
      } catch (e2: any) {
        console.error("[Sync] step 2 FAILED — local DB write", e2);
        setCustomKeySafe("syncStage", "step2_failed");
        recordErrorWithContext(e2, {
          message: "outbound wo step2 local write failed",
          extras: {
            syncDirection: "outbound",
            syncStage: "step2_failed",
            orgId: payload.orgId ?? row.orgId ?? null,
            workOrderId: workOrderId ?? row.entityId ?? null,
          },
        });
        throw e2;
      }
      return;
    }

    case "DELETE_WORK_ORDER": {
      const res: any = await callFn("roadwork_deleteWorkOrder", payload);
      console.log("[Sync] DELETE_WORK_ORDER OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    case "UPSERT_ASSET": {
      const res: any = await callFn("roadwork_upsertAsset", { asset: payload });
      console.log("[Sync] UPSERT_ASSET OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    case "ADD_ASSET_EVENT": {
      const res: any = await callFn("roadwork_addAssetEvent", { event: payload });
      console.log("[Sync] ADD_ASSET_EVENT OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    case "UPSERT_TAILGATE": {
      const res: any = await callFn("roadwork_upsertTailgateLog", { log: payload });
      console.log("[Sync] UPSERT_TAILGATE OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    case "UPSERT_MAINTENANCE_SLIP": {
      const res: any = await callFn("roadwork_upsertMaintenanceSlip", { slip: payload });
      console.log("[Sync] UPSERT_MAINTENANCE_SLIP OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

case "UPSERT_DMI": {
      const res: any = await callFn("roadwork_upsertDmi", { rec: payload });
      console.log("[Sync] UPSERT_DMI OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    case "UPSERT_COUNTER": {
      const res: any = await callFn("roadwork_upsertCounter", { rec: payload });
      console.log("[Sync] UPSERT_COUNTER OK:", res?.data ?? res?.result);
      deleteOutboxRow(row.id);
      return;
    }

    // Future kinds:
    // case "UPLOAD_PHOTO":
    // case "UPSERT_AUDIT":

    default: {
      console.warn(`[Sync] Unknown outbox kind: ${row.kind}`);
      if (__DEV__) {
        console.warn("[OutboxDebug] unknown kind row dropped", {
          rowId: row.id,
          kind: row.kind,
          entityId: row.entityId ?? null,
        });
      }
      bumpOutboxError(row.id, `Unknown outbox kind: ${row.kind}`, row.attempts ?? 0);
      if ((row.attempts ?? 0) >= 0) {
        deleteOutboxRow(row.id);
      }
      return;
    }
  }
}

// ─── Public API ──────────────────────────────────────────────────────────

export async function trySyncOutbox(
  orgIdRaw: string,
  opts?: { maxItems?: number; ignoreRowBackoff?: boolean }
): Promise<{ ok: boolean; synced: number; reason?: string; nextDueInMs?: number }> {
  if (_syncInFlight) return { ok: false, synced: 0, reason: "busy" };
  _syncInFlight = true;

  const orgId = requireOrgId(orgIdRaw);
  const maxItems = opts?.maxItems ?? 25;
  const ignoreRowBackoff = !!opts?.ignoreRowBackoff;

  try {
    const now = Date.now();
    const result = db.executeSync(
      `SELECT * FROM outbox
       WHERE orgId=?
         AND attempts < ?
         AND (? = 1 OR nextAttemptAt IS NULL OR nextAttemptAt <= ?)
       ORDER BY createdAt ASC LIMIT ?`,
      [orgId, OUTBOX_MAX_ROW_ATTEMPTS, ignoreRowBackoff ? 1 : 0, now, maxItems]
    );
    const rows = readRows(result) as OutboxRow[];

    if (!rows.length) {
      const statsResult = db.executeSync(
        `SELECT COUNT(1) AS c, MIN(nextAttemptAt) AS minNextAttemptAt
         FROM outbox
         WHERE orgId = ?
           AND attempts < ?`,
        [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
      );
      const stats = readRows(statsResult)?.[0] ?? {};
      const pendingCount = Number(stats.c ?? 0);
      const minNextAttemptAt = Number(stats.minNextAttemptAt ?? 0);

      if (
        pendingCount > 0 &&
        Number.isFinite(minNextAttemptAt) &&
        minNextAttemptAt > now
      ) {
        if (__DEV__) {
          console.log("[OutboxDebug] waiting-backoff summary", {
            pendingCount,
            minNextAttemptAt,
            nextDueInMs: Math.max(0, minNextAttemptAt - now),
          });
        }
        return {
          ok: true,
          synced: 0,
          reason: "waiting-backoff",
          nextDueInMs: Math.max(0, minNextAttemptAt - now),
        };
      }

      return { ok: true, synced: 0 };
    }

    let synced = 0;
    for (const row of rows) {
      // Skip rows that have been retried too many times
      if (row.attempts >= OUTBOX_MAX_ROW_ATTEMPTS) {
        if (__DEV__) {
          console.warn(
            `[Sync] skipping outbox ${row.id} — ${row.attempts} attempts, lastError: ${row.lastError}`
          );
        }
        continue;
      }

      try {
        await handleRow(row);
        synced += 1;
        // Small pacing to avoid hammering
        await sleep(50);
      } catch (e: any) {
        const msg = e?.message ?? String(e);
        const code = e?.code ?? e?.details?.code ?? "unknown";
        const name = e?.name ?? "Error";

        // Try to capture EVERYTHING react-native-firebase might attach
        const nativeErrorMessage =
          e?.nativeErrorMessage ??
          e?.userInfo?.message ??
          e?.userInfo?.NSLocalizedDescription ??
          e?.cause?.message ??
          null;

        const nativeErrorCode =
          e?.nativeErrorCode ??
          e?.userInfo?.code ??
          e?.cause?.code ??
          null;

        const userInfo = e?.userInfo ?? null;
        const cause = e?.cause ?? null;

        let eJson = "[unstringifiable]";
        try { eJson = JSON.stringify(e); } catch {}

        let userInfoJson = null;
        try { userInfoJson = userInfo ? JSON.stringify(userInfo) : null; } catch {}

        let causeJson = null;
        try { causeJson = cause ? JSON.stringify(cause) : null; } catch {}

        console.error(
          `[Sync] ERROR outbox ${row.id}:${row.kind}:${row.createdAt}`,
          {
            name,
            code,
            msg,
            nativeErrorCode,
            nativeErrorMessage,
            userInfo,
            userInfoJson,
            cause,
            causeJson,
            eJson,
            stack: e?.stack,
          }
        );

        // Keep item in outbox so it can retry — bump error counter + set backoff
        bumpOutboxError(row.id, `${code}: ${nativeErrorMessage ?? msg}`, row.attempts ?? 0);
        const retryState = getRowRetryState(row.id);

        if (__DEV__) {
          console.error("[OutboxDebug] row failure", {
            rowId: row.id,
            kind: row.kind,
            entityId: row.entityId ?? null,
            errorCode: code,
            errorMessage: nativeErrorMessage ?? msg,
            remainsPending: retryState.exists,
            attemptCount: retryState.attempts,
            nextAttemptAt: retryState.nextAttemptAt,
            lastError: retryState.lastError,
          });
        }

        // If unauthenticated or permission denied, stop immediately
        const msgLower = msg.toLowerCase();
        if (
          msgLower.includes("unauth") ||
          msgLower.includes("permission") ||
          msgLower.includes("403")
        ) {
          break;
        }

        // Otherwise continue with next item
        continue;
      }
    }

    return { ok: true, synced };
  } finally {
    _syncInFlight = false;
  }
}

export function getOutboxStatus(orgIdRaw: string): { pending: number } {
  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `SELECT COUNT(1) as c
     FROM outbox
     WHERE orgId=?
       AND attempts < ?`,
    [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
  );
  const rows = readRows(result);
  return { pending: rows[0]?.c ?? 0 };
}

/**
 * Returns the most recent outbox errors for display in Settings.
 * Only returns rows that have failed at least once.
 */
export function getOutboxErrors(orgIdRaw: string, limit = 5): Array<{
  id: string;
  kind: string;
  entityId: string;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
}> {
  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `SELECT id, kind, entityId, attempts, lastError, lastAttemptAt
     FROM outbox
     WHERE orgId = ? AND attempts > 0
     ORDER BY lastAttemptAt DESC
     LIMIT ?`,
    [orgId, limit]
  );
  return readRows(result);
}

/**
 * Returns outbox rows that have failed (attempts >= threshold or lastError set).
 * Used by the OutboxFailedScreen.
 */
export function getFailedJobs(
  orgIdRaw: string,
  opts?: { minAttempts?: number; limit?: number }
): Array<{
  id: string;
  kind: string;
  entityId: string;
  attempts: number;
  lastError: string | null;
  lastAttemptAt: number | null;
  nextAttemptAt: number | null;
  createdAt: number;
}> {
  const orgId = requireOrgId(orgIdRaw);
  const minAttempts = opts?.minAttempts ?? 3;
  const limit = opts?.limit ?? 50;
  const result = db.executeSync(
    `SELECT id, kind, entityId, attempts, lastError, lastAttemptAt, nextAttemptAt, createdAt
     FROM outbox
     WHERE orgId = ? AND (attempts >= ? OR lastError IS NOT NULL)
     ORDER BY lastAttemptAt DESC
     LIMIT ?`,
    [orgId, minAttempts, limit]
  );
  return readRows(result);
}

/**
 * Fully reset failed rows so they are retried on the next sync cycle,
 * including rows that previously hit the max-attempt skip threshold.
 */
export function retryAllFailed(orgIdRaw: string): number {
  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `UPDATE outbox
     SET attempts = 0,
         lastError = NULL,
         lastAttemptAt = NULL,
         nextAttemptAt = NULL
     WHERE orgId = ? AND attempts > 0`,
    [orgId]
  );
  return (result as any)?.rowsAffected ?? 0;
}

/**
 * Delete all rows that have exceeded MAX_ROW_ATTEMPTS.
 */
export function clearFailedJobs(orgIdRaw: string): number {
  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `DELETE FROM outbox WHERE orgId = ? AND attempts >= ?`,
    [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
  );
  return (result as any)?.rowsAffected ?? 0;
}

/**
 * Reset one failed row by id so it can retry immediately.
 */
export function resetFailedRowById(orgIdRaw: string, rowIdRaw: string): number {
  const orgId = requireOrgId(orgIdRaw);
  const rowId = String(rowIdRaw ?? "").trim();
  if (!rowId) return 0;

  const result = db.executeSync(
    `UPDATE outbox
     SET attempts = 0,
         lastError = NULL,
         lastAttemptAt = NULL,
         nextAttemptAt = NULL
     WHERE orgId = ?
       AND id = ?
       AND (attempts > 0 OR lastError IS NOT NULL)`,
    [orgId, rowId]
  );

  return (result as any)?.rowsAffected ?? 0;
}

/**
 * Delete one failed row by id (safe cleanup for legacy poison rows).
 */
export function deleteFailedRowById(orgIdRaw: string, rowIdRaw: string): number {
  const orgId = requireOrgId(orgIdRaw);
  const rowId = String(rowIdRaw ?? "").trim();
  if (!rowId) return 0;

  const result = db.executeSync(
    `DELETE FROM outbox
     WHERE orgId = ?
       AND id = ?
       AND (attempts > 0 OR lastError IS NOT NULL)`,
    [orgId, rowId]
  );

  return (result as any)?.rowsAffected ?? 0;
}
