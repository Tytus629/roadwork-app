// src/db/migrate_workorders_v2.ts
//
// Adds production metadata + asset linking columns to work_orders.
// Uses addColumnIfMissing() so it's safe to run on every app start.
//
// ACTUAL COLUMN NAMES match the existing work_orders schema:
//   type, geomType, lat, lng, lineJson, minLat/maxLat/minLng/maxLng, etc.
// New columns added here extend that schema without changing existing ones.

import { addColumnIfMissing } from "./db";

export function migrateWorkOrdersV2() {
  // Production metadata (who/when/where created)
  addColumnIfMissing("work_orders", "createdByUid", "TEXT");
  addColumnIfMissing("work_orders", "createdByEmail", "TEXT");
  addColumnIfMissing("work_orders", "createdByFirstName", "TEXT");
  addColumnIfMissing("work_orders", "createdByLastName", "TEXT");
  addColumnIfMissing("work_orders", "createdByDisplayName", "TEXT");
  addColumnIfMissing("work_orders", "assignedToUid", "TEXT");
  addColumnIfMissing("work_orders", "assignedToName", "TEXT");
  addColumnIfMissing("work_orders", "assignedToEmail", "TEXT");
  addColumnIfMissing("work_orders", "deviceId", "TEXT");
  addColumnIfMissing("work_orders", "appVersion", "TEXT");

  // Asset linking (coming next — workOrdersRepo.create will populate these)
  addColumnIfMissing("work_orders", "assetId", "TEXT");
  addColumnIfMissing("work_orders", "assetMatchJson", "TEXT");

  // detailsJson already exists (added in runMigrations), but keep safe
  addColumnIfMissing("work_orders", "detailsJson", "TEXT");
}
