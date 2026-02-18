import { useEffect, useMemo, useState } from "react";
import { listSignsDueByMode, SignWorkOrder, DueMode } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useSignsDue(mode: DueMode = "overdue_default") {
  const [items, setItems] = useState<SignWorkOrder[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ mode, tick }), [mode, tick]);

  useEffect(() => {
    setItems(listSignsDueByMode(mode, 2000));
  }, [key, mode]);

  return items;
}
