// src/services/assetsService.ts
//
// Canonical write path for assets & asset-events.
// Mirrors workOrdersService: repo write → outbox → DbEvents.

import { Asset } from "../types/Asset";
import { AssetEvent } from "../types/AssetEvent";
import { assetsRepo } from "../repositories/assetsRepo";
import { assetEventsRepo } from "../repositories/assetEventsRepo";
import { emitDbChanged } from "../state/DbEvents";
import { assertRolePermission } from "../permissions/rolePermissions";

export const assetsService = {
  /** Upsert an asset (insert or overwrite) and emit change. */
  async upsert(asset: Asset) {
    assertRolePermission("manageAssets");
    await assetsRepo.upsert(asset);
    emitDbChanged();
  },

  /**
   * Add a timeline event to an asset.
   * Also updates the parent asset's lastEventAt / lastInspectionAt
   * (handled inside assetEventsRepo.add via its transaction).
   */
  async addEvent(event: AssetEvent) {
    assertRolePermission("manageAssets");
    await assetEventsRepo.add(event);
    emitDbChanged();
  },
};
