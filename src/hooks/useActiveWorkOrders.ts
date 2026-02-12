import { useEffect, useMemo, useState } from "react";
import { listActiveWorkOrders, SortMode } from "../db/workOrdersRepo";
import type { WorkOrderFilter, WorkOrderRow } from "../db/types";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useActiveWorkOrders(filter: WorkOrderFilter, sort: SortMode) {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const key = useMemo(() => JSON.stringify({ filter, sort, dbTick }), [filter, sort, dbTick]);

  useEffect(() => {
    const rows = listActiveWorkOrders(filter, sort, 1000);
    setItems(rows);
  }, [key]);

  return items;
}
