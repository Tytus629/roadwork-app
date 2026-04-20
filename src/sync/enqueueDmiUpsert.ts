// src/sync/enqueueDmiUpsert.ts
//
// Enqueues a UPSERT_DMI job into the outbox.
// Called by dmiService after the SQLite row is written.

import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";
import { DmiRecord } from "../repositories/dmiRepo";

export function enqueueDmiUpsert(rec: DmiRecord) {
  const id = `${rec.id}:UPSERT_DMI:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, rec.orgId, "UPSERT_DMI", rec.id, safeJsonStringify(rec), Date.now()],
  );
}
