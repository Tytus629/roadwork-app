import { db } from "../db/db";
import { withTxSync } from "../db/tx";
import { safeJsonParse, safeJsonStringify } from "./repoUtils";
import type { MaintenanceSlip } from "../types/MaintenanceSlip";

function rowsToArray(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.item === "function") {
    const out: any[] = [];
    for (let index = 0; index < rows.length; index++) out.push(rows.item(index));
    return out;
  }
  return [];
}

function mapRow(row: any): MaintenanceSlip {
  return {
    id: String(row.id),
    orgId: String(row.orgId),
    vehicleAssetId: row.vehicleAssetId ?? null,
    vehicleSource: (row.vehicleSource ?? "manual_entry") as MaintenanceSlip["vehicleSource"],
    vehicleSnapshot: safeJsonParse(row.vehicleSnapshotJson, null),
    unitLabel: String(row.unitLabel ?? ""),
    equipmentType: row.equipmentType ?? null,
    maintenanceCategory: row.maintenanceCategory ?? null,
    systemArea: row.systemArea ?? null,
    issueTitle: String(row.issueTitle ?? ""),
    issueDescription: row.issueDescription ?? null,
    locationHint: row.locationHint ?? null,
    readingLabel: row.readingLabel ?? null,
    preferredServiceDate: row.preferredServiceDate == null ? null : Number(row.preferredServiceDate),
    serviceRequest: safeJsonParse(row.serviceRequestJson, null),
    status: row.status,
    severity: row.severity,
    createdAt: Number(row.createdAt),
    updatedAt: Number(row.updatedAt),
    createdByUid: row.createdByUid ?? null,
    createdByDisplayName: row.createdByDisplayName ?? null,
    createdByEmail: row.createdByEmail ?? null,
    assignedToUid: row.assignedToUid ?? null,
    assignedToName: row.assignedToName ?? null,
    assignedToEmail: row.assignedToEmail ?? null,
    deviceId: row.deviceId ?? null,
    appVersion: row.appVersion ?? null,
    notes: safeJsonParse(row.notesJson, []),
    lastStatusChangedAt: row.lastStatusChangedAt == null ? null : Number(row.lastStatusChangedAt),
    lastStatusChangedByUid: row.lastStatusChangedByUid ?? null,
    lastStatusChangedByDisplayName: row.lastStatusChangedByDisplayName ?? null,
    lastStatusChangedByEmail: row.lastStatusChangedByEmail ?? null,
    resolvedAt: row.resolvedAt == null ? null : Number(row.resolvedAt),
    resolvedByUid: row.resolvedByUid ?? null,
    resolvedByDisplayName: row.resolvedByDisplayName ?? null,
    resolvedByEmail: row.resolvedByEmail ?? null,
  };
}

export const maintenanceSlipsRepo = {
  async getById(args: { orgId: string; id: string }): Promise<MaintenanceSlip | null> {
    const result = db.executeSync(
      `SELECT * FROM maintenance_slips WHERE orgId = ? AND id = ? LIMIT 1`,
      [args.orgId, args.id],
    );
    const rows = rowsToArray(result?.rows);
    return rows.length ? mapRow(rows[0]) : null;
  },

  async listRecent(args: {
    orgId: string;
    status?: MaintenanceSlip["status"] | null;
    limit?: number;
  }): Promise<MaintenanceSlip[]> {
    const limit = Math.max(1, Number(args.limit ?? 120));
    const status = String(args.status ?? "").trim() as MaintenanceSlip["status"] | "";
    const hasStatus = !!status;
    const result = db.executeSync(
      hasStatus
        ? `SELECT * FROM maintenance_slips WHERE orgId = ? AND status = ? ORDER BY updatedAt DESC, createdAt DESC LIMIT ?`
        : `SELECT * FROM maintenance_slips WHERE orgId = ? ORDER BY updatedAt DESC, createdAt DESC LIMIT ?`,
      hasStatus ? [args.orgId, status, limit] : [args.orgId, limit],
    );
    return rowsToArray(result?.rows).map(mapRow);
  },

  async upsert(slip: MaintenanceSlip): Promise<void> {
    withTxSync(() => {
      db.executeSync(
        `
        INSERT OR REPLACE INTO maintenance_slips (
          id, orgId, vehicleAssetId, vehicleSource, vehicleSnapshotJson,
          unitLabel, equipmentType, maintenanceCategory, systemArea,
          issueTitle, issueDescription, locationHint, readingLabel,
          preferredServiceDate, serviceRequestJson,
          status, severity,
          createdAt, updatedAt,
          createdByUid, createdByDisplayName, createdByEmail,
          assignedToUid, assignedToName, assignedToEmail,
          deviceId, appVersion,
          notesJson,
          lastStatusChangedAt, lastStatusChangedByUid, lastStatusChangedByDisplayName, lastStatusChangedByEmail,
          resolvedAt, resolvedByUid, resolvedByDisplayName, resolvedByEmail
        ) VALUES (
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?,
          ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?, ?,
          ?, ?,
          ?,
          ?, ?, ?, ?,
          ?, ?, ?, ?
        )
        `,
        [
          slip.id,
          slip.orgId,
          slip.vehicleAssetId,
          slip.vehicleSource,
          safeJsonStringify(slip.vehicleSnapshot),
          slip.unitLabel,
          slip.equipmentType,
          slip.maintenanceCategory,
          slip.systemArea,
          slip.issueTitle,
          slip.issueDescription,
          slip.locationHint,
          slip.readingLabel,
          slip.preferredServiceDate,
          safeJsonStringify(slip.serviceRequest),
          slip.status,
          slip.severity,
          slip.createdAt,
          slip.updatedAt,
          slip.createdByUid,
          slip.createdByDisplayName,
          slip.createdByEmail,
          slip.assignedToUid,
          slip.assignedToName,
          slip.assignedToEmail,
          slip.deviceId,
          slip.appVersion,
          safeJsonStringify(slip.notes ?? []),
          slip.lastStatusChangedAt,
          slip.lastStatusChangedByUid,
          slip.lastStatusChangedByDisplayName,
          slip.lastStatusChangedByEmail,
          slip.resolvedAt,
          slip.resolvedByUid,
          slip.resolvedByDisplayName,
          slip.resolvedByEmail,
        ],
      );
    });
  },

  async deleteById(args: { orgId: string; id: string }): Promise<void> {
    withTxSync(() => {
      db.executeSync(`DELETE FROM maintenance_slips WHERE orgId = ? AND id = ?`, [args.orgId, args.id]);
    });
  },
};
