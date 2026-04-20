/**
 * useSignsDue — Reactive hook for signs overdue for inspection.
 *
 * Queries signs by DueMode (overdue_default, overdue_1y, etc.) using
 * listSignsDueByMode in workOrdersRepo.ts. Re-queries on DbEvents
 * changes. Accepts optional orgId for multi-org isolation.
 *
 * Used by SignsDueScreen for the filterable due/overdue sign list.
 */
import { useEffect, useMemo, useState } from "react";
import { listSignsDueByMode, SignWorkOrder, DueMode } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useSignsDue(mode: DueMode = "overdue_default", orgId?: string | null) {
  const [items, setItems] = useState<SignWorkOrder[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ mode, tick, orgId }), [mode, tick, orgId]);

  useEffect(() => {
    setItems(listSignsDueByMode(mode, 2000, orgId));
  }, [key, mode]);

  return items;
}
