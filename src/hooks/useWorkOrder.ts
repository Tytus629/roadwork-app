/**
 * useWorkOrder.ts
 * 
 * PURPOSE:
 * React hook to fetch a single work order by ID with automatic reactivity.
 * Subscribes to DbEvents and re-fetches when database changes.
 * 
 * WHY USE THIS:
 * - Prevents stale data: Always fetches fresh from SQLite
 * - Auto-updates: When any component changes the work order, this hook re-runs
 * - Clean separation: UI components don't need to know about DbEvents
 * 
 * USAGE EXAMPLE:
 * ```tsx
 * const wo = useWorkOrder(workItemId);
 * if (!wo) return <Text>Loading...</Text>;
 * return <Text>{wo.status} - {wo.priority}</Text>;
 * ```
 * 
 * RE-FETCH TRIGGERS:
 * 1. id prop changes (user selects different work order)
 * 2. DbEvents emitted (any database write anywhere in app)
 * 
 * REACTIVITY PATTERN:
 * - subscribeDbChanged() returns unsubscribe function
 * - useEffect cleanup calls unsubscribe when component unmounts
 * - dbTick state increments on every DB change
 * - useMemo key includes dbTick → triggers re-fetch effect
 * - This pattern ensures UI always shows latest data
 */

import { useEffect, useMemo, useState } from "react";
import { getWorkOrderById } from "../db/workOrdersRepo";
import type { WorkOrderRow } from "../db/types";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

/**
 * Hook to fetch a single work order by ID with reactivity.
 * Returns null if id is null or work order not found.
 * Automatically refetches when the database changes.
 */
export function useWorkOrder(id: string | null): WorkOrderRow | null {
  const [item, setItem] = useState<WorkOrderRow | null>(null);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const key = useMemo(() => JSON.stringify({ id, dbTick }), [id, dbTick]);

  useEffect(() => {
    if (!id) {
      setItem(null);
      return;
    }
    const row = getWorkOrderById(id);
    setItem(row);
  }, [key]);

  return item;
}
