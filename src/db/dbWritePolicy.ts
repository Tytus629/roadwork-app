// src/db/dbWritePolicy.ts
//
// Guardrail: prevents accidental direct SQL writes to work_orders.
// All work order mutations should flow through workOrdersService.
//
// Usage (in any old function that still writes directly):
//
//   import { DB_WRITE_POLICY } from "../db/dbWritePolicy";
//   if (!DB_WRITE_POLICY.allowLegacyWorkOrderWrites) {
//     throw new Error("Legacy work_orders write path is disabled. Use workOrdersService.");
//   }

export const DB_WRITE_POLICY = {
  /**
   * Set to true ONLY during development if you need to temporarily
   * allow legacy direct writes while migrating to the service layer.
   *
   * Once all screens route through workOrdersService, set back to false
   * and remove the flag entirely.
   */
  allowLegacyWorkOrderWrites: false,
};
