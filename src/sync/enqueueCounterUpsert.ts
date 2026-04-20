// src/sync/enqueueCounterUpsert.ts
//
// Enqueues a UPSERT_COUNTER job into the outbox.
// Called by counterService after the SQLite row is written.

import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";
import { CounterRecord } from "../repositories/counterRepo";

export function enqueueCounterUpsert(rec: CounterRecord) {
  const id = `${rec.id}:UPSERT_COUNTER:${Date.now()}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [id, rec.orgId, "UPSERT_COUNTER", rec.id, safeJsonStringify(rec), Date.now()],
  );
}
