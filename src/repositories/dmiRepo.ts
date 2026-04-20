// src/repositories/dmiRepo.ts
//
// CRUD for the tool_dmi table (distance measuring instrument records).
// Uses withTxSync for transactional writes.

import { db } from "../db/db";
import { withTxSync } from "../db/tx";

// ─── Types ───────────────────────────────────────────────────────────────

export type DmiRecord = {
  id: string;
  orgId: string;

  createdAt: number;
  updatedAt: number;

  createdByUid?: string | null;
  createdByDisplayName?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;

  startAt: number;
  endAt: number;

  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;

  inputUnit?: "mi" | "ft";
  startReadingRaw?: string | null;
  endReadingRaw?: string | null;
  startReadingMiles?: number | null;
  endReadingMiles?: number | null;
  distanceMiles?: number | null;
  distanceMeters: number;
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

function mapRow(r: any): DmiRecord {
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    createdByUid: r.createdByUid ?? null,
    createdByDisplayName: r.createdByDisplayName ?? null,
    deviceId: r.deviceId ?? null,
    appVersion: r.appVersion ?? null,
    startAt: Number(r.startAt),
    endAt: Number(r.endAt),
    startLat: r.startLat ?? null,
    startLng: r.startLng ?? null,
    endLat: r.endLat ?? null,
    endLng: r.endLng ?? null,
    inputUnit: r.inputUnit === "ft" ? "ft" : "mi",
    startReadingRaw: r.startReadingRaw ?? null,
    endReadingRaw: r.endReadingRaw ?? null,
    startReadingMiles: r.startReadingMiles == null ? null : Number(r.startReadingMiles),
    endReadingMiles: r.endReadingMiles == null ? null : Number(r.endReadingMiles),
    distanceMiles: r.distanceMiles == null ? null : Number(r.distanceMiles),
    distanceMeters: Number(r.distanceMeters),
    notes: r.notes ?? null,
  };
}

// ─── Public interface ────────────────────────────────────────────────────

export const dmiRepo = {
  async list({
    orgId,
    limit = 100,
  }: {
    orgId: string;
    limit?: number;
  }): Promise<DmiRecord[]> {
    const r = db.executeSync(
      `SELECT * FROM tool_dmi WHERE orgId = ? ORDER BY createdAt DESC LIMIT ?`,
      [orgId, limit],
    );
    return rowsToArray(r?.rows).map(mapRow);
  },

  async insert(rec: DmiRecord) {
    withTxSync(() => {
      db.executeSync(
        `
        INSERT INTO tool_dmi (
          id, orgId, createdAt, updatedAt,
          createdByUid, createdByDisplayName, deviceId, appVersion,
          startAt, endAt,
          startLat, startLng, endLat, endLng,
          inputUnit, startReadingRaw, endReadingRaw,
          startReadingMiles, endReadingMiles, distanceMiles,
          distanceMeters, notes
        ) VALUES (?, ?, ?, ?,
                  ?, ?, ?, ?,
                  ?, ?,
                  ?, ?, ?, ?,
                  ?, ?, ?,
                  ?, ?, ?,
                  ?, ?)
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
          rec.startAt,
          rec.endAt,
          rec.startLat ?? null,
          rec.startLng ?? null,
          rec.endLat ?? null,
          rec.endLng ?? null,
          rec.inputUnit ?? "mi",
          rec.startReadingRaw ?? null,
          rec.endReadingRaw ?? null,
          rec.startReadingMiles ?? null,
          rec.endReadingMiles ?? null,
          rec.distanceMiles ?? null,
          rec.distanceMeters,
          rec.notes ?? null,
        ],
      );
    });
  },
};
