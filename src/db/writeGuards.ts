// src/db/writeGuards.ts
//
// DEV-only tripwire: throws if a legacy code path tries to write
// to work_orders directly instead of going through workOrdersService.

export function assertNoDirectWorkOrdersWrite(caller: string) {
  if (__DEV__) {
    throw new Error(
      `[DB WRITE GUARD] Direct work_orders write detected in ${caller}. ` +
        `Use workOrdersService (repo + enqueue) instead.`,
    );
  }
}
