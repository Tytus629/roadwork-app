import { useEffect, useState } from "react";
import type { Asset } from "../types/Asset";
import type { WorkOrder } from "../types/WorkOrder";
import type { ActivityProjection } from "../utils/activityProjection";
import { projectActivities } from "../utils/activityProjection";
import { listLogEntries } from "../services/logService";
import { assetEventsRepo } from "../repositories/assetEventsRepo";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { assetsRepo } from "../repositories/assetsRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

export type CrewActivityItem = {
  activity: ActivityProjection;
  workOrder: WorkOrder | null;
  asset: Asset | null;
};

type CrewActivityState = {
  items: CrewActivityItem[];
  loading: boolean;
  error: string | null;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function useCrewActivity(limit = 120, orgId?: string | null): CrewActivityState {
  const [dbTick, setDbTick] = useState(0);
  const [state, setState] = useState<CrewActivityState>({
    items: [],
    loading: true,
    error: null,
  });

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId) {
        if (!cancelled) {
          setState({ items: [], loading: false, error: null });
        }
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const [assetEvents, logEntries] = await Promise.all([
          assetEventsRepo.listRecentForOrg({ orgId, limit }),
          Promise.resolve(listLogEntries(limit, orgId)),
        ]);

        const projected = projectActivities({ assetEvents, logEntries }).slice(0, limit);
        const workOrderIds = uniqueIds(
          projected.filter((activity) => activity.targetType === "work_order").map((activity) => activity.targetId),
        );
        const assetIds = uniqueIds(
          projected.filter((activity) => activity.targetType === "asset").map((activity) => activity.targetId),
        );

        const [workOrders, assets] = await Promise.all([
          Promise.all(
            workOrderIds.map(async (id) => [id, await workOrdersRepo.getById({ orgId, id })] as const),
          ),
          Promise.all(
            assetIds.map(async (id) => [id, await assetsRepo.getById({ orgId, id })] as const),
          ),
        ]);

        const workOrderMap = new Map<string, WorkOrder | null>(workOrders);
        const assetMap = new Map<string, Asset | null>(assets);
        const items: CrewActivityItem[] = projected.map((activity) => ({
          activity,
          workOrder:
            activity.targetType === "work_order"
              ? workOrderMap.get(String(activity.targetId ?? "").trim()) ?? null
              : null,
          asset:
            activity.targetType === "asset"
              ? assetMap.get(String(activity.targetId ?? "").trim()) ?? null
              : null,
        }));

        if (!cancelled) {
          setState({ items, loading: false, error: null });
        }
      } catch (error: any) {
        if (!cancelled) {
          setState({
            items: [],
            loading: false,
            error: error?.message ?? "Could not load crew activity.",
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dbTick, limit, orgId]);

  return state;
}