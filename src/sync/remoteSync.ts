import { getApp } from "@react-native-firebase/app";
import {
  collection,
  doc,
  getFirestore,
  onSnapshot,
  query,
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";
import { ensureDbSchemaReady } from "../db/migrations";
import { requireOrgId } from "../org/requireOrg";
import { assetsRepo } from "../repositories/assetsRepo";
import { safeJsonParse } from "../repositories/repoUtils";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { emitDbChanged } from "../state/DbEvents";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";
import { getAuth } from "@react-native-firebase/auth";
import { notifyWorkOrderFromRemoteSync } from "../services/notify";
import type { Asset, AssetType } from "../types/Asset";
import type { GeometryType, WorkOrder, WorkOrderPriority, WorkOrderStatus } from "../types/WorkOrder";
import { normalizeWorkOrderDetailsForType } from "../workOrders/pavementDetails";

export type RemoteSyncHandle = {
  stop: () => void;
};

type MapCoord = { lat: number; lng: number };

function toFiniteNumber(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function toEpochMs(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }

  if (value && typeof value === "object") {
    const asAny = value as any;
    if (typeof asAny.toMillis === "function") {
      const ms = Number(asAny.toMillis());
      if (Number.isFinite(ms)) return ms;
    }
    if (typeof asAny.seconds === "number") {
      const ms = asAny.seconds * 1000;
      if (Number.isFinite(ms)) return ms;
    }
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return fallback;
}

function normalizeWorkOrderStatus(raw: unknown): WorkOrderStatus {
  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");

  if (key === "needs" || key === "need") return "Needs";
  if (key === "in progress" || key === "inprogress") return "In Progress";
  if (key === "done" || key === "complete" || key === "completed") return "Done";
  if (key === "deferred" || key === "defer") return "Deferred";
  return "Needs";
}

function normalizeWorkOrderPriority(raw: unknown): WorkOrderPriority {
  if (typeof raw === "number" && Number.isFinite(raw)) {
    if (raw <= 0) return "None";
    if (raw === 1) return "Low";
    if (raw === 2) return "Medium";
    if (raw === 3) return "High";
    return "Urgent";
  }

  const key = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, " ");

  if (key === "none" || key === "0") return "None";
  if (key === "low" || key === "1") return "Low";
  if (key === "medium" || key === "med" || key === "2") return "Medium";
  if (key === "high" || key === "3") return "High";
  if (key === "urgent" || key === "critical" || key === "4") return "Urgent";
  return "None";
}

function normalizeAssetType(raw: unknown): AssetType | null {
  const key = String(raw ?? "").trim().toLowerCase();
  if (!key) return null;

  if (key === "sign" || key === "signs") return "SIGN";
  if (key === "guardrail" || key === "guard_rail" || key === "guardrails") return "GUARDRAIL";
  if (key === "culvert" || key === "culverts" || key === "drain_pipe" || key === "drainpipe") {
    return "CULVERT";
  }
  if (key === "bridge" || key === "bridges") return "BRIDGE";

  return null;
}

function normalizeAssetStatus(raw: unknown): Asset["status"] {
  const key = String(raw ?? "").trim().toLowerCase();
  if (key === "retired" || key === "inactive") return "RETIRED";
  return "ACTIVE";
}

function parsePointLike(raw: unknown): MapCoord | null {
  if (!raw) return null;

  let value = raw;
  if (typeof value === "string") {
    value = safeJsonParse<any>(value, null);
  }

  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;

  // GeoJSON Point fallback: { type: "Point", coordinates: [lng, lat] }
  const geoJsonType = String(obj.type ?? "").trim().toLowerCase();
  if (geoJsonType === "point" && Array.isArray(obj.coordinates) && obj.coordinates.length >= 2) {
    const lng = toFiniteNumber(obj.coordinates[0]);
    const lat = toFiniteNumber(obj.coordinates[1]);
    if (lat != null && lng != null) {
      return { lat, lng };
    }
  }

  const directLat = toFiniteNumber(obj.lat ?? obj.latitude);
  const directLng = toFiniteNumber(obj.lng ?? obj.longitude ?? obj.lon);
  if (directLat != null && directLng != null) {
    return { lat: directLat, lng: directLng };
  }

  if (Array.isArray(value) && value.length >= 2) {
    const first = toFiniteNumber(value[0]);
    const second = toFiniteNumber(value[1]);
    if (first != null && second != null) {
      // GeoJSON tuple order fallback: [lng, lat]
      if (Math.abs(first) <= 180 && Math.abs(second) <= 90) {
        return { lat: second, lng: first };
      }
      return { lat: first, lng: second };
    }
  }

  return null;
}

function parseLineLike(raw: unknown): MapCoord[] | null {
  if (!raw) return null;

  let value = raw;
  if (typeof value === "string") {
    value = safeJsonParse<any>(value, null);
  }

  if (!value || typeof value !== "object") return null;

  const valueObj = value as Record<string, unknown>;
  const geoJsonType = String(valueObj.type ?? "").trim().toLowerCase();

  if (geoJsonType === "linestring" && Array.isArray(valueObj.coordinates)) {
    value = valueObj.coordinates;
  } else if (!Array.isArray(value)) {
    if (Array.isArray(valueObj.points)) {
      value = valueObj.points;
    } else if (Array.isArray(valueObj.coordinates)) {
      value = valueObj.coordinates;
    } else {
      return null;
    }
  }

  if (!Array.isArray(value)) return null;

  const out: MapCoord[] = [];
  for (const item of value) {
    const p = parsePointLike(item);
    if (p) out.push(p);
  }

  return out.length ? out : null;
}

function bboxFromPoint(point: MapCoord) {
  return {
    minLat: point.lat,
    minLng: point.lng,
    maxLat: point.lat,
    maxLng: point.lng,
  };
}

function bboxFromLine(points: MapCoord[]) {
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

  return {
    minLat: Number.isFinite(minLat) ? minLat : 0,
    minLng: Number.isFinite(minLng) ? minLng : 0,
    maxLat: Number.isFinite(maxLat) ? maxLat : 0,
    maxLng: Number.isFinite(maxLng) ? maxLng : 0,
  };
}

function pointFromBboxLike(data: Record<string, any>): MapCoord | null {
  const directMinLat = toFiniteNumber(data.minLat);
  const directMinLng = toFiniteNumber(data.minLng);
  const directMaxLat = toFiniteNumber(data.maxLat);
  const directMaxLng = toFiniteNumber(data.maxLng);

  if (
    directMinLat != null &&
    directMinLng != null &&
    directMaxLat != null &&
    directMaxLng != null
  ) {
    return {
      lat: (directMinLat + directMaxLat) / 2,
      lng: (directMinLng + directMaxLng) / 2,
    };
  }

  const bbox = data.bbox as Record<string, unknown> | undefined;
  if (!bbox || typeof bbox !== "object") return null;

  const minLat = toFiniteNumber(bbox.minLat);
  const minLng = toFiniteNumber(bbox.minLng);
  const maxLat = toFiniteNumber(bbox.maxLat);
  const maxLng = toFiniteNumber(bbox.maxLng);
  if (minLat == null || minLng == null || maxLat == null || maxLng == null) {
    return null;
  }

  return {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
}

function normalizeAssetMatch(raw: unknown): WorkOrder["assetMatch"] {
  let parsed: any = raw;
  if (typeof parsed === "string") {
    parsed = safeJsonParse<any>(parsed, null);
  }
  if (!parsed || typeof parsed !== "object") return null;

  const methodRaw = String(parsed.method ?? "").trim().toUpperCase();
  if (methodRaw !== "USER_SELECTED" && methodRaw !== "AUTO_MATCH" && methodRaw !== "AUTO_CREATE") {
    return null;
  }

  const confidence = toFiniteNumber(parsed.confidence);
  const radiusM = toFiniteNumber(parsed.radiusM);

  return {
    method: methodRaw,
    confidence: confidence ?? undefined,
    radiusM: radiusM ?? undefined,
  };
}

function toLocalWorkOrder(
  orgId: string,
  rowId: string,
  data: Record<string, any>
): WorkOrder | null {
  const now = Date.now();
  const dataOrgId = String(data.orgId ?? "").trim();
  if (dataOrgId && dataOrgId !== orgId) {
    if (__DEV__) {
      console.warn("[RemoteSync][WO] skip org mismatch", { rowId, orgId, dataOrgId });
    }
    return null;
  }

  const line =
    parseLineLike(data.line) ??
    parseLineLike(data.lineJson) ??
    parseLineLike(data.geo) ??
    parseLineLike(data.geometry?.points) ??
    parseLineLike(data.geometry);
  const linePoints = line ?? [];

  const point =
    parsePointLike({ lat: data.lat, lng: data.lng }) ??
    parsePointLike(data.geo) ??
    parsePointLike(data.point) ??
    parsePointLike(data.location) ??
    parsePointLike(data.center) ??
    parsePointLike(data.position) ??
    parsePointLike(data.geometry?.point) ??
    parsePointLike(data.geometry);
  const bboxPoint = pointFromBboxLike(data);

  let geomType: GeometryType = "point";
  let finalPoint: MapCoord | null = point;
  let finalLine: MapCoord[] | null = null;

  const explicitGeomType = String(data.geomType ?? data.geometryType ?? "").toLowerCase();

  if (
    (explicitGeomType === "line" || explicitGeomType === "linestring" || linePoints.length >= 2) &&
    linePoints.length >= 2
  ) {
    geomType = "line";
    finalLine = linePoints;
    finalPoint = null;
  } else if (finalPoint) {
    geomType = "point";
  } else if (bboxPoint) {
    geomType = "point";
    finalPoint = bboxPoint;
  } else if (linePoints.length === 1) {
    geomType = "point";
    finalPoint = linePoints[0];
  } else {
    if (__DEV__) {
      console.warn("[RemoteSync][WO] skip unmappable geometry", {
        rowId,
        orgId,
        explicitGeomType,
        hasLat: data.lat != null,
        hasLng: data.lng != null,
        hasPoint: data.point != null,
        hasGeo: data.geo != null,
        hasGeometry: data.geometry != null,
        hasLocation: data.location != null,
        hasCenter: data.center != null,
        hasPosition: data.position != null,
        hasBbox:
          (data.minLat != null &&
            data.minLng != null &&
            data.maxLat != null &&
            data.maxLng != null) ||
          data.bbox != null,
        linePoints: linePoints.length,
      });
    }
    return null;
  }

  const bbox =
    toFiniteNumber(data.minLat) != null &&
    toFiniteNumber(data.minLng) != null &&
    toFiniteNumber(data.maxLat) != null &&
    toFiniteNumber(data.maxLng) != null
      ? {
          minLat: Number(data.minLat),
          minLng: Number(data.minLng),
          maxLat: Number(data.maxLat),
          maxLng: Number(data.maxLng),
        }
      : geomType === "line" && finalLine
      ? bboxFromLine(finalLine)
      : bboxFromPoint(finalPoint as MapCoord);

  const type = String(data.type ?? data.workType ?? "unknown").trim() || "unknown";

  const createdAt = toEpochMs(data.createdAt, now);
  const updatedAt = toEpochMs(data.updatedAt, createdAt || now);

  const rawDetails = data.details ?? safeJsonParse(data.detailsJson ?? null, null);

  const assetType = normalizeAssetType(data.assetType);
  const assetMatch = normalizeAssetMatch(data.assetMatch ?? data.assetMatchJson ?? null);

  return {
    id: rowId,
    orgId,
    type,
    status: normalizeWorkOrderStatus(data.status),
    priority: normalizeWorkOrderPriority(data.priority),
    geomType,
    lat: geomType === "point" ? (finalPoint as MapCoord).lat : null,
    lng: geomType === "point" ? (finalPoint as MapCoord).lng : null,
    line: geomType === "line" ? finalLine : null,
    minLat: bbox.minLat,
    minLng: bbox.minLng,
    maxLat: bbox.maxLat,
    maxLng: bbox.maxLng,
    note: data.note ?? null,
    createdAt,
    updatedAt,
    createdByUid: data.createdByUid ?? null,
    createdByEmail: data.createdByEmail ?? null,
    createdByFirstName: data.createdByFirstName ?? null,
    createdByLastName: data.createdByLastName ?? null,
    createdByDisplayName: data.createdByDisplayName ?? data.createdByName ?? null,
    assignedToUid: data.assignedToUid ?? data.assigneeUid ?? null,
    assignedToName:
      data.assignedToName ??
      data.assignedToDisplayName ??
      data.assigneeName ??
      null,
    assignedToEmail: data.assignedToEmail ?? data.assigneeEmail ?? null,
    deviceId: data.deviceId ?? null,
    appVersion: data.appVersion ?? null,
    assetId: data.assetId ?? null,
    assetType,
    assetMatch,
    details: normalizeWorkOrderDetailsForType(type, rawDetails),
  };
}

function hasAnyGeometryInput(data: Record<string, any>): boolean {
  return Boolean(
    (data.lat != null && data.lng != null) ||
      data.point != null ||
      data.geo != null ||
      data.geometry != null ||
      data.location != null ||
      data.center != null ||
      data.position != null ||
      data.line != null ||
      data.lineJson != null ||
      (data.minLat != null && data.minLng != null && data.maxLat != null && data.maxLng != null) ||
      data.bbox != null
  );
}

function toLocalAsset(orgId: string, rowId: string, data: Record<string, any>): Asset | null {
  const now = Date.now();
  const dataOrgId = String(data.orgId ?? "").trim();
  if (dataOrgId && dataOrgId !== orgId) {
    if (__DEV__) {
      console.warn("[RemoteSync][assets] skip org mismatch", { rowId, orgId, dataOrgId });
    }
    return null;
  }

  const assetType = normalizeAssetType(data.assetType);
  if (!assetType) return null;

  const point =
    parsePointLike({ lat: data.lat, lng: data.lng }) ??
    parsePointLike(data.point) ??
    parsePointLike(data.location);

  if (!point) return null;

  const createdAt = toEpochMs(data.createdAt, now);
  const updatedAt = toEpochMs(data.updatedAt, createdAt || now);

  const details = data.details ?? safeJsonParse(data.detailsJson ?? null, null);

  return {
    id: rowId,
    orgId,
    assetType,
    subtype: data.subtype ?? null,
    status: normalizeAssetStatus(data.status),
    lat: point.lat,
    lng: point.lng,
    createdAt,
    updatedAt,
    createdByUid: data.createdByUid ?? null,
    createdByDisplayName: data.createdByDisplayName ?? data.createdByName ?? null,
    installedAt: toFiniteNumber(data.installedAt),
    lastEventAt: toFiniteNumber(data.lastEventAt),
    lastInspectionAt: toFiniteNumber(data.lastInspectionAt),
    details,
  };
}

async function applyWorkOrdersSnapshot(
  orgId: string,
  snapshot: FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData>,
  options?: {
    suppressNotifications?: boolean;
  }
) {
  const currentUid = getAuth(getApp()).currentUser?.uid ?? null;
  let applied = 0;
  let removed = 0;
  let skipped = 0;
  let failed = 0;
  let skippedLogged = 0;

  console.log(`[RemoteSync][WO] snapshot size=${snapshot.size} changes=${snapshot.docChanges().length}`);
  logSyncBreadcrumb("inbound wo snapshot received", {
    syncDirection: "inbound",
    syncStage: "snapshot_received",
    orgId,
    snapshotSize: snapshot.size,
    changes: snapshot.docChanges().length,
    fromCache: snapshot.metadata.fromCache,
  });

  for (const change of snapshot.docChanges()) {
    const rowId = change.doc.id;
    setCustomKeySafe("orgId", orgId);
    setCustomKeySafe("workOrderId", rowId);
    setCustomKeySafe("syncDirection", "inbound");
    setCustomKeySafe("syncStage", "doc_received");

    try {
      let data = change.doc.data() as Record<string, any>;
      const deletedFlag =
        data.deleted === true ||
        data.deleted === 1 ||
        String(data.deleted ?? "").toLowerCase() === "true";

      console.log(`[RemoteSync][WO] applying doc id=${rowId} event=${change.type}`);
      logSyncBreadcrumb("inbound wo applying doc", {
        syncDirection: "inbound",
        syncStage: "doc_apply",
        orgId,
        workOrderId: rowId,
        eventType: change.type,
        deletedFlag,
      });

      if (change.type === "removed" || deletedFlag) {
        await workOrdersRepo.deleteById({ orgId, id: rowId });
        console.log(`[RemoteSync][WO] delete id=${rowId}`);
        logSyncBreadcrumb("inbound wo removed", {
          syncDirection: "inbound",
          syncStage: "doc_removed",
          orgId,
          workOrderId: rowId,
          eventType: change.type,
        });
        removed += 1;
        continue;
      }

      if (!hasAnyGeometryInput(data)) {
        const existing = await workOrdersRepo.getById({ orgId, id: rowId });
        if (existing) {
          data = {
            ...data,
            geomType: data.geomType ?? existing.geomType,
            geometryType: data.geometryType ?? existing.geomType,
            lat: data.lat ?? existing.lat,
            lng: data.lng ?? existing.lng,
            line: data.line ?? existing.line,
            lineJson: data.lineJson ?? (existing.line ? JSON.stringify(existing.line) : null),
            minLat: data.minLat ?? existing.minLat,
            minLng: data.minLng ?? existing.minLng,
            maxLat: data.maxLat ?? existing.maxLat,
            maxLng: data.maxLng ?? existing.maxLng,
          };

          if (__DEV__) {
            console.log("[RemoteSync][WO] geometry fallback from local row", {
              rowId,
              geomType: existing.geomType,
            });
          }
        }
      }

      const wo = toLocalWorkOrder(orgId, rowId, data);
      if (!wo) {
        if (__DEV__ && skippedLogged < 3) {
          console.warn(`[RemoteSync][WO] skip doc id=${rowId} reason=parse_failed_or_unmappable`);
          skippedLogged += 1;
        }
        logSyncBreadcrumb("inbound wo skip doc", {
          syncDirection: "inbound",
          syncStage: "doc_skip",
          orgId,
          workOrderId: rowId,
          eventType: change.type,
          hasGeo: hasAnyGeometryInput(data),
          geomType: data.geomType ?? data.geometryType ?? null,
          reason: "parse_failed_or_unmappable",
        });
        skipped += 1;
        continue;
      }

      console.log(`[RemoteSync][WO] local upsert success id=${rowId} geom=${wo.geomType}`);
      await workOrdersRepo.upsert(wo);
      applied += 1;

      // Derive cross-device alerts from inbound high-priority work-order changes.
      // This avoids depending on an external push pipeline and only alerts non-creators.
      const isHighPriority = wo.priority === "High" || wo.priority === "Urgent";
      const isCreator = !!currentUid && currentUid === (wo.createdByUid ?? null);
      const ageMs = Date.now() - wo.updatedAt;
      const isFresh = ageMs < 10 * 60 * 1000;
      const suppressNotifications = options?.suppressNotifications === true;
      const shouldNotifyForEvent =
        change.type === "added" || (change.type === "modified" && isFresh);

      if (
        isHighPriority &&
        !isCreator &&
        !suppressNotifications &&
        shouldNotifyForEvent
      ) {
        if (__DEV__) {
          console.log("[RemoteSync][WO] remote-derived notification decision", {
            decision: "notify",
            workOrderId: wo.id,
            priority: wo.priority,
            eventType: change.type,
            suppressNotifications,
            isFresh,
            ageMs,
            updatedAt: wo.updatedAt,
          });
        }
        notifyWorkOrderFromRemoteSync({
          workOrderId: wo.id,
          type: wo.type,
          priority: wo.priority,
          eventType: change.type,
          updatedAt: wo.updatedAt,
          createdByUid: wo.createdByUid ?? null,
        }).catch((error) => {
          console.warn("[RemoteSync][WO] remote-derived notification failed", {
            workOrderId: wo.id,
            error: error instanceof Error ? error.message : String(error),
          });
        });
      } else if (__DEV__ && isHighPriority && !isCreator) {
        const skipReason = suppressNotifications
          ? "first_snapshot_suppression"
          : !shouldNotifyForEvent
          ? "stale_or_unsupported_event"
          : "unknown";
        console.log("[RemoteSync][WO] remote-derived notification skipped", {
          workOrderId: wo.id,
          priority: wo.priority,
          eventType: change.type,
          skipReason,
          suppressNotifications,
          isFresh,
          ageMs,
          updatedAt: wo.updatedAt,
        });
      }

      logSyncBreadcrumb("inbound wo local upsert success", {
        syncDirection: "inbound",
        syncStage: "doc_upsert_ok",
        orgId,
        workOrderId: rowId,
        eventType: change.type,
        geomType: wo.geomType,
      });
    } catch (error) {
      failed += 1;
      console.warn(`[RemoteSync][WO] local upsert failed id=${rowId}`, error);
      recordErrorWithContext(error, {
        message: "remote wo apply doc failed",
        extras: {
          syncDirection: "inbound",
          syncStage: "doc_upsert_failed",
          orgId,
          workOrderId: rowId,
          eventType: change.type,
        },
      });
      continue;
    }
  }

  if (applied > 0 || removed > 0) {
    emitDbChanged();
    console.log("[RemoteSync][WO] emit refresh");
    logSyncBreadcrumb("inbound wo ui refresh emitted", {
      syncDirection: "inbound",
      syncStage: "emit_refresh",
      orgId,
      applied,
      removed,
    });
  }

  if (__DEV__) {
    console.log("[RemoteSync][WO] snapshot summary", {
      orgId,
      totalDocs: snapshot.docs.length,
      changes: snapshot.docChanges().length,
      fromCache: snapshot.metadata.fromCache,
      applied,
      removed,
      skipped,
      failed,
    });
  }
}

async function applyAssetsSnapshot(
  orgId: string,
  snapshot: FirebaseFirestoreTypes.QuerySnapshot<FirebaseFirestoreTypes.DocumentData>
) {
  let applied = 0;
  let removed = 0;
  let skipped = 0;

  for (const change of snapshot.docChanges()) {
    const rowId = change.doc.id;
    if (change.type === "removed") {
      await assetsRepo.deleteById({ orgId, id: rowId });
      removed += 1;
      continue;
    }

    const asset = toLocalAsset(orgId, rowId, change.doc.data() as Record<string, any>);
    if (!asset) {
      skipped += 1;
      continue;
    }

    await assetsRepo.upsertLocalOnly(asset);
    applied += 1;
  }

  if (applied > 0 || removed > 0) {
    emitDbChanged();
  }

  if (__DEV__) {
    console.log("[RemoteSync][assets] snapshot", {
      orgId,
      totalDocs: snapshot.docs.length,
      changes: snapshot.docChanges().length,
      fromCache: snapshot.metadata.fromCache,
      applied,
      removed,
      skipped,
    });
  }
}

export async function startRemoteSyncForOrg(orgIdRaw: string): Promise<RemoteSyncHandle> {
  const orgId = requireOrgId(orgIdRaw);
  ensureDbSchemaReady("remoteSync.start");

  const firestore = getFirestore(getApp());
  const orgDocRef = doc(collection(firestore, "orgs"), orgId);
  const workOrdersQuery = query(collection(orgDocRef, "workOrders"));
  const assetsQuery = query(collection(orgDocRef, "assets"));

  let stopped = false;
  let workOrdersQueue = Promise.resolve();
  let assetsQueue = Promise.resolve();
  let hasSeenWorkOrdersSnapshot = false;

  if (__DEV__) {
    console.log("[RemoteSync] start", { orgId });
  }
  setCustomKeySafe("orgId", orgId);
  setCustomKeySafe("listenerActive", true);
  setCustomKeySafe("syncDirection", "inbound");
  logSyncBreadcrumb("inbound listeners started", {
    syncDirection: "inbound",
    syncStage: "listener_start",
    orgId,
    listenerActive: true,
  });

  console.log(`[RemoteSync][WO] listener start org=${orgId} path=orgs/${orgId}/workOrders`);

  const unsubWorkOrders = onSnapshot(
    workOrdersQuery,
    (snapshot) => {
      if (stopped) return;
      const isInitialSnapshot = !hasSeenWorkOrdersSnapshot;
      hasSeenWorkOrdersSnapshot = true;
      workOrdersQueue = workOrdersQueue
        .then(async () => {
          await applyWorkOrdersSnapshot(orgId, snapshot, {
            suppressNotifications: isInitialSnapshot,
          });
        })
        .catch((e) => {
          console.warn("[RemoteSync][WO] apply failed", e);
          recordErrorWithContext(e, {
            message: "remote wo snapshot apply failed",
            extras: {
              syncDirection: "inbound",
              syncStage: "snapshot_apply_failed",
              orgId,
            },
          });
        });
    },
    (error) => {
      console.warn("[RemoteSync][WO] listener error", error);
      recordErrorWithContext(error, {
        message: "remote wo listener error",
        extras: {
          syncDirection: "inbound",
          syncStage: "listener_error",
          orgId,
          listenerActive: true,
        },
      });
    }
  );

  const unsubAssets = onSnapshot(
    assetsQuery,
    (snapshot) => {
      if (stopped) return;
      assetsQueue = assetsQueue
        .then(async () => {
          await applyAssetsSnapshot(orgId, snapshot);
        })
        .catch((e) => {
          console.warn("[RemoteSync][assets] apply failed", e);
        });
    },
    (error) => {
      console.warn("[RemoteSync][assets] listener error", error);
    }
  );

  return {
    stop: () => {
      if (stopped) return;
      stopped = true;
      unsubWorkOrders();
      unsubAssets();
      setCustomKeySafe("listenerActive", false);
      logSyncBreadcrumb("inbound listeners stopped", {
        syncDirection: "inbound",
        syncStage: "listener_stop",
        orgId,
        listenerActive: false,
      });
      if (__DEV__) {
        console.log("[RemoteSync] stop", { orgId });
      }
    },
  };
}
