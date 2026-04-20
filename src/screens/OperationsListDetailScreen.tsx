import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useIsFocused } from "@react-navigation/native";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useOrg } from "../state/OrgContext";
import { normalizeRole } from "../permissions/rolePermissions";
import { operationsListsService } from "../services/operationsListsService";
import type {
  OperationsItemStatus,
  OperationsList,
  OperationsListItem,
  OperationsListProgress,
} from "../types/OperationsList";
import { formatPersonDisplayName } from "../utils/userIdentity";

const LIVE_REFRESH_MS = 5000;

function toStatusLabel(status: OperationsItemStatus): string {
  if (status === "todo" || status === "not_started") return "To Do";
  if (status === "in_progress") return "In Progress";
  if (status === "done") return "Done";
  if (status === "skipped") return "Skipped";
  if (status === "blocked") return "Blocked";
  return status;
}

function toStatusColor(status: OperationsItemStatus): { bg: string; text: string } {
  if (status === "done") return { bg: "#dcfce7", text: "#166534" };
  if (status === "in_progress") return { bg: "#dbeafe", text: "#1d4ed8" };
  if (status === "blocked") return { bg: "#fee2e2", text: "#b91c1c" };
  if (status === "skipped") return { bg: "#f1f5f9", text: "#334155" };
  return { bg: "#fef3c7", text: "#92400e" };
}

function formatDt(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "—";
  return new Date(ts).toLocaleString();
}

function computeProgress(items: OperationsListItem[], list: OperationsList | null): OperationsListProgress {
  if (list?.progress && Number.isFinite(list.progress.total)) {
    const p = list.progress;
    return {
      total: Number(p.total),
      done: Number(p.done),
      inProgress: Number(p.inProgress),
      remaining:
        p.remaining != null && Number.isFinite(p.remaining)
          ? Number(p.remaining)
          : Math.max(0, Number(p.total) - Number(p.done) - Number(p.inProgress)),
    };
  }

  const total = items.length;
  const done = items.filter((x) => x.status === "done").length;
  const inProgress = items.filter((x) => x.status === "in_progress").length;
  const remaining = Math.max(0, total - done - inProgress);
  return { total, done, inProgress, remaining };
}

export default function OperationsListDetailScreen({ navigation, route }: any) {
  const isFocused = useIsFocused();
  const listId = String(route?.params?.listId ?? "");
  const { orgId, role } = useOrg();
  const normalizedRole = normalizeRole(role);
  const canUpdateStatus = normalizedRole !== "viewer";
  const canAddItems = normalizedRole !== "viewer";
  const canManageList =
    normalizedRole === "platform_owner" ||
    normalizedRole === "org_owner" ||
    normalizedRole === "org_admin" ||
    normalizedRole === "asset_manager";

  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savingStatusId, setSavingStatusId] = useState<string | null>(null);
  const [list, setList] = useState<OperationsList | null>(null);
  const [items, setItems] = useState<OperationsListItem[]>([]);

  const load = useCallback(async (opts?: { isRefresh?: boolean; silent?: boolean }) => {
    if (!orgId || !listId) return;
    const isRefresh = !!opts?.isRefresh;
    const silent = !!opts?.silent;

    if (!silent) {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
    }

    try {
      setError(null);
      const data = await operationsListsService.getListDetail({ orgId, listId });
      setList(data.list);
      setItems(data.items ?? []);
      if (data.list?.title) navigation.setOptions({ title: data.list.title });
    } catch (e: any) {
      setError(e?.message ?? "Could not load this operations list.");
    } finally {
      if (!silent) {
        if (isRefresh) setRefreshing(false);
        else setLoading(false);
      }
    }
  }, [listId, navigation, orgId]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => load());
    load();
    return unsub;
  }, [load, navigation]);

  useEffect(() => {
    if (!isFocused || !orgId || !listId) return;

    const interval = setInterval(() => {
      if (savingStatusId) return;
      load({ silent: true });
    }, LIVE_REFRESH_MS);

    return () => clearInterval(interval);
  }, [isFocused, listId, load, orgId, savingStatusId]);

  const progress = useMemo(() => computeProgress(items, list), [items, list]);

  const setStatus = useCallback(async (itemId: string, status: OperationsItemStatus) => {
    if (!orgId || !listId || !canUpdateStatus) return;

    setSavingStatusId(itemId);
    try {
      await operationsListsService.setItemStatus({ orgId, listId, itemId, status });
      await load({ isRefresh: true });
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Could not update item status.");
    } finally {
      setSavingStatusId(null);
    }
  }, [canUpdateStatus, listId, load, orgId]);

  const toggleArchive = useCallback(async () => {
    if (!orgId || !listId || !list || !canManageList) return;

    const nextStatus = list.active !== false && !list.archivedAt ? "archived" : "active";
    try {
      await operationsListsService.setListActive({ orgId, listId, status: nextStatus });
      await load({ isRefresh: true });
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Could not update list state.");
    }
  }, [canManageList, list, listId, load, orgId]);

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="small" color="#111827" />
        <Text style={styles.centerText}>Loading list…</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Could not load list</Text>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
          <Text style={styles.retryBtnText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const listIsActive = list ? list.active !== false && !list.archivedAt : true;

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerTitle}>{list?.title ?? "Operations List"}</Text>
        <Text style={styles.progressLine}>
          Total {progress.total} • Done {progress.done} • In Progress {progress.inProgress} • Remaining {progress.remaining}
        </Text>

        <View style={styles.headerActions}>
          {canAddItems ? (
            <TouchableOpacity
              onPress={() => navigation.navigate("OperationsListAddItem", { listId })}
              style={styles.addBtn}
            >
              <Text style={styles.addBtnText}>+ Add Item</Text>
            </TouchableOpacity>
          ) : null}

          {canManageList ? (
            <TouchableOpacity onPress={toggleArchive} style={styles.archiveBtn}>
              <Text style={styles.archiveBtnText}>{listIsActive ? "Archive" : "Activate"}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load({ isRefresh: true })} />}
        contentContainerStyle={items.length ? undefined : styles.emptyContainer}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyText}>No items in this list yet.</Text>
            <Text style={styles.emptyHint}>Add roads/segments so crews can quickly mark progress.</Text>
          </View>
        }
        renderItem={({ item }) => {
          const statusStyle = toStatusColor(item.status);
          return (
            <View style={styles.itemCard}>
              <View style={styles.itemTopRow}>
                <View style={styles.itemMain}>
                  <Text style={styles.roadName}>{item.roadName}</Text>
                  {item.segmentLabel ? <Text style={styles.segmentText}>{item.segmentLabel}</Text> : null}
                </View>
                <View style={[styles.statusBadge, { backgroundColor: statusStyle.bg }]}>
                  <Text style={[styles.statusText, { color: statusStyle.text }]}>{toStatusLabel(item.status)}</Text>
                </View>
              </View>

              <Text style={styles.metaText}>
                {item.priority ? `Priority: ${item.priority.toUpperCase()} • ` : ""}
                {item.assignedCrew ? `Crew: ${item.assignedCrew}` : "Crew: —"}
              </Text>
              <Text style={styles.metaText}>
                Updated by {formatPersonDisplayName(item as Record<string, unknown> | null | undefined, {
                  nameKeys: ["updatedByName"],
                  displayNameKeys: ["updatedByDisplayName"],
                  emailKeys: ["updatedByEmail"],
                  uidKeys: ["updatedByUid"],
                  unknownLabel: "—",
                })} at {formatDt(item.updatedAt)}
              </Text>
              {item.doneAt ? (
                <Text style={styles.metaText}>
                  Done by {formatPersonDisplayName(item as Record<string, unknown> | null | undefined, {
                    nameKeys: ["doneByName", "completedByName"],
                    displayNameKeys: ["doneByDisplayName", "completedByDisplayName"],
                    emailKeys: ["doneByEmail", "completedByEmail"],
                    uidKeys: ["doneByUid", "completedByUid"],
                    unknownLabel: "—",
                  })} at {formatDt(item.doneAt)}
                </Text>
              ) : null}

              <View style={styles.quickActionsRow}>
                <TouchableOpacity
                  disabled={!canUpdateStatus || savingStatusId === item.id}
                  onPress={() => setStatus(item.id, "not_started")}
                  style={[styles.quickBtn, !canUpdateStatus && styles.quickBtnDisabled]}
                >
                  <Text style={styles.quickBtnText}>Start</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!canUpdateStatus || savingStatusId === item.id}
                  onPress={() => setStatus(item.id, "in_progress")}
                  style={[styles.quickBtn, !canUpdateStatus && styles.quickBtnDisabled]}
                >
                  <Text style={styles.quickBtnText}>In Progress</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!canUpdateStatus || savingStatusId === item.id}
                  onPress={() => setStatus(item.id, "done")}
                  style={[styles.quickBtn, !canUpdateStatus && styles.quickBtnDisabled]}
                >
                  <Text style={styles.quickBtnText}>Done</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  disabled={!canUpdateStatus || savingStatusId === item.id}
                  onPress={() => setStatus(item.id, "skipped")}
                  style={[styles.quickBtn, !canUpdateStatus && styles.quickBtnDisabled]}
                >
                  <Text style={styles.quickBtnText}>Skip</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  headerCard: {
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 10,
  },
  headerTitle: { fontSize: 18, fontWeight: "800", color: "#111827" },
  progressLine: { marginTop: 6, color: "#334155", fontSize: 12 },
  headerActions: { marginTop: 10, flexDirection: "row", gap: 8 },
  addBtn: {
    borderRadius: 8,
    backgroundColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  addBtnText: { color: "#fff", fontWeight: "700", fontSize: 12 },
  archiveBtn: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  archiveBtnText: { color: "#111827", fontWeight: "700", fontSize: 12 },
  itemCard: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  itemTopRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  itemMain: { flex: 1 },
  roadName: { fontSize: 15, fontWeight: "800", color: "#111827" },
  segmentText: { marginTop: 2, color: "#64748b", fontSize: 12 },
  statusBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 8, marginLeft: 8 },
  statusText: { fontSize: 11, fontWeight: "800" },
  metaText: { marginTop: 6, color: "#64748b", fontSize: 12 },
  quickActionsRow: { marginTop: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  quickBtn: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 8,
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  quickBtnDisabled: { opacity: 0.45 },
  quickBtnText: { fontSize: 12, fontWeight: "700", color: "#0f172a" },
  center: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  centerText: { marginTop: 8, color: "#64748b" },
  errorTitle: { fontSize: 16, fontWeight: "700", color: "#b91c1c" },
  errorText: { color: "#64748b", marginTop: 8, textAlign: "center" },
  retryBtn: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#111827",
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  retryBtnText: { color: "#111827", fontWeight: "700" },
  emptyContainer: { flexGrow: 1, justifyContent: "center" },
  emptyBox: { alignItems: "center", paddingHorizontal: 24 },
  emptyText: { fontSize: 16, color: "#64748b", fontWeight: "700" },
  emptyHint: { marginTop: 8, fontSize: 13, color: "#94a3b8", textAlign: "center" },
});
