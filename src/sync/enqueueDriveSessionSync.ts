// Enqueues a SYNC_DRIVE_SESSION job. Payload is tiny (ids only); the handler
// reads segments/events from SQLite at send time so retries pick up the latest rows.
import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";

export function enqueueDriveSessionSync(orgId: string | null, sessionId: string) {
  if (!orgId) return; // no org → stays local only
  const now = Date.now();
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [`${sessionId}:SYNC_DRIVE_SESSION`, orgId, "SYNC_DRIVE_SESSION", sessionId, safeJsonStringify({ orgId, sessionId, createdAt: now, updatedAt: now }), now],
  );
}
