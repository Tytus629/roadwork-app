import { useEffect, useMemo, useState } from "react";
import { assetsRepo } from "../repositories/assetsRepo";
import type { Asset } from "../types/Asset";
import { getDbTick, subscribeDbChanged } from "../state/DbEvents";

export function useAssetsNear(
  lat: number | null,
  lng: number | null,
  miles: number,
  orgId?: string | null,
) {
  const [items, setItems] = useState<Asset[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(
    () => JSON.stringify({ lat, lng, miles, tick, orgId }),
    [lat, lng, miles, tick, orgId],
  );

  useEffect(() => {
    let cancelled = false;

    if (typeof lat !== "number" || typeof lng !== "number" || !orgId) {
      setItems([]);
      return () => {
        cancelled = true;
      };
    }

    assetsRepo
      .listNearby({
        orgId,
        lat,
        lng,
        radiusMeters: miles * 1609.34,
      })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [key, lat, lng, miles, orgId]);

  return items;
}