// src/repositories/toolsRepo.ts
//
// CRUD for the tool_records table (DMI, Counter, Tailgate Safety).
// Each kind stores its type-specific data in dataJson.

import { CounterRecord, DmiRecord, TailgateRecord } from "../types/ToolRecords";
import { db } from "../db/db";
import { requireOrgId } from "../org/requireOrg";
import { safeJsonStringify, nowEpochMs } from "./repoUtils";
import { emitDbChanged } from "../state/DbEvents";

// ─── Helpers ─────────────────────────────────────────────────────────

function enqueueOutbox(orgId: string, kind: string, entityId: string, payload: any) {
  const id = `${entityId}:${kind}:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, kind, entityId, safeJsonStringify(payload), Date.now()],
  );
}

function insertToolRecord(
  id: string,
  orgId: string,
  kind: string,
  createdAt: number,
  createdByUid: string | null | undefined,
  deviceId: string | null | undefined,
  appVersion: string | null | undefined,
  data: Record<string, any>,
) {
  const validated = requireOrgId(orgId);

  db.executeSync(
    `INSERT INTO tool_records
      (id, orgId, kind, createdAt, createdByUid, deviceId, appVersion, dataJson)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET dataJson=excluded.dataJson`,
    [
      id,
      validated,
      kind,
      createdAt,
      createdByUid ?? null,
      deviceId ?? null,
      appVersion ?? null,
      safeJsonStringify(data),
    ],
  );

  enqueueOutbox(validated, `SAVE_TOOL_${kind}`, id, { id, orgId: validated, kind, ...data });
  emitDbChanged();
}

// ─── Public interface ─────────────────────────────────────────────────

export type ToolsRepo = {
  saveDmi(rec: DmiRecord): Promise<void>;
  saveCounter(rec: CounterRecord): Promise<void>;
  saveTailgate(rec: TailgateRecord): Promise<void>;
};

export const toolsRepo: ToolsRepo = {
  async saveDmi(rec) {
    insertToolRecord(rec.id, rec.orgId, "DMI", rec.createdAt ?? nowEpochMs(), rec.createdByUid, rec.deviceId, rec.appVersion, {
      startAt: rec.startAt,
      endAt: rec.endAt,
      startLat: rec.startLat ?? null,
      startLng: rec.startLng ?? null,
      endLat: rec.endLat ?? null,
      endLng: rec.endLng ?? null,
      distanceMeters: rec.distanceMeters,
    });
  },

  async saveCounter(rec) {
    insertToolRecord(rec.id, rec.orgId, "COUNTER", rec.createdAt ?? nowEpochMs(), rec.createdByUid, rec.deviceId, rec.appVersion, {
      label: rec.label,
      count: rec.count,
      lat: rec.lat ?? null,
      lng: rec.lng ?? null,
    });
  },

  async saveTailgate(rec) {
    insertToolRecord(rec.id, rec.orgId, "TAILGATE", rec.createdAt ?? nowEpochMs(), rec.createdByUid, rec.deviceId, rec.appVersion, {
      dateKey: rec.dateKey,
      crew: rec.crew ?? null,
      workTypes: rec.workTypes ?? null,
      hazards: rec.hazards ?? null,
      ppe: rec.ppe ?? null,
      notes: rec.notes ?? null,
    });
  },
};
