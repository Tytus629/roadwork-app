// src/services/dmiService.ts
//
// Canonical write path for DMI records.
// Save to SQLite + enqueue outbox + emit DbEvents.

import { dmiRepo, DmiRecord } from "../repositories/dmiRepo";
import { enqueueDmiUpsert } from "../sync/enqueueDmiUpsert";
import { emitDbChanged } from "../state/DbEvents";
import { getDeviceMeta } from "../utils/deviceMeta";
import { assertRolePermission } from "../permissions/rolePermissions";

export const dmiService = {
  async insertAndEnqueue(rec: DmiRecord) {
    assertRolePermission("createDmi");
    const { deviceId, appVersion } = getDeviceMeta();
    const enriched = { ...rec, deviceId, appVersion };
    await dmiRepo.insert(enriched);
    enqueueDmiUpsert(enriched);
    emitDbChanged();
  },
};
