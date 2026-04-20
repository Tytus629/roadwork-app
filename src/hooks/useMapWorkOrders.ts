/**
 * ========================================
 * useMapWorkOrders.ts
 * ========================================
 * 
 * PURPOSE:
 * - React hook that fetches work orders within a map's bounding box
 * - Optimized for map views: only fetches visible work orders (+ small padding)
 * - Automatically re-fetches when map moves, filter changes, or DB updates
 * 
 * MAP-SPECIFIC OPTIMIZATIONS:
 * - Spatial query: Only fetches work orders within visible map bounds
 * - Padding: Adds 0.002° padding (≈200m) for smoother panning
 * - Max 2500 results: Prevents performance issues with dense work order areas
 * - Fast queries: Uses SQLite spatial indices for efficient bbox filtering
 * 
 * REACTIVITY PATTERN:
 * 1. Subscribe to DbEvents on mount (listens for create/update/delete)
 * 2. When DB changes, increment dbTick counter
 * 3. When bbox, filter, or dbTick changes, memoized key updates
 * 4. Key change triggers useEffect that re-queries DB with new bbox
 * 5. New pins flow to MapScreen, triggering marker re-render
 * 
 * WHY BBOX FILTERING?
 * - Performance: Loading all work orders would be slow with thousands of items
 * - UX: Users only see pins in their current map view
 * - Network: If syncing to backend, only need to fetch visible area
 * - Memory: Fewer markers = less memory usage
 * 
 * PARAMETERS:
 * - bbox: BBox | null (lat/lng bounds of visible map area, null = no results)
 * - filter: WorkOrderFilter (types, priority, status - applied after bbox)
 * 
 * QUERY BEHAVIOR:
 * - null bbox = no results (prevents loading all data on initial render)
 * - Padded bbox = smoother UX (work orders slightly outside view are pre-loaded)
 * - Filter applied: bbox narrows spatial area, filter narrows by type/status/priority
 * - Max 2500: Safety limit (typical map view shows 10-200 pins)
 * 
 * INTEGRATION POINTS:
 * - listWorkOrdersInBBox: Direct DB query function (in workOrdersRepo)
 * - padBBox: Adds padding to bbox (in geom.ts)
 * - DbEvents: Global event system for database change notifications
 * - MapScreen: Primary consumer (renders map markers for returned work orders)
 * 
 * PERFORMANCE:
 * - useMemo: Prevents re-computing key on every render
 * - JSON.stringify key: Simple but effective change detection
 * - Spatial indices: Fast bbox queries even with 10k+ work orders
 * - Padding: Reduces re-queries when user pans slightly
 * 
 * ALTERNATIVE APPROACH:
 * - For list views, use useWorkOrdersFiltered (no bbox, just filter + sort)
 * - For single work order, use useWorkOrder (fetches by ID)
 */

import { useEffect, useMemo, useState } from "react";
import { listWorkOrdersInBBox } from "../db/workOrdersRepo";
import { BBox, WorkOrderFilter, WorkOrderRow } from "../db/types";
import { padBBox } from "../db/geom";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

/**
 * Hook that returns work orders within a bounding box, auto-refreshing on DB changes.
 * @param bbox - Map bounds (or null if map not ready)
 * @param filter - Additional filter criteria (types, priority, status)
 * @returns Array of work orders in bbox, max 2500
 */
export function useMapWorkOrders(bbox: BBox | null, filter: WorkOrderFilter, orgId?: string | null) {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const key = useMemo(() => {
    if (!bbox) return "no-bbox";
    return JSON.stringify({ bbox, filter, dbTick, orgId });
  }, [bbox, filter, dbTick, orgId]);

  useEffect(() => {
    if (!bbox) return;
    const padded = padBBox(bbox, 0.002);
    const rows = listWorkOrdersInBBox(padded, filter, 2500, orgId);
    setItems(rows);
  }, [key]);

  return items;
}
