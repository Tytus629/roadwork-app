import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";

/**
 * Queue a server-side soft delete (outbox kind DELETE_WORK_ORDER → roadwork_deleteWorkOrder).
 * Payload shape matches repos/workOrderRepo.softDeleteWorkOrder: { orgId, workOrderId, deletedAt }.
 * Uses a timestamp-based id (no uuid) because the app has no crypto.getRandomValues polyfill.
 */
export function enqueueWorkOrderDelete(orgId: string, workOrderId: string, deletedAt: number = Date.now()) {
  const id = `${workOrderId}:DELETE_WORK_ORDER:${deletedAt}`;
  // Drop not-yet-sent upserts for this work order. Otherwise an upsert stuck in backoff could
  // run after the delete and (for a work order the server has never seen) create it again.
  db.executeSync(
    `DELETE FROM outbox WHERE orgId=? AND entityId=? AND kind='UPSERT_WORK_ORDER'`,
    [orgId, workOrderId],
  );
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, orgId, "DELETE_WORK_ORDER", workOrderId, safeJsonStringify({ orgId, workOrderId, deletedAt }), deletedAt],
  );
}
