// src/sync/outboxRepo.ts
//
// Tiny helper to query outbox pending count from SQLite.
// Uses synchronous op-sqlite (executeSync) matching the rest of the codebase.

import { db } from "../db/db";
import { requireOrgId } from "../org/requireOrg";

const OUTBOX_MAX_ROW_ATTEMPTS = 10;

function readRows(r: any): any[] {
  const rows = r?.rows;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows.item === "function") {
    const out: any[] = [];
    for (let i = 0; i < (rows.length ?? 0); i++) out.push(rows.item(i));
    return out;
  }
  return rows ? Array.from(rows) : [];
}

export function getOutboxPendingCount(orgIdRaw: string): number {
  const orgId = requireOrgId(orgIdRaw);
  const result = db.executeSync(
    `SELECT COUNT(*) as c
     FROM outbox
     WHERE orgId = ?
       AND attempts < ?
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%permission-denied%'
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%unauthenticated%'
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%forbidden%'
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%403%'
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%missing required org permission%'
       AND LOWER(COALESCE(lastError, '')) NOT LIKE '%unauth%'`,
    [orgId, OUTBOX_MAX_ROW_ATTEMPTS]
  );
  const rows = readRows(result);
  return Number(rows?.[0]?.c ?? 0);
}

/**
 * True when a DELETE_WORK_ORDER job for this work order is still queued and retryable.
 * Inbound sync uses this so a locally deleted work order is not re-pulled as visible
 * before the server-side soft delete lands.
 */
export function hasPendingWorkOrderDelete(orgId: string, workOrderId: string): boolean {
  const r = db.executeSync(
    `SELECT COUNT(*) as c FROM outbox
     WHERE orgId=? AND entityId=? AND kind='DELETE_WORK_ORDER' AND attempts < ?`,
    [orgId, workOrderId, OUTBOX_MAX_ROW_ATTEMPTS],
  );
  const rows = readRows(r);
  return Number(rows[0]?.c ?? 0) > 0;
}
