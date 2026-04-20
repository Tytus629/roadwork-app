// src/services/counterService.ts
//
// Canonical write path for counter records.
// Save to SQLite + enqueue outbox + emit DbEvents.

import { counterRepo, CounterRecord } from "../repositories/counterRepo";
import { enqueueCounterUpsert } from "../sync/enqueueCounterUpsert";
import { emitDbChanged } from "../state/DbEvents";
import { getDeviceMeta } from "../utils/deviceMeta";
import { assertRolePermission } from "../permissions/rolePermissions";

export const counterService = {
  async insertAndEnqueue(rec: CounterRecord) {
    assertRolePermission("createCounter");
    const { deviceId, appVersion } = getDeviceMeta();
    const enriched = { ...rec, deviceId, appVersion };
    await counterRepo.insert(enriched);
    enqueueCounterUpsert(enriched);
    emitDbChanged();
  },
};
