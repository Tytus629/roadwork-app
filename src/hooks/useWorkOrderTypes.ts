import { useEffect, useState } from "react";
import { getDistinctWorkOrderTypes } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useWorkOrderTypes() {
  const [types, setTypes] = useState<string[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  useEffect(() => {
    setTypes(getDistinctWorkOrderTypes());
  }, [dbTick]);

  return types;
}
