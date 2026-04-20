import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
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
import type { OperationsList, OperationsListProgress } from "../types/OperationsList";

function toProgramLabel(raw: string | null | undefined): string {
  const key = String(raw ?? "").trim().toLowerCase();
  if (key === "crack_seal") return "Crack Seal";
  if (key === "snow_plow") return "Snow Plow";
  if (key === "shoulder_sweeping") return "Shoulder Sweeping";
  return key ? key.replace(/[_\s]+/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()) : "Program";
}

function formatUpdated(ts: number | null | undefined): string {
  if (!ts || !Number.isFinite(ts)) return "Unknown";
  return new Date(ts).toLocaleString();
}

function resolveProgress(list: OperationsList): OperationsListProgress {
  const p = list.progress;
  if (p && Number.isFinite(p.total) && Number.isFinite(p.done) && Number.isFinite(p.inProgress)) {
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

  const counts = list.itemCounts ?? null;
  if (counts) {
    const total = Number(counts.total ?? 0);
    const done = Number(counts.done ?? 0);
    const inProgress = Number(counts.inProgress ?? counts.in_progress ?? 0);
    return {
      total: Number.isFinite(total) ? total : 0,
      done: Number.isFinite(done) ? done : 0,
      inProgress: Number.isFinite(inProgress) ? inProgress : 0,
      remaining: Math.max(0, total - done - inProgress),
    };
  }

  return { total: 0, done: 0, inProgress: 0, remaining: 0 };
}

export default function OperationsListsScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const normalizedRole = normalizeRole(role);
  const canManageLists =
    normalizedRole === "platform_owner" ||
    normalizedRole === "org_owner" ||
    normalizedRole === "org_admin" ||
    normalizedRole === "asset_manager";

  const [activeOnly, setActiveOnly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lists, setLists] = useState<OperationsList[]>([]);

  const load = useCallback(async (isRefresh?: boolean) => {
    if (!orgId) return;
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      setError(null);
      const rows = await operationsListsService.listLists({
        orgId,
        status: activeOnly ? "active" : "archived",
      });
      setLists(rows);
    } catch (e: any) {
      setError(e?.message ?? "Could not load operations lists.");
    } finally {
      if (isRefresh) setRefreshing(false);
      else setLoading(false);
    }
  }, [activeOnly, orgId]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", () => load());
    load();
    return unsub;
  }, [load, navigation]);

  const emptyText = useMemo(() => {
    if (activeOnly) return "No active operations lists yet.";
    return "No archived operations lists found.";
  }, [activeOnly]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Operations Lists</Text>
          <Text style={styles.subtitle}>Shared road/program lists across crews.</Text>
        </View>
        {canManageLists ? (
          <TouchableOpacity
            onPress={() => navigation.navigate("OperationsListCreate")}
            style={styles.newBtn}
          >
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        <TouchableOpacity
          onPress={() => setActiveOnly(true)}
          style={[styles.filterChip, activeOnly && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, activeOnly && styles.filterChipTextActive]}>Active</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => setActiveOnly(false)}
          style={[styles.filterChip, !activeOnly && styles.filterChipActive]}
        >
          <Text style={[styles.filterChipText, !activeOnly && styles.filterChipTextActive]}>Archived</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.centerText}>Loading operations lists…</Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Could not load lists</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={styles.retryBtn}>
            <Text style={styles.retryBtnText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={lists}
          keyExtractor={(x) => x.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} />}
          contentContainerStyle={lists.length ? undefined : styles.emptyContainer}
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <Text style={styles.emptyText}>{emptyText}</Text>
              <Text style={styles.emptyHint}>Create a list to coordinate work and avoid duplicate routes.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const progress = resolveProgress(item);
            const isActive = item.active !== false && !item.archivedAt;
            return (
              <TouchableOpacity
                onPress={() => navigation.navigate("OperationsListDetail", { listId: item.id })}
                style={styles.card}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  {!isActive ? <Text style={styles.archiveBadge}>ARCHIVED</Text> : null}
                </View>

                <Text style={styles.cardMeta}>
                  {toProgramLabel(item.programType)}
                  {item.seasonYear ? ` • ${item.seasonYear}` : ""}
                </Text>

                <Text style={styles.progressText}>
                  Total {progress.total} • Done {progress.done} • In Progress {progress.inProgress} • Remaining {progress.remaining}
                </Text>

                <Text style={styles.updatedText}>Updated {formatUpdated(item.updatedAt)}</Text>
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 20, fontWeight: "800", color: "#111827" },
  subtitle: { marginTop: 4, color: "#64748b", fontSize: 13 },
  newBtn: {
    backgroundColor: "#111827",
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  newBtnText: { color: "white", fontWeight: "700" },
  filterRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 10 },
  filterChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#fff",
  },
  filterChipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  filterChipText: { fontWeight: "700", color: "#334155", fontSize: 12 },
  filterChipTextActive: { color: "#fff" },
  card: {
    marginHorizontal: 12,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  cardTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  cardTitle: { fontWeight: "800", fontSize: 16, color: "#111827", flex: 1, paddingRight: 8 },
  archiveBadge: {
    backgroundColor: "#f1f5f9",
    color: "#334155",
    fontSize: 10,
    fontWeight: "800",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
    overflow: "hidden",
  },
  cardMeta: { marginTop: 6, color: "#475569", fontSize: 13, fontWeight: "600" },
  progressText: { marginTop: 8, color: "#0f172a", fontSize: 12 },
  updatedText: { marginTop: 8, color: "#94a3b8", fontSize: 11 },
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
