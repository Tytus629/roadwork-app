/**
 * logService.ts
 *
 * Persistent audit log using the SQLite `logs` table.
 * Replaces the ephemeral Redux workLogSlice.
 */

import { db } from "../db/db";
import { uid } from "../utils/uid";
import { requireOrgId } from "../org/requireOrg";

export type LogEntry = {
  id: string;
  workOrderId: string;
  orgId: string | null;
  createdAt: number;
  event: string;
  message: string;
};

/**
 * Write a log entry to SQLite.
 * Silently fails if the work order FK no longer exists (CASCADE deleted).
 */
export function addLogEntry(args: {
  workOrderId: string;
  orgId?: string | null;
  event: string;
  message: string;
}) {
  try {
    const orgId = args.orgId ? requireOrgId(args.orgId) : null;
    db.executeSync(
      `INSERT INTO logs (id, workOrderId, orgId, createdAt, event, payloadJson)
       VALUES (?, ?, ?, ?, ?, ?);`,
      [uid(), args.workOrderId, orgId, Date.now(), args.event, JSON.stringify({ message: args.message })],
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
      let message = "";
      try {
        const p = JSON.parse(row.payloadJson ?? "{}");
        message = p.message ?? "";
      } catch { /* ignore */ }
      return {
        id: String(row.id),
        workOrderId: String(row.workOrderId),
        orgId: row.orgId ?? null,
        createdAt: Number(row.createdAt),
        event: String(row.event),
        message,
      };
    });
  } catch (e) {
    console.warn("[logService] listLogEntries failed:", e);
    return [];
  }
}
