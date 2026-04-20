// src/repositories/tailgateRepo.ts
//
// CRUD for the tailgate_logs table (daily safety checklists).
// Uses withTxSync for transactional writes + outbox enqueue.

import { db } from "../db/db";
import { withTxSync } from "../db/tx";
import { safeJsonParse, safeJsonStringify } from "./repoUtils";

// ─── Types ───────────────────────────────────────────────────────────────

export type TailgateLog = {
  id: string;
  orgId: string;

  dateKey: string; // "YYYY-MM-DD" local
  createdAt: number;
  updatedAt: number;

  createdByUid?: string | null;
  createdByDisplayName?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;

  crew?: string[] | null;
  workTypes?: string[] | null;
  hazards?: string[] | null;
  ppe?: string[] | null;
  trafficControl?: string[] | null;

  notes?: string | null;

  signedBy?: { name: string; at: number }[] | null;
  supervisorName?: string | null;
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

function mapRow(r: any): TailgateLog {
  return {
    id: String(r.id),
    orgId: String(r.orgId),
    dateKey: String(r.dateKey),
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),

    createdByUid: r.createdByUid ?? null,
    createdByDisplayName: r.createdByDisplayName ?? null,
    deviceId: r.deviceId ?? null,
    appVersion: r.appVersion ?? null,

    crew: safeJsonParse(r.crewJson, null),
    workTypes: safeJsonParse(r.workTypesJson, null),
    hazards: safeJsonParse(r.hazardsJson, null),
    ppe: safeJsonParse(r.ppeJson, null),
    trafficControl: safeJsonParse(r.trafficControlJson, null),

    notes: r.notes ?? null,
    signedBy: safeJsonParse(r.signedByJson, null),
    supervisorName: r.supervisorName ?? null,
  };
}

// ─── Public interface ────────────────────────────────────────────────────

export const tailgateRepo = {
  async getById({ orgId, id }: { orgId: string; id: string }): Promise<TailgateLog | null> {
    const r = db.executeSync(
      `SELECT * FROM tailgate_logs WHERE orgId = ? AND id = ? LIMIT 1`,
      [orgId, id],
    );
    const rows = rowsToArray(r?.rows);
    if (!rows.length) return null;
    return mapRow(rows[0]);
  },

  async listByDateDesc({
    orgId,
    limit = 60,
  }: {
    orgId: string;
    limit?: number;
  }): Promise<TailgateLog[]> {
    const r = db.executeSync(
      `SELECT * FROM tailgate_logs WHERE orgId = ? ORDER BY dateKey DESC, createdAt DESC LIMIT ?`,
      [orgId, limit],
    );
    return rowsToArray(r?.rows).map(mapRow);
  },

  async upsert(log: TailgateLog) {
    withTxSync(() => {
      db.executeSync(
        `
        INSERT OR REPLACE INTO tailgate_logs (
          id, orgId, dateKey, createdAt, updatedAt,
          createdByUid, createdByDisplayName, deviceId, appVersion,
          crewJson, workTypesJson, hazardsJson, ppeJson, trafficControlJson,
          notes, signedByJson, supervisorName
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?
        )
        `,
        [
          log.id,
          log.orgId,
          log.dateKey,
          log.createdAt,
          log.updatedAt,

          log.createdByUid ?? null,
          log.createdByDisplayName ?? null,
          log.deviceId ?? null,
          log.appVersion ?? null,

          safeJsonStringify(log.crew ?? []),
          safeJsonStringify(log.workTypes ?? []),
          safeJsonStringify(log.hazards ?? []),
          safeJsonStringify(log.ppe ?? []),
          safeJsonStringify(log.trafficControl ?? []),

          log.notes ?? null,
          safeJsonStringify(log.signedBy ?? []),
          log.supervisorName ?? null,
        ],
      );

    });
  },
};
