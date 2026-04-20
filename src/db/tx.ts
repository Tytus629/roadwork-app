// src/db/tx.ts
import { db } from "./db";

/**
 * Run a synchronous function inside a SQLite transaction.
 * Automatically BEGINs, COMMITs on success, ROLLBACKs on error.
 */
export function withTxSync<T>(fn: () => T): T {
  db.executeSync("BEGIN");
  try {
    const out = fn();
    db.executeSync("COMMIT");
    return out;
  } catch (e) {
    try {
      db.executeSync("ROLLBACK");
    } catch {
      // ignore rollback errors
    }
    throw e;
  }
}
