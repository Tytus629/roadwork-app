// src/services/assetAutoLink.ts
//
// Auto-link (or auto-create) an asset when a work order is created.
// Runs locally/offline-first against SQLite.

import { makeClientId } from "../repositories/repoUtils";
import { assetsRepo } from "../repositories/assetsRepo";
import { assetEventsRepo } from "../repositories/assetEventsRepo";
import { Asset } from "../types/Asset";
import { AssetEvent, AssetEventKind } from "../types/AssetEvent";
import { WorkOrder } from "../types/WorkOrder";
import { appendSignEntry } from "../utils/signAssetDetails";

// ─── Config helpers ────────────────────────────────────────────────────

/**
 * Map WorkOrder.type → AssetType.
 * Returns null for non-asset work order types (potholes, grading, etc.).
 */
function mapWorkOrderTypeToAssetType(workOrderType: string): Asset["assetType"] | null {
  const t = (workOrderType || "").toLowerCase();

  if (t.includes("sign")) return "SIGN";
  if (t.includes("guard")) return "GUARDRAIL";
  if (t.includes("culvert")) return "CULVERT";

  return null;
}

/** Whether to auto-create an asset when no nearby match exists. */
function autoCreatePolicy(assetType: Asset["assetType"]): boolean {
  return assetType === "SIGN" || assetType === "GUARDRAIL" || assetType === "CULVERT";
}

/** Radius in metres to consider "same asset". */
function matchRadiusMeters(assetType: Asset["assetType"]): number {
  switch (assetType) {
    case "SIGN":
      return 30;
    case "GUARDRAIL":
      return 50;
    case "CULVERT":
      return 40;
    default:
      return 35;
  }
}

/**
 * Pull a subtype string from the WorkOrder's details bag.
 * Tries a few common shapes our app uses.
 */
function subtypeFromWorkOrder(wo: WorkOrder): string | null {
  const d: any = wo.details ?? null;
  if (!d) return null;

  const candidates = [
    d.subtype,
    d.signType,
    d.sign?.signType,
    d.sign?.type,
    d.guardrail?.subtype,
    d.culvert?.subtype,
  ];

  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length) return c.trim();
  }
  return null;
}

// ─── Geo helpers ───────────────────────────────────────────────────────

/** Haversine distance in metres. */
function distM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (x: number) => (x * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toFiniteCoord(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function getAssetAnchor(
  wo: WorkOrder,
  assetType: Asset["assetType"],
): {
  lat: number;
  lng: number;
  culvertGeometry?: {
    inlet: { lat: number; lng: number };
    outlet: { lat: number; lng: number };
    line: Array<{ lat: number; lng: number }>;
  };
} | null {
  const pointLat = toFiniteCoord(wo.lat);
  const pointLng = toFiniteCoord(wo.lng);
  if (pointLat != null && pointLng != null) {
    return { lat: pointLat, lng: pointLng };
  }

  if (assetType !== "CULVERT") return null;
  if (wo.geomType !== "line" || !Array.isArray(wo.line) || wo.line.length < 2) return null;

  // Per field convention: first point is inlet, second point is outlet.
  const inlet = wo.line[0];
  const outlet = wo.line[1];

  const inletLat = toFiniteCoord(inlet?.lat);
  const inletLng = toFiniteCoord(inlet?.lng);
  const outletLat = toFiniteCoord(outlet?.lat);
  const outletLng = toFiniteCoord(outlet?.lng);

  if (inletLat == null || inletLng == null || outletLat == null || outletLng == null) {
    return null;
  }

  const inletPoint = { lat: inletLat, lng: inletLng };
  const outletPoint = { lat: outletLat, lng: outletLng };

  return {
    lat: (inletLat + outletLat) / 2,
    lng: (inletLng + outletLng) / 2,
    culvertGeometry: {
      inlet: inletPoint,
      outlet: outletPoint,
      line: [inletPoint, outletPoint],
    },
  };
}

function mergeCulvertAssetDetails(
  existingDetails: Asset["details"],
  woDetails: WorkOrder["details"],
  culvertGeometry: {
    inlet: { lat: number; lng: number };
    outlet: { lat: number; lng: number };
    line: Array<{ lat: number; lng: number }>;
  } | undefined,
) {
  const next = { ...(existingDetails ?? {}) } as Record<string, any>;
  const existingCulvert = next.culvert && typeof next.culvert === "object" ? next.culvert : {};

  if (culvertGeometry) {
    next.culvert = {
      ...existingCulvert,
      inlet: culvertGeometry.inlet,
      outlet: culvertGeometry.outlet,
      line: culvertGeometry.line,
    };
  }

  if (woDetails && typeof woDetails === "object") {
    next.culvert = {
      ...(next.culvert ?? {}),
      findings: woDetails,
    };
  }

  return Object.keys(next).length ? next : null;
}

function shouldCaptureCulvertGeometry(wo: WorkOrder): boolean {
  if (wo.geomType !== "line" || !Array.isArray(wo.line) || wo.line.length < 2) return false;

  const details = wo.details;
  if (details && typeof details === "object" && "captureInletOutletFromLine" in details) {
    return !!(details as Record<string, any>).captureInletOutletFromLine;
  }

  // Backward-compatible default for older culvert line work orders.
  return true;
}

function signEntryFromRecord(rec: Record<string, any>, fallbackLabel: string | null): {
  signTypeId: string | null;
  signLabel: string;
  signCode?: string | null;
} | null {
  const signTypeId = String(rec.signTypeId ?? rec.id ?? rec.type ?? "").trim() || null;
  const signLabel =
    String(rec.signName ?? rec.signType ?? rec.label ?? rec.name ?? fallbackLabel ?? "").trim() || signTypeId;

  if (!signLabel) return null;

  const signCode =
    String(rec.signCode ?? rec.MUTCDCode ?? rec.mutcdCode ?? rec.code ?? "").trim() || null;

  return {
    signTypeId,
    signLabel,
    signCode,
  };
}

function signEntriesFromWorkOrder(wo: WorkOrder): Array<{
  signTypeId: string | null;
  signLabel: string;
  signCode?: string | null;
}> {
  const details = wo.details && typeof wo.details === "object" ? (wo.details as Record<string, any>) : null;
  const sign = details?.sign && typeof details.sign === "object" ? details.sign as Record<string, any> : null;
  const out: Array<{
    signTypeId: string | null;
    signLabel: string;
    signCode?: string | null;
  }> = [];

  if (Array.isArray(details?.signs)) {
    for (const raw of details.signs) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
      const parsed = signEntryFromRecord(raw as Record<string, any>, subtypeFromWorkOrder(wo));
      if (parsed) out.push(parsed);
    }
  }

  if (!out.length) {
    const legacy = signEntryFromRecord(
      {
        signTypeId: details?.signTypeId ?? sign?.signTypeId,
        signName: details?.signName ?? sign?.signName,
        signType: details?.signType ?? sign?.signType,
        signCode: details?.signCode ?? details?.MUTCDCode ?? details?.mutcdCode ?? sign?.signCode,
      },
      subtypeFromWorkOrder(wo),
    );
    if (legacy) out.push(legacy);
  }

  const seen = new Set<string>();
  const deduped: typeof out = [];
  for (const entry of out) {
    const key = `${String(entry.signTypeId ?? "").toLowerCase()}|${entry.signLabel.toLowerCase()}|${String(entry.signCode ?? "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(entry);
  }

  return deduped;
}

function hasExplicitInstallIntent(wo: WorkOrder): boolean {
  const details = wo.details;
  if (!details || typeof details !== "object" || Array.isArray(details)) return false;

  const bag = details as Record<string, any>;
  const actionCandidates = [
    bag.action,
    bag.signAction,
    bag?.sign?.action,
    bag?.signDetails?.action,
  ];

  return actionCandidates.some((v) => String(v ?? "").trim().toLowerCase() === "install");
}

function buildAutoCreateEventDetails(wo: WorkOrder, explicitInstall: boolean): Record<string, any> {
  const base =
    wo.details && typeof wo.details === "object" && !Array.isArray(wo.details)
      ? { ...(wo.details as Record<string, any>) }
      : {};

  return {
    ...base,
    _assetLifecycleTag: explicitInstall ? "AUTO_CREATE_INSTALL" : "AUTO_CREATE_ADDED",
  };
}

// ─── Event helpers ─────────────────────────────────────────────────────

/** Choose event kind for an auto-linked asset event. */
function eventKindForWorkOrder(_wo: WorkOrder): AssetEventKind {
  // For MVP, REPAIR is a safe default. Can refine later (inspection vs repair).
  return "REPAIR";
}

// ─── Main entry point ──────────────────────────────────────────────────

/**
 * Auto-link (or auto-create) an asset for a work order.
 *
 * Returns a *copy* of `wo` with `assetId` + `assetMatch` populated
 * (unchanged if not applicable or already linked).
 */
export async function autoLinkOrCreateAssetForWorkOrder(wo: WorkOrder): Promise<WorkOrder> {
  // Already linked? Skip.
  if (wo.assetId) return wo;

  const assetType = mapWorkOrderTypeToAssetType(wo.type);
  if (!assetType) return wo;

  const anchor = getAssetAnchor(wo, assetType);
  if (!anchor) return wo;
  const includeCulvertGeometry = assetType === "CULVERT" && shouldCaptureCulvertGeometry(wo);

  const radiusM = matchRadiusMeters(assetType);
  const desiredSubtype = subtypeFromWorkOrder(wo);
  const now = Date.now();

  // ── 1) Look for nearby assets ────────────────────────────────────────

  const nearby = await assetsRepo.listNearby({
    orgId: wo.orgId,
    lat: anchor.lat,
    lng: anchor.lng,
    radiusMeters: radiusM,
    assetType,
  });

  // ── 2) Pick best match (subtype match preferred, then closest) ──────

  let best: { a: Asset; score: number; d: number } | null = null;

  for (const a of nearby) {
    const d = distM(anchor.lat, anchor.lng, a.lat, a.lng);
    if (d > radiusM) continue;

    const subtypeMatch =
      desiredSubtype && a.subtype && a.subtype.toLowerCase() === desiredSubtype.toLowerCase();

    // Lower score = better
    const score = (subtypeMatch ? 0 : 1000) + d;

    if (!best || score < best.score) best = { a, score, d };
  }

  if (best) {
    const matched = best.a;

    const updatedWo: WorkOrder = {
      ...wo,
      assetId: matched.id,
      assetType,
      assetMatch: {
        method: "AUTO_MATCH",
        confidence: desiredSubtype && matched.subtype ? 0.95 : 0.75,
        radiusM,
      },
      updatedAt: now,
    };

    // Create event linked to this work order
    const ev: AssetEvent = {
      id: makeClientId("assetEvent"),
      orgId: wo.orgId,
      assetId: matched.id,
      kind: eventKindForWorkOrder(wo),
      at: now,
      byUid: wo.createdByUid ?? null,
      byDisplayName: wo.createdByDisplayName ?? null,
      workOrderId: wo.id,
      notes: wo.note ?? null,
      photoIds: null,
      details: wo.details ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await assetEventsRepo.add(ev);

    // Bump parent asset timestamps
    const patchedAsset: Asset = {
      ...matched,
      details:
        assetType === "CULVERT"
          ? mergeCulvertAssetDetails(
              matched.details,
              wo.details,
              includeCulvertGeometry ? anchor.culvertGeometry : undefined,
            )
          : assetType === "SIGN"
          ? (() => {
              const signEntries = signEntriesFromWorkOrder(wo);
              if (!signEntries.length) return matched.details;

              let next = matched.details as Record<string, any> | null | undefined;
              for (const signEntry of signEntries) {
                next = appendSignEntry(next, signEntry);
              }
              return next ?? matched.details;
            })()
          : matched.details,
      lastEventAt: ev.at,
      lastInspectionAt: ev.kind === "INSPECTION" ? ev.at : matched.lastInspectionAt ?? null,
      updatedAt: now,
    };
    await assetsRepo.upsert(patchedAsset);

    return updatedWo;
  }

  // ── 3) No match — auto-create if policy allows ──────────────────────

  if (!autoCreatePolicy(assetType)) return wo;

  const newAssetId = makeClientId("asset");
  const explicitInstall = hasExplicitInstallIntent(wo);

  const newAsset: Asset = {
    id: newAssetId,
    orgId: wo.orgId,
    assetType,
    subtype: desiredSubtype,
    status: "ACTIVE",
    lat: anchor.lat,
    lng: anchor.lng,
    createdAt: now,
    updatedAt: now,
    createdByUid: wo.createdByUid ?? null,
    createdByDisplayName: wo.createdByDisplayName ?? null,
    installedAt: explicitInstall ? now : null,
    lastEventAt: now,
    lastInspectionAt: null,
    details:
      assetType === "CULVERT"
        ? mergeCulvertAssetDetails(
            null,
            wo.details,
            includeCulvertGeometry ? anchor.culvertGeometry : undefined,
          )
        : assetType === "SIGN"
        ? (() => {
            const signEntries = signEntriesFromWorkOrder(wo);
            if (!signEntries.length) return null;

            let next: Record<string, any> | null = null;
            for (const signEntry of signEntries) {
              next = appendSignEntry(next, signEntry);
            }
            return next;
          })()
        : null,
  };

  await assetsRepo.upsert(newAsset);

  const autoCreateEv: AssetEvent = {
    id: makeClientId("assetEvent"),
    orgId: wo.orgId,
    assetId: newAssetId,
    kind: explicitInstall ? "INSTALL" : "NOTE",
    at: now,
    byUid: wo.createdByUid ?? null,
    byDisplayName: wo.createdByDisplayName ?? null,
    workOrderId: wo.id,
    notes: explicitInstall ? wo.note ?? null : wo.note ?? "Added to asset inventory from work order.",
    photoIds: null,
    details: buildAutoCreateEventDetails(wo, explicitInstall),
    createdAt: now,
    updatedAt: now,
  };

  await assetEventsRepo.add(autoCreateEv);

  const updatedWo: WorkOrder = {
    ...wo,
    assetId: newAssetId,
    assetType,
    assetMatch: { method: "AUTO_CREATE", confidence: 1.0, radiusM },
    updatedAt: now,
  };

  return updatedWo;
}
