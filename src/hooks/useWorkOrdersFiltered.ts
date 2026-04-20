/**
 * ========================================
 * useWorkOrdersFiltered.ts
 * ========================================
 * 
 * PURPOSE:
 * - React hook that fetches filtered work orders from the database
 * - Automatically re-fetches when filter, sort, or database content changes
 * - Used by list-based screens (WorkOrdersScreen) for browsing work orders
 * 
 * REACTIVITY PATTERN:
 * 1. Subscribe to DbEvents on mount (listens for create/update/delete)
 * 2. When DB changes, increment internal tick counter
 * 3. Tick change triggers memoized key update
 * 4. Key change triggers useEffect that re-queries DB
 * 5. New data flows to component, triggering re-render
 * 
 * WHY THIS APPROACH?
 * - Simple: No complex state management, just useState + useEffect
 * - Efficient: Only re-fetches when filter, sort, or DB actually changes
 * - Predictable: Clear data flow (DB change → event → tick → query → render)
 * - Testable: Pure function (listWorkOrdersFiltered) isolated from hook
 * 
 * PARAMETERS:
 * - filter: WorkOrderFilter (types, priority, status, bounds)
 * - ageSort: "newest" | "oldest" (SQL ORDER BY createdAt DESC/ASC)
 * 
 * QUERY BEHAVIOR:
 * - Empty filter = all work orders
 * - Max 2000 results (prevents performance issues with huge datasets)
 * - Normalization: case-insensitive, whitespace-collapsed matching
 * - DB query uses indices for fast filtering
 * 
 * INTEGRATION POINTS:
 * - listWorkOrdersFiltered: Direct DB query function (in workOrdersRepo)
 * - DbEvents: Global event system for database change notifications
 * - WorkOrdersScreen: Primary consumer (list view with filter chips)
 * 
 * PERFORMANCE:
 * - useMemo: Prevents re-computing key on every render
 * - JSON.stringify key: Simple but effective change detection
 * - Limit 2000: Prevents unbounded result sets
 * - Indexed queries: Fast filtering even with thousands of work orders
 * 
 * ALTERNATIVE APPROACH:
 * - For map-based views, use useMapWorkOrders (bbox-filtered, padded)
 * - For single work order, use useWorkOrder (fetches by ID)
 */

import { useEffect, useMemo, useState } from "react";
import type { WorkOrderFilter, WorkOrderRow } from "../db/types";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import { AgeSort, listWorkOrdersFiltered } from "../db/workOrdersRepo";

/**
 * Hook that returns filtered work orders, auto-refreshing on DB changes.
 * @param filter - Filter criteria (types, priority, status)
 * @param ageSort - Sort order: "newest" or "oldest"
 * @returns Array of work orders matching filter, max 2000
 */
export function useWorkOrdersFiltered(filter: WorkOrderFilter, ageSort: AgeSort, orgId?: string | null) {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ filter, ageSort, tick, orgId }), [filter, ageSort, tick, orgId]);

  useEffect(() => {
    setItems(listWorkOrdersFiltered(filter, ageSort, 2000, orgId));
  }, [key]);

  return items;
}
