import { useEffect, useMemo, useState } from "react";
import { listSignsNear, SignWorkOrder } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export function useSignsNear(lat: number | null, lng: number | null, miles: number) {
  const [items, setItems] = useState<SignWorkOrder[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ lat, lng, miles, tick }), [lat, lng, miles, tick]);

  useEffect(() => {
    if (typeof lat !== "number" || typeof lng !== "number") {
      setItems([]);
      return;
    }
    setItems(listSignsNear({ lat, lng, miles }, 2000));
  }, [key]);

  return items;
}
