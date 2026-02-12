import { useEffect, useMemo, useState } from "react";
import { listWorkOrdersInBBox } from "../db/workOrdersRepo";
import { BBox, WorkOrderFilter, WorkOrderRow } from "../db/types";
import { padBBox } from "../db/geom";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useMapWorkOrders(bbox: BBox | null, filter: WorkOrderFilter) {
  const [items, setItems] = useState<WorkOrderRow[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const key = useMemo(() => {
    if (!bbox) return "no-bbox";
    return JSON.stringify({ bbox, filter, dbTick });
  }, [bbox, filter, dbTick]);

  useEffect(() => {
    if (!bbox) return;
    const padded = padBBox(bbox, 0.002);
    const rows = listWorkOrdersInBBox(padded, filter, 2500);
    setItems(rows);
  }, [key]);

  return items;
}
