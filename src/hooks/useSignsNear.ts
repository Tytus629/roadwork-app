/**
 * useSignsNear — Reactive hook for proximity-based sign queries.
 *
 * Returns signs within `miles` of the given lat/lng coordinate.
 * Re-queries on DbEvents changes and accepts optional orgId for
 * multi-org isolation (see workOrdersRepo.ts header).
 *
 * If lat/lng are null (GPS not available), returns empty array.
 * Used by SignsMapScreen for the "Near Me" sign list.
 */
import { useEffect, useMemo, useState } from "react";
import { listSignsNear, SignWorkOrder } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useSignsNear(lat: number | null, lng: number | null, miles: number, orgId?: string | null) {
  const [items, setItems] = useState<SignWorkOrder[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ lat, lng, miles, tick, orgId }), [lat, lng, miles, tick, orgId]);

  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") {
      setItems([]);
      return;
    }
    setItems(listSignsNear({ lat, lng, miles }, 2000, orgId));
  }, [key]);

  return items;
}
