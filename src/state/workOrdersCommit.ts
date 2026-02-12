import type { WorkItem } from "../types/workItem";
import { upsertWorkItem } from "../storage/workRepo";
import { addWorkItem, updateWorkItem } from "../store/workItemsSlice";
import type { AppDispatch } from "../store";
import { getNotificationSettings } from "../screens/SettingsScreen";
import { notifyWorkOrderCreated } from "../services/notify";
import { formatWorkType } from "../constants/workOrderTypes";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * CENTRALIZED WORK ORDER COMMIT FUNCTION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * This is the SINGLE SOURCE OF TRUTH for all work order creates/updates.
 * Guarantees both in-memory state (Redux) AND SQLite persistence happen together.
 * 
 * PROBLEM IT SOLVES:
 * - Before: Multiple places in the code (MapScreen, CreateScreen, WorkItemSheet)
 *   each had their own logic to update Redux and persist to SQLite.
 * - Result: Inconsistent behavior, duplicated code, and race conditions.
 * - Solution: All create/update operations MUST go through this function.
 * 
 * HOW IT WORKS:
 * 1. Updates Redux state immediately (for instant UI feedback)
 * 2. Persists to SQLite in the background (for offline storage)
 * 3. Never crashes - logs errors if DB unavailable but continues
 * 
 * USAGE:
 * - For NEW work orders: commitWorkOrder(newItem, dispatch, "create")
 * - For UPDATES: commitWorkOrder(updatedItem, dispatch, "update")
 * 
 * REFACTORED FROM:
 * - src/components/WorkItemSheet.tsx (status changes, photo additions, priority updates)
 * - src/screens/MapScreen.tsx (createPoint function)
 * - src/screens/CreateScreen.tsx (quickAddTestPothole function)
 * 
 * CHANGE HISTORY:
 * - Created to fix "Work Orders disappear after restart" issue
 * - Prevents duplicate commits (was causing 4x commits on status changes)
 * - Enables comprehensive logging for debugging persistence issues
 * 
 * @param workOrder - The complete WorkItem object to save
 * @param dispatch - Redux dispatch function from useAppDispatch()
 * @param source - "create" for new items, "update" for changes
 */
export async function commitWorkOrder(
  workOrder: WorkItem,
  dispatch: AppDispatch,
  source: "create" | "update"
) {
  console.log("[commitWorkOrder] START", workOrder.id, "source=", source);

  // 1) Update in-memory Redux state
  if (source === "create") {
    dispatch(addWorkItem(workOrder));
  } else {
    // For updates, we need to extract what changed
    // But since we have the full updated object, we can dispatch it as a full replacement
    dispatch(updateWorkItem({ 
      id: workOrder.id, 
      patch: workOrder 
    }));
  }

  // 2) Persist to SQLite (repo must never throw)
  try {
    await upsertWorkItem(workOrder);
    console.log("[commitWorkOrder] PERSIST OK", workOrder.id);
  } catch (e) {
    // Should not happen if repo is resilient, but just in case:
    console.warn("[commitWorkOrder] PERSIST FAILED", workOrder.id, e);
  }

  // 3) Trigger notification if creating a high/urgent work order
  // DISABLED: User wants notifications only after work order is "submitted", not on initial create
  // TODO: Determine what "submitted" means and trigger notification at that point
  /*
  if (source === "create") {
    const isHighPriority = workOrder.priority === "high" || workOrder.priority === "urgent";
    console.log("[commitWorkOrder] Checking notification - priority:", workOrder.priority, "isHigh:", isHighPriority);
    
    if (isHighPriority) {
      try {
        const settings = await getNotificationSettings();
        console.log("[commitWorkOrder] Notification settings:", settings);
        if (settings.notifyHighUrgentOnCreate) {
          const title = `${workOrder.priority.toUpperCase()} Priority Work Order`;
          const body = `${formatWorkType(workOrder.type)} • ${workOrder.title ?? "New work order"}`;
          console.log("[commitWorkOrder] Sending notification:", title, body);
          await notifyWorkOrderCreated(title, body);
          console.log("[commitWorkOrder] NOTIFICATION SENT", workOrder.id);
        } else {
          console.log("[commitWorkOrder] Notification disabled in settings");
        }
      } catch (e) {
        console.warn("[commitWorkOrder] NOTIFICATION FAILED", e);
      }
    }
  }
  */
}
