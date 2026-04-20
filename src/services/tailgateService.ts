// src/services/tailgateService.ts
//
// Canonical write path for tailgate safety logs.
//
// All tailgate mutations flow through here:
//   1. Write canonical row → tailgateRepo.upsert
//   2. Enqueue sync job → enqueueTailgateUpsert (outbox)
//   3. Emit DbEvents → hooks re-fetch

import { tailgateRepo, TailgateLog } from "../repositories/tailgateRepo";
import { enqueueTailgateUpsert } from "../sync/enqueueTailgateUpsert";
import { emitDbChanged } from "../state/DbEvents";
import { getDeviceMeta } from "../utils/deviceMeta";
import { assertRolePermission } from "../permissions/rolePermissions";

export const tailgateService = {
  /**
   * Save a tailgate log to SQLite + enqueue for sync + notify UI.
   */
  async upsertAndEnqueue(log: TailgateLog) {
    assertRolePermission("createTailgate");
    const { deviceId, appVersion } = getDeviceMeta();
    const enriched = { ...log, deviceId, appVersion };
    await tailgateRepo.upsert(enriched);
    enqueueTailgateUpsert(enriched);
    emitDbChanged();
  },
};
