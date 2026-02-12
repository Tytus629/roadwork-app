import { uid } from "./uid";
import { addWorkLog } from "../storage/workRepo";

/**
 * STEP D-5: Persist audit log entries to SQLite database
 * This ensures all work item changes are backed by persistent storage
 */
export async function persistAuditLog(
  workItemId: string,
  eventType: string,
  data?: any,
): Promise<void> {
  try {
    await addWorkLog({
      id: uid(),
      workItemId,
      eventType,
      data,
    });
  } catch (e) {
    console.error("[persistAuditLog] failed", e);
  }
}
