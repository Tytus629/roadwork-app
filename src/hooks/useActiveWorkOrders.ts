/**
 * useActiveWorkOrders — Reactive hook for querying active work orders.
 *
 * Subscribes to DbEvents so it automatically re-queries when data changes
 * (e.g., after sync or local creation). Accepts optional orgId to scope
 * results to the current organization — see workOrdersRepo.ts header
 * for why org isolation is required.
 *
 * The memoized key includes { filter, sort, dbTick, orgId } so the query
 * re-runs whenever any of those change.
 */
import { useEffect, useMemo, useState } from "react";
import { listActiveWorkOrders, SortMode } from "../db/workOrdersRepo";
import type { WorkOrderFilter, WorkOrderRow } from "../db/types";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useActiveWorkOrders(filter: WorkOrderFilter, sort: SortMode, orgId?: string | null) {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const key = useMemo(() => JSON.stringify({ filter, sort, dbTick, orgId }), [filter, sort, dbTick, orgId]);

  useEffect(() => {
    const rows = listActiveWorkOrders(filter, sort, 1000, orgId);
    setItems(rows);
  }, [key]);

  return items;
}
