// src/sync/enqueueTailgateUpsert.ts
//
// Enqueues a UPSERT_TAILGATE job into the outbox.
// Called by tailgateService after the SQLite row is written.

import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";
import { TailgateLog } from "../repositories/tailgateRepo";

export function enqueueTailgateUpsert(log: TailgateLog) {
  const id = `${log.id}:UPSERT_TAILGATE:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, log.orgId, "UPSERT_TAILGATE", log.id, safeJsonStringify(log), Date.now()],
  );
}
