import { useEffect, useMemo, useState } from "react";
import { assetsRepo, type AssetInspectionDueMode } from "../repositories/assetsRepo";
import type { Asset } from "../types/Asset";
import { getDbTick, subscribeDbChanged } from "../state/DbEvents";

export function useAssetsDue(
  mode: AssetInspectionDueMode = "overdue_default",
  orgId?: string | null,
) {
  const [items, setItems] = useState<Asset[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => subscribeDbChanged(() => setTick(getDbTick())), []);

  const key = useMemo(() => JSON.stringify({ mode, tick, orgId }), [mode, tick, orgId]);

  useEffect(() => {
    let cancelled = false;

    if (!orgId) {
      setItems([]);
      return () => {
        cancelled = true;
      };
    }

    assetsRepo
      .listInspectableDue({ orgId, mode })
      .then((rows) => {
        if (!cancelled) setItems(rows);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });

    return () => {
      cancelled = true;
    };
  }, [key, mode, orgId]);

  return items;
}