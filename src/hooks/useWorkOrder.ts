import { useEffect, useMemo, useState } from "react";
import { getWorkOrderById } from "../db/workOrdersRepo";
import type { WorkOrderRow } from "../db/types";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

/**
 * Hook to fetch a single work order by ID with reactivity.
 * Automatically refetches when the DB changes.
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
