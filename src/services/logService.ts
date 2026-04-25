/**
 * logService.ts
 *
 * Persistent audit log using the SQLite `logs` table.
 * Replaces the ephemeral Redux workLogSlice.
 */

import { db } from "../db/db";
import { uid } from "../utils/uid";
import { requireOrgId } from "../org/requireOrg";

export type LogPayload = Record<string, unknown> & {
  message?: string;
  actorUid?: string | null;
  actorName?: string | null;
  actorDisplayName?: string | null;
  actorEmail?: string | null;
  targetType?: string | null;
  workOrderType?: string | null;
};

export type LogEntry = {
  id: string;
  workOrderId: string;
  orgId: string | null;
  createdAt: number;
  event: string;
  message: string;
  actorUid: string | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: string | null;
  payload: LogPayload | null;
};

function trimToNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function toPayloadRecord(value: unknown): LogPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as LogPayload;
}

/**
 * Write a log entry to SQLite.
 * Silently fails if the work order FK no longer exists (CASCADE deleted).
 */
export function addLogEntry(args: {
  workOrderId: string;
  orgId?: string | null;
  event: string;
  message: string;
  payload?: LogPayload | null;
}) {
  try {
    const orgId = args.orgId ? requireOrgId(args.orgId) : null;
    const payload: LogPayload = {
      ...(args.payload ?? {}),
      message: args.message,
    };
    db.executeSync(
      `INSERT INTO logs (id, workOrderId, orgId, createdAt, event, payloadJson)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [uid(), args.workOrderId, orgId, Date.now(), args.event, JSON.stringify(payload)],
    );
  } catch (e) {
    console.warn("[logService] addLogEntry failed:", e);
  }
}

/**
 * Read all log entries, newest first.
 * When orgId is provided, scopes results to that org.
 */
export function listLogEntries(limit = 200, orgId?: string | null): LogEntry[] {
  try {
    const safeOrg = orgId ? requireOrgId(orgId) : null;
    const orgClause = safeOrg ? ` WHERE orgId = ?` : ``;
    const orgParams = safeOrg ? [safeOrg] : [];
    const r = db.executeSync(
      `SELECT id, workOrderId, orgId, createdAt, event, payloadJson
       FROM logs${orgClause} ORDER BY createdAt DESC LIMIT ?;`,
      [...orgParams, limit],
    );
    const rows: any[] = Array.isArray(r?.rows) ? r.rows : [];
    return rows.map((row) => {
      let payload: LogPayload | null = null;
      try {
        payload = toPayloadRecord(JSON.parse(row.payloadJson ?? "{}"));
      } catch { /* ignore */ }
      const message = trimToNull(payload?.message) ?? "";
      const actorName =
        trimToNull(payload?.actorName) ??
        trimToNull(payload?.actorDisplayName);
      return {
        id: String(row.id),
        workOrderId: String(row.workOrderId),
        orgId: row.orgId ?? null,
        createdAt: Number(row.createdAt),
        event: String(row.event),
        message,
        actorUid: trimToNull(payload?.actorUid),
        actorName,
        actorEmail: trimToNull(payload?.actorEmail),
        targetType: trimToNull(payload?.targetType),
        payload,
      };
    });
  } catch (e) {
    console.warn("[logService] listLogEntries failed:", e);
    return [];
  }
}
