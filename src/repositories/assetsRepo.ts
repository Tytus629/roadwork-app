// src/repositories/assetsRepo.ts
//
// CRUD for the assets table (signs, guardrails, culverts).
// Uses withTxSync for transactional writes, encodeDetails/decodeDetails for JSON.

import { db } from "../db/db";
import { withTxSync } from "../db/tx";
import { Asset } from "../types/Asset";
import { encodeDetails, decodeDetails } from "./detailsCodec";
import { safeJsonStringify } from "./repoUtils";

export type AssetInspectionDueMode =
  | "overdue_default"
  | "overdue_30d"
  | "overdue_1y"
  | "overdue_5y"
  | "never_inspected";

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

function mapRow(r: any): Asset {
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    assetType: r.assetType,
    subtype: r.subtype ?? null,
    status: r.status ?? "ACTIVE",

    lat: Number(r.lat),
    lng: Number(r.lng),

    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt ?? r.createdAt),
    createdByUid: r.createdByUid ?? null,
    createdByDisplayName: r.createdByDisplayName ?? null,

    installedAt: r.installedAt ?? null,

    lastEventAt: r.lastEventAt ?? null,
    lastInspectionAt: r.lastInspectionAt ?? null,

    details: decodeDetails(r.detailsJson),
  };
}

function cutoffForInspectionMode(mode: AssetInspectionDueMode): number | null {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  if (mode === "overdue_30d") return now - 30 * day;
  if (mode === "overdue_1y") return now - 365 * day;
  if (mode === "overdue_5y") return now - 365 * 5 * day;
  if (mode === "overdue_default") return now - 365 * 2 * day;
  return null;
}

function enqueueOutbox(orgId: string, kind: string, entityId: string, payload: any) {
  const id = `${entityId}:${kind}:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, kind, entityId, safeJsonStringify(payload), Date.now()],
  );
}

function upsertAssetRow(asset: Asset, enqueue: boolean) {
  withTxSync(() => {
    db.executeSync(
      `
      INSERT OR REPLACE INTO assets (
        id, orgId, assetType, subtype, status,
        lat, lng,
        createdAt, updatedAt,
        createdByUid, createdByDisplayName,
        installedAt, lastEventAt, lastInspectionAt,
        detailsJson
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        asset.id,
        asset.orgId,
        asset.assetType,
        asset.subtype ?? null,
        asset.status,
        asset.lat,
        asset.lng,
        asset.createdAt,
        asset.updatedAt ?? Date.now(),
        asset.createdByUid ?? null,
        asset.createdByDisplayName ?? null,
        asset.installedAt ?? null,
        asset.lastEventAt ?? null,
        asset.lastInspectionAt ?? null,
        encodeDetails(asset.details),
      ],
    );

    if (enqueue) {
      enqueueOutbox(asset.orgId, "UPSERT_ASSET", asset.id, asset);
    }
  });
}

// ─── Public interface ─────────────────────────────────────────────────

export const assetsRepo = {
  async getById({ orgId, id }: { orgId: string; id: string }): Promise<Asset | null> {
    const r = db.executeSync(
      `SELECT * FROM assets WHERE orgId = ? AND id = ? LIMIT 1`,
      [orgId, id],
    );
    const rows = rowsToArray(r?.rows);
    if (!rows.length) return null;
    return mapRow(rows[0]);
  },

  async listNearby({
    orgId,
    lat,
    lng,
    radiusMeters = 50,
    assetType,
  }: {
    orgId: string;
    lat: number;
    lng: number;
    radiusMeters?: number;
    assetType?: string;
  }): Promise<Asset[]> {
    // Approximate bounding box (1° lat ≈ 111 km)
    const deg = radiusMeters / 111_000;
    const minLat = lat - deg;
    const maxLat = lat + deg;
    const minLng = lng - deg;
    const maxLng = lng + deg;

    let sql = `
      SELECT *
      FROM assets
      WHERE orgId = ?
        AND lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
        AND status = 'ACTIVE'
    `;
    const args: any[] = [orgId, minLat, maxLat, minLng, maxLng];

    if (assetType) {
      sql += ` AND assetType = ?`;
      args.push(assetType);
    }

    sql += `
      ORDER BY ((lat - ?) * (lat - ?) + (lng - ?) * (lng - ?)) ASC
      LIMIT 200
    `;
    args.push(lat, lat, lng, lng);

    const r = db.executeSync(sql, args);
    return rowsToArray(r?.rows).map(mapRow);
  },

  async listInspectableDue({
    orgId,
    mode = "overdue_default",
    limit = 2000,
  }: {
    orgId: string;
    mode?: AssetInspectionDueMode;
    limit?: number;
  }): Promise<Asset[]> {
    const cutoff = cutoffForInspectionMode(mode);
    const params: any[] = [orgId];
    let inspectionClause = "lastInspectionAt IS NULL";

    if (mode !== "never_inspected") {
      inspectionClause = "(lastInspectionAt IS NULL OR lastInspectionAt < ?)";
      params.push(cutoff);
    }

    params.push(limit);

    const r = db.executeSync(
      `
      SELECT *
      FROM assets
      WHERE orgId = ?
        AND status = 'ACTIVE'
        AND ${inspectionClause}
      ORDER BY
        CASE WHEN lastInspectionAt IS NULL THEN 0 ELSE 1 END ASC,
        lastInspectionAt ASC,
        updatedAt DESC
      LIMIT ?
      `,
      params,
    );

    return rowsToArray(r?.rows).map(mapRow);
  },

  /** Return all assets within a viewport bounding box. */
  async getInViewport({
    orgId,
    bbox,
  }: {
    orgId: string;
    bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  }): Promise<Asset[]> {
    const r = db.executeSync(
      `
      SELECT *
      FROM assets
      WHERE orgId = ?
        AND lat BETWEEN ? AND ?
        AND lng BETWEEN ? AND ?
        AND status = 'ACTIVE'
      ORDER BY createdAt DESC
      LIMIT 500
      `,
      [orgId, bbox.minLat, bbox.maxLat, bbox.minLng, bbox.maxLng],
    );
    return rowsToArray(r?.rows).map(mapRow);
  },

  async upsert(asset: Asset) {
    upsertAssetRow(asset, true);
  },

  async upsertLocalOnly(asset: Asset) {
    upsertAssetRow(asset, false);
  },

  async deleteById({ orgId, id }: { orgId: string; id: string }) {
    db.executeSync(`DELETE FROM assets WHERE orgId = ? AND id = ?`, [orgId, id]);
  },
};
