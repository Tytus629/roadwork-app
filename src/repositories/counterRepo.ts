// src/repositories/counterRepo.ts
//
// CRUD for the tool_counter table (tally counter records).
// Uses withTxSync for transactional writes.

import { db } from "../db/db";
import { withTxSync } from "../db/tx";

// ─── Types ───────────────────────────────────────────────────────────────

export type CounterRecord = {
  id: string;
  orgId: string;

  createdAt: number;
  updatedAt: number;

  createdByUid?: string | null;
  createdByDisplayName?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;

  label: string;
  count: number;

  lat?: number | null;
  lng?: number | null;

  notes?: string | null;
};

// ─── Helpers ─────────────────────────────────────────────────────────────

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

function mapRow(r: any): CounterRecord {
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    createdByUid: r.createdByUid ?? null,
    createdByDisplayName: r.createdByDisplayName ?? null,
    deviceId: r.deviceId ?? null,
    appVersion: r.appVersion ?? null,
    label: String(r.label),
    count: Number(r.count),
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    notes: r.notes ?? null,
  };
}

// ─── Public interface ────────────────────────────────────────────────────

export const counterRepo = {
  async list({
    orgId,
    limit = 120,
  }: {
    orgId: string;
    limit?: number;
  }): Promise<CounterRecord[]> {
    const r = db.executeSync(
      `SELECT * FROM tool_counter WHERE orgId = ? ORDER BY createdAt DESC LIMIT ?`,
      [orgId, limit],
    );
    return rowsToArray(r?.rows).map(mapRow);
  },

  async insert(rec: CounterRecord) {
    withTxSync(() => {
      db.executeSync(
        `
        INSERT INTO tool_counter (
          id, orgId, createdAt, updatedAt,
          createdByUid, createdByDisplayName, deviceId, appVersion,
          label, count, lat, lng, notes
        ) VALUES (?, ?, ?, ?,
                  ?, ?, ?, ?,
                  ?, ?, ?, ?, ?)
        `,
        [
          rec.id,
          rec.orgId,
          rec.createdAt,
          rec.updatedAt,
          rec.createdByUid ?? null,
          rec.createdByDisplayName ?? null,
          rec.deviceId ?? null,
          rec.appVersion ?? null,
          rec.label,
          rec.count,
          rec.lat ?? null,
          rec.lng ?? null,
          rec.notes ?? null,
        ],
      );
    });
  },
};
