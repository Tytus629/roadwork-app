/**
 * ========================================
 * WorkOrdersScreen.tsx
 * ========================================
 * 
 * PURPOSE:
 * - Provides a filterable, sortable list view of active work orders
 * - Allows users to browse active work orders by type, priority, status, and age
 * - Alternative view to the map screen for users who prefer list-based navigation
 * 
 * KEY FEATURES:
 * - Multi-criteria filtering (type, priority, status)
 * - Age-based sorting (newest/oldest first)
 * - Tappable cards navigate to WorkItemSheet for full details
 * - Real-time updates via useWorkOrdersFiltered hook (subscribed to DbEvents)
 * 
 * DATA FLOW:
 * 1. User selects filters via chip toggles
 * 2. Filter state stored locally (not global context - this screen owns its filters)
 * 3. useWorkOrdersFiltered hook queries DB with filters, subscribes to DbEvents
 * 4. When DB changes (create/update/delete), hook auto-refreshes list
 * 5. FlatList renders filtered work orders
 * 
 * FILTER MECHANICS:
 * - Empty filter = show all (no restrictions)
 * - Array filter = show only items matching any value in array (OR logic)
 * - Normalization: case-insensitive, whitespace-collapsed (consistent with repo layer)
 * - toggleOneOrAll: clicking chip adds/removes from array, empty array = show all
 * 
 * WHY LOCAL FILTER STATE?
 * - Each list view can have its own filters (e.g., MapScreen filters separately)
 * - Global FilterContext exists but this screen uses local state for independence
 * - User can open map and list screen with different filter criteria simultaneously
 * 
 * INTEGRATION POINTS:
 * - useWorkOrdersFiltered: Fetches filtered work orders from DB
 * - WorkItemSheet: Navigation target (opened when user taps a work order card)
 * - DbEvents: Auto-refreshes when work orders change elsewhere in app
 * - formatWorkType: Converts type strings to user-friendly display names
 * 
 * PERFORMANCE:
 * - FlatList: virtualizes long lists (only renders visible items)
 * - memoized filter arrays prevent unnecessary re-renders
 * - DB queries use indices for fast filtering
 */

import React, { useEffect, useMemo, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { WorkOrderFilter, WorkStatus, Priority } from "../db/types";
import { AgeSort } from "../db/workOrdersRepo";
import { useWorkOrdersFiltered } from "../hooks/useWorkOrdersFiltered";
import { formatWorkType, WORK_ORDER_TYPE_OPTIONS } from "../constants/workOrderTypes";
import { useOrg } from "../state/OrgContext";
import { formatWorkOrderCreator } from "../utils/workOrderCreator";
import { assignmentSummaryLabel } from "../utils/workOrderAssignment";

// Predefined work order types (matches DB schema and creation options)
const TYPES = WORK_ORDER_TYPE_OPTIONS
  .filter((x) => x.key !== "asphalt")
  .map((x) => x.label);

const PRIORITY: Priority[] = ["None", "Low", "Medium", "High", "Urgent"];
const ACTIVE_STATUS_FILTER: WorkStatus[] = ["Needs", "In Progress", "Deferred"];
const STATUS_OPTIONS: Array<{ value: WorkStatus; label: string }> = [
  { value: "Needs", label: "Needs Work" },
  { value: "In Progress", label: "In Progress" },
  { value: "Deferred", label: "Deferred" },
];

type AssetLinkMode = "all" | "linked" | "unlinked";

function formatStatusLabel(status: WorkStatus): string {
  if (status === "Needs") return "Needs Work";
  if (status === "Done") return "Completed";
  if (status === "Deferred") return "Deferred";
  return status;
}

function normKey(v: any): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={styles.chip}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? `OK ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

function toggleOneOrAll(cur: string[] | undefined, value: string) {
  const list = cur ?? [];
  const key = normKey(value);
  const has = list.some((x) => normKey(x) === key);
  const next = has ? list.filter((x) => normKey(x) !== key) : [...list, value];
  return next.length ? next : undefined;
}

export function WorkOrdersScreen() {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();

  const [filter, setFilter] = useState<WorkOrderFilter>({ status: [...ACTIVE_STATUS_FILTER] });
  const [ageSort, setAgeSort] = useState<AgeSort>("newest");
  const [assetLinkMode, setAssetLinkMode] = useState<AssetLinkMode>("all");

  const activeOnlyFilter = useMemo<WorkOrderFilter>(() => ({ status: [...ACTIVE_STATUS_FILTER] }), []);
  const activeItems = useWorkOrdersFiltered(activeOnlyFilter, ageSort, orgId);
  const dbFilteredItems = useWorkOrdersFiltered(filter, ageSort, orgId);

  const items = useMemo(() => {
    if (assetLinkMode === "all") return dbFilteredItems;
    return dbFilteredItems.filter((wo) => {
      const isLinked = Boolean(String(wo.assetId ?? "").trim());
      return assetLinkMode === "linked" ? isLinked : !isLinked;
    });
  }, [dbFilteredItems, assetLinkMode]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[ActiveWorkOrders][filters]", {
      fullActiveCount: activeItems.length,
      filters: {
        status: filter.status ?? ACTIVE_STATUS_FILTER,
        types: filter.types ?? [],
        priority: filter.priority ?? [],
        assetLinkMode,
        ageSort,
        orgId: orgId ?? null,
      },
      dbFilteredCount: dbFilteredItems.length,
      visibleCount: items.length,
    });
  }, [
    activeItems.length,
    filter.status,
    filter.types,
    filter.priority,
    assetLinkMode,
    ageSort,
    orgId,
    dbFilteredItems.length,
    items.length,
  ]);

  const typeSelected = useMemo(() => (filter.types ?? []).map(normKey), [filter.types]);
  const priSelected = useMemo(() => (filter.priority ?? []).map(normKey), [filter.priority]);
  const statusSelected = useMemo(() => (filter.status ?? []).map(normKey), [filter.status]);
  const allActiveStatusesSelected =
    ACTIVE_STATUS_FILTER.every((s) => statusSelected.includes(normKey(s))) &&
    (filter.status ?? []).length === ACTIVE_STATUS_FILTER.length;

  function clearAllFilters() {
    setFilter({ status: [...ACTIVE_STATUS_FILTER] });
    setAssetLinkMode("all");
  }

  const hasNonDefaultFilters =
    (filter.types?.length ?? 0) > 0 ||
    (filter.priority?.length ?? 0) > 0 ||
    assetLinkMode !== "all" ||
    !ACTIVE_STATUS_FILTER.every((s) => (filter.status ?? []).includes(s));

  const filterHeader = (
    <View style={styles.filters}>
      {/* TYPE */}
      <Text style={styles.sectionTitle}>Type</Text>
      <View style={styles.chipRow}>
        <Chip
          label="All"
          active={!filter.types || filter.types.length === 0}
          onPress={() => setFilter((f) => ({ ...f, types: undefined }))}
        />
        {TYPES.map((t) => (
          <Chip
            key={t}
            label={t}
            active={typeSelected.includes(normKey(t))}
            onPress={() => setFilter((f) => ({ ...f, types: toggleOneOrAll(f.types, t) }))}
          />
        ))}
      </View>

      {/* PRIORITY */}
      <Text style={styles.sectionTitle}>Urgency</Text>
      <View style={styles.chipRow}>
        <Chip
          label="All"
          active={!filter.priority || filter.priority.length === 0}
          onPress={() => setFilter((f) => ({ ...f, priority: undefined }))}
        />
        {PRIORITY.map((p) => (
          <Chip
            key={p}
            label={p}
            active={priSelected.includes(normKey(p))}
            onPress={() =>
              setFilter((f) => ({
                ...f,
                priority: toggleOneOrAll(f.priority as any, p) as any,
              }))
            }
          />
        ))}
      </View>

      {/* STATUS */}
      <Text style={styles.sectionTitle}>Status</Text>
      <View style={styles.chipRow}>
        <Chip
          label="All"
          active={allActiveStatusesSelected}
          onPress={() => setFilter((f) => ({ ...f, status: [...ACTIVE_STATUS_FILTER] }))}
        />
        {STATUS_OPTIONS.map((s) => (
          <Chip
            key={s.value}
            label={s.label}
            active={statusSelected.includes(normKey(s.value))}
            onPress={() =>
              setFilter((f) => ({
                ...f,
                status:
                  (toggleOneOrAll(f.status as any, s.value) as any) ??
                  ([...ACTIVE_STATUS_FILTER] as any),
              }))
            }
          />
        ))}
      </View>

      {/* ASSET LINK */}
      <Text style={styles.sectionTitle}>Asset Link</Text>
      <View style={styles.chipRow}>
        <Chip label="All" active={assetLinkMode === "all"} onPress={() => setAssetLinkMode("all")} />
        <Chip label="Linked" active={assetLinkMode === "linked"} onPress={() => setAssetLinkMode("linked")} />
        <Chip label="Unlinked" active={assetLinkMode === "unlinked"} onPress={() => setAssetLinkMode("unlinked")} />
      </View>

      {/* AGE SORT */}
      <Text style={styles.sectionTitle}>Age</Text>
      <View style={styles.chipRow}>
        <Chip label="newest" active={ageSort === "newest"} onPress={() => setAgeSort("newest")} />
        <Chip label="oldest" active={ageSort === "oldest"} onPress={() => setAgeSort("oldest")} />
      </View>

      {hasNonDefaultFilters ? (
        <TouchableOpacity onPress={clearAllFilters} style={styles.clearFiltersButton}>
          <Text style={styles.clearFiltersText}>Clear Filters</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.count}>
          Showing {items.length} of {activeItems.length} active work order{activeItems.length === 1 ? "" : "s"}
        </Text>
        {__DEV__ ? (
          <Text style={styles.devSummary}>
            DEV active={activeItems.length} db={dbFilteredItems.length} visible={items.length}
          </Text>
        ) : null}
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.id}
        ListHeaderComponent={filterHeader}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const creatorLabel = formatWorkOrderCreator(item);
          const subtitle = `${formatStatusLabel(item.status)} • ${item.priority} • ${new Date(item.createdAt).toLocaleDateString()}`;
          const assignmentMeta = `Assigned: ${assignmentSummaryLabel(item, { unassignedLabel: "Unassigned" })} • By ${creatorLabel}`;
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("WorkItemSheet", { id: item.id })}
              style={styles.listItem}
            >
              <Text style={styles.listTitle}>{formatWorkType(item.type)}</Text>
              <Text style={styles.listSubtitle}>{subtitle}</Text>
              <Text style={styles.listMeta}>{assignmentMeta}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>
              {activeItems.length === 0 ? "No active work orders." : "No work orders match current filters."}
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: { paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6 },
  count: { color: "#6b7280", fontSize: 12 },
  devSummary: { marginTop: 4, color: "#6b7280", fontSize: 11 },
  filters: { paddingHorizontal: 14, paddingTop: 4 },
  sectionTitle: { fontWeight: "800", fontSize: 13, marginTop: 6 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 6 },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 8,
    marginBottom: 8,
  },
  chipText: { fontWeight: "700", fontSize: 12, color: "#111827" },
  chipTextActive: { color: "#111827", textDecorationLine: "underline" },
  clearFiltersButton: {
    marginTop: 2,
    alignSelf: "flex-start",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  clearFiltersText: { color: "#111827", fontWeight: "800", fontSize: 12 },
  listContent: { paddingHorizontal: 14, paddingTop: 6, paddingBottom: 20 },
  listItem: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#eee" },
  listTitle: { fontWeight: "800", fontSize: 14 },
  listSubtitle: { marginTop: 3, color: "#6b7280", fontSize: 12 },
  listMeta: { marginTop: 3, color: "#334155", fontSize: 12, fontWeight: "600" },
  emptyState: { paddingTop: 10 },
  emptyText: { color: "#6b7280", fontSize: 12 },
});
