// src/repositories/assetEventsRepo.ts
//
// CRUD for the asset_events table (install, inspection, repair, etc.).
// Also updates the parent asset's lastEventAt / lastInspectionAt timestamps.

import { db } from "../db/db";
import { withTxSync } from "../db/tx";
import { AssetEvent } from "../types/AssetEvent";
import { encodeDetails, decodeDetails } from "./detailsCodec";
import { safeJsonParse, safeJsonStringify } from "./repoUtils";

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

function mapRow(r: any): AssetEvent {
  return {
    id: r.id,
    orgId: r.orgId,
    assetId: r.assetId,
    kind: r.kind,
    at: Number(r.at),
    byUid: r.byUid ?? null,
    byDisplayName: r.byDisplayName ?? null,
    workOrderId: r.workOrderId ?? null,
    notes: r.notes ?? null,
    photoIds: safeJsonParse(r.photoIdsJson, []),
    details: decodeDetails(r.detailsJson),
    createdAt: Number(r.createdAt ?? r.at),
    updatedAt: Number(r.updatedAt ?? r.at),
  };
}

function enqueueOutbox(orgId: string, kind: string, entityId: string, payload: any) {
  const id = `${entityId}:${kind}:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, kind, entityId, safeJsonStringify(payload), Date.now()],
  );
}

// ─── Public interface ─────────────────────────────────────────────────

export const assetEventsRepo = {
  async listForAsset({
    orgId,
    assetId,
    limit = 100,
  }: {
    orgId: string;
    assetId: string;
    limit?: number;
  }): Promise<AssetEvent[]> {
    const r = db.executeSync(
      `
      SELECT *
      FROM asset_events
      WHERE orgId = ?
        AND assetId = ?
      ORDER BY at DESC
      LIMIT ?
      `,
      [orgId, assetId, limit],
    );
    return rowsToArray(r?.rows).map(mapRow);
  },

  async add(event: AssetEvent) {
    withTxSync(() => {
      const t = event.at ?? Date.now();

      // 1. Insert event
      db.executeSync(
        `
        INSERT INTO asset_events (
          id, orgId, assetId, kind, at,
          byUid, byDisplayName,
          workOrderId, notes, photoIdsJson, detailsJson,
          createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          event.id,
          event.orgId,
          event.assetId,
          event.kind,
          t,
          event.byUid ?? null,
          event.byDisplayName ?? null,
          event.workOrderId ?? null,
          event.notes ?? null,
          safeJsonStringify(event.photoIds ?? []),
          encodeDetails(event.details),
          event.createdAt ?? t,
          event.updatedAt ?? t,
        ],
      );

      // 2. Update parent asset timestamps
      db.executeSync(
        `UPDATE assets SET lastEventAt = ?, updatedAt = ? WHERE id = ? AND orgId = ?`,
        [t, t, event.assetId, event.orgId],
      );

      if (event.kind === "INSPECTION") {
        db.executeSync(
          `UPDATE assets SET lastInspectionAt = ?, updatedAt = ? WHERE id = ? AND orgId = ?`,
          [t, t, event.assetId, event.orgId],
        );
      }

      // 3. Outbox
      enqueueOutbox(event.orgId, "ADD_ASSET_EVENT", event.id, event);
    });
  },
};
