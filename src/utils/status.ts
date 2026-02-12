import type { WorkItem, WorkStatus } from "../types/workItem";
import type { WorkLogEntry } from "../types/workLog";
import { uid } from "./uid";
import { persistAuditLog } from "./audit";

/**
 * Centralized status transition logic for Work Items.
 * 
 * STEP 2: Status Workflow Polish
 * - Handles status changes: needs → in_progress → completed
 * - Sets completedAt timestamp when transitioning to "completed"
 * - Clears completedAt when moving away from "completed"
 * - Creates audit log entries for status changes
 * - Always sets needsSync: true
 * - Always updates updatedAt timestamp
 */

export type StatusTransitionResult = {
  updatedItem: WorkItem;
  logEntry: WorkLogEntry;
};

/**
 * Transition a work item to a new status.
 * 
 * @param item - The current work item
 * @param newStatus - The target status
 * @param actor - Optional user/actor name for audit log
 * @returns Updated item and log entry (both ready for dispatch/persistence)
 */
export function transitionStatus(
  item: WorkItem,
  newStatus: WorkStatus,
  actor?: string
): StatusTransitionResult {
  const now = Date.now();
  const oldStatus = item.status;

  // Build the updated item
  const updatedItem: WorkItem = {
    ...item,
    status: newStatus,
    updatedAt: now,
    needsSync: true,
  };

  // Set completedAt timestamp when moving to "completed"
  if (newStatus === "completed" && oldStatus !== "completed") {
    updatedItem.completedAt = now;
  }

  // Clear completedAt when moving away from "completed"
  if (newStatus !== "completed" && oldStatus === "completed") {
    updatedItem.completedAt = undefined;
  }

  // Create audit log entry for Redux
  const logEntry: WorkLogEntry = {
    id: uid(),
    workItemId: item.id,
    action: "status_changed",
    at: now,
    message: `Status: ${oldStatus} → ${newStatus}`,
  };

  // Persist log entry to DB (if available)
  persistAuditLog(item.id, "status_changed", {
    from: oldStatus,
    to: newStatus,
    actor: actor || "unknown",
  }).catch((err: unknown) => {
    console.warn("[transitionStatus] Failed to persist log entry:", err);
  });

  return { updatedItem, logEntry };
}
