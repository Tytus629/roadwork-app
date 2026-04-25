import { useCallback, useEffect, useState } from "react";
import { assetsRepo } from "../repositories/assetsRepo";
import { notificationsRepo } from "../repositories/notificationsRepo";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import type { Asset } from "../types/Asset";
import type { NotificationInboxRow } from "../types/NotificationInbox";
import type { WorkOrder } from "../types/WorkOrder";
import { reconcileNotificationsForCurrentUser } from "../services/notificationsService";

export type NotificationItem = {
  notification: NotificationInboxRow;
  workOrder: WorkOrder | null;
  asset: Asset | null;
};

type UseNotificationsState = {
  items: NotificationItem[];
  loading: boolean;
  error: string | null;
  unreadCount: number;
};

function uniqueIds(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.map((value) => String(value ?? "").trim()).filter(Boolean))];
}

export function useNotifications(limit = 120, orgId?: string | null) {
  const [dbTick, setDbTick] = useState(0);
  const [refreshTick, setRefreshTick] = useState(0);
  const [state, setState] = useState<UseNotificationsState>({
    items: [],
    loading: true,
    error: null,
    unreadCount: 0,
  });

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  const reload = useCallback(() => setRefreshTick((value) => value + 1), []);

  const markRead = useCallback(async (id: string) => {
    await notificationsRepo.markRead({ ids: [id] });
    reload();
  }, [reload]);

  const markOpened = useCallback(async (id: string) => {
    await notificationsRepo.markOpened({ id });
    reload();
  }, [reload]);

  const markAllRead = useCallback(async () => {
    if (!orgId) return;
    const result = await reconcileNotificationsForCurrentUser({ orgId, limit });
    if (!result.recipient) return;
    await notificationsRepo.markAllReadForRecipient({
      orgId,
      recipientUid: result.recipient.uid,
      recipientEmail: result.recipient.email,
    });
    reload();
  }, [limit, orgId, reload]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      if (!orgId) {
        if (!cancelled) {
          setState({ items: [], loading: false, error: null, unreadCount: 0 });
        }
        return;
      }

      setState((prev) => ({ ...prev, loading: true, error: null }));

      try {
        const result = await reconcileNotificationsForCurrentUser({ orgId, limit });
        if (!result.recipient) {
          if (!cancelled) {
            setState({ items: [], loading: false, error: null, unreadCount: 0 });
          }
          return;
        }

        const notifications = await notificationsRepo.listForRecipient({
          orgId,
          recipientUid: result.recipient.uid,
          recipientEmail: result.recipient.email,
          limit,
        });

        const workOrderIds = uniqueIds(
          notifications
            .filter((item) => item.targetType === "work_order")
            .map((item) => item.targetId),
        );
        const assetIds = uniqueIds(
          notifications
            .filter((item) => item.targetType === "asset")
            .map((item) => item.targetId),
        );

        const workOrderMap = new Map<string, WorkOrder | null>(
          await Promise.all(
            workOrderIds.map(async (id) => [id, await workOrdersRepo.getById({ orgId, id })] as const),
          ),
        );
        const assetMap = new Map<string, Asset | null>(
          await Promise.all(
            assetIds.map(async (id) => [id, await assetsRepo.getById({ orgId, id })] as const),
          ),
        );

        const items: NotificationItem[] = notifications.map((notification) => ({
          notification,
          workOrder:
            notification.targetType === "work_order"
              ? workOrderMap.get(String(notification.targetId ?? "").trim()) ?? null
              : null,
          asset:
            notification.targetType === "asset"
              ? assetMap.get(String(notification.targetId ?? "").trim()) ?? null
              : null,
        }));

        if (!cancelled) {
          setState({
            items,
            loading: false,
            error: null,
            unreadCount: result.unreadCount,
          });
        }
      } catch (error: any) {
        if (!cancelled) {
          setState({
            items: [],
            loading: false,
            error: error?.message ?? "Could not load notifications.",
            unreadCount: 0,
          });
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [dbTick, limit, orgId, refreshTick]);

  return {
    ...state,
    markAllRead,
    markOpened,
    markRead,
    reload,
  };
}
