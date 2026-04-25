import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";
import type { MaintenanceSlip } from "../types/MaintenanceSlip";

export function enqueueMaintenanceSlipUpsert(slip: MaintenanceSlip) {
  const id = `${slip.id}:UPSERT_MAINTENANCE_SLIP:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, slip.orgId, "UPSERT_MAINTENANCE_SLIP", slip.id, safeJsonStringify(slip), Date.now()],
  );
}
