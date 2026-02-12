import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, FlatList, ScrollView } from "react-native";
import type { WorkOrderFilter } from "../db/types";
import { SortMode } from "../db/workOrdersRepo";
import { useActiveWorkOrders } from "../hooks/useActiveWorkOrders";
import { WORK_ORDER_TYPE_OPTIONS, formatWorkType } from "../constants/workOrderTypes";

// Helper function to display user-friendly status labels
function formatStatus(status: string): string {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "needs") return "Needs";
  if (status === "deferred") return "Deferred";
  return status;
}

// Helper to format priority for display
function formatPriority(priority: string): string {
  return priority.charAt(0).toUpperCase() + priority.slice(1);
}

export default function WorkListScreen() {
  // Default Active filter: show Needs + In Progress (not completed/deferred)
  const [filter, setFilter] = useState<WorkOrderFilter>({
    status: ["needs", "in_progress"],
  });

  const [sort, setSort] = useState<SortMode>("priority");

  const items = useActiveWorkOrders(filter, sort);

  // Type options - show all available work order types
  const typeOptions = useMemo(() => WORK_ORDER_TYPE_OPTIONS.map(opt => opt.key), []);

  // Status options
  const statusOptions = ["needs", "in_progress", "completed", "deferred"];
  
  // Priority options
  const priorityOptions = ["low", "medium", "high", "urgent"];

  // Helper to toggle item in array
  const toggleInArray = (arr: string[] | undefined, value: string) => {
    const current = arr ?? [];
    return current.includes(value) 
      ? current.filter(x => x !== value)
      : [...current, value];
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Active Work Orders</Text>

      {/* Type Filter */}
      <View style={styles.filterRow}>
        <Text style={styles.label}>Type:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.scrollFilter}>
          {typeOptions.map(t => {
            const isActive = filter.types?.includes(t) ?? false;
            return (
              <Pressable
                key={t}
                onPress={() => setFilter(f => ({ ...f, types: toggleInArray(f.types, t) }))}
                style={[styles.pill, isActive && styles.pillOn]}
              >
                <Text style={[styles.pillText, isActive && styles.pillTextOn]}>
                  {formatWorkType(t as any)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* Status Filter */}
      <View style={styles.row}>
        <Text style={styles.label}>Status:</Text>
        {statusOptions.map(s => {
          const isActive = filter.status?.includes(s) ?? false;
          return (
            <Pressable
              key={s}
              onPress={() => setFilter(f => ({ ...f, status: toggleInArray(f.status, s) }))}
              style={[styles.pill, isActive && styles.pillOn]}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextOn]}>{formatStatus(s)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Priority Filter */}
      <View style={styles.row}>
        <Text style={styles.label}>Priority:</Text>
        {priorityOptions.map(p => {
          const isActive = filter.priority?.includes(p) ?? false;
          return (
            <Pressable
              key={p}
              onPress={() => setFilter(f => ({ ...f, priority: toggleInArray(f.priority, p) }))}
              style={[styles.pill, isActive && styles.pillOn]}
            >
              <Text style={[styles.pillText, isActive && styles.pillTextOn]}>{formatPriority(p)}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* Sort */}
      <View style={styles.row}>
        <Text style={styles.label}>Sort:</Text>

        {(["priority", "newest", "oldest"] as const).map(m => (
          <Pressable
            key={m}
            onPress={() => setSort(m)}
            style={[styles.pill, sort === m && styles.pillOn]}
          >
            <Text style={[styles.pillText, sort === m && styles.pillTextOn]}>{m}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.count}>Showing {items.length} work orders</Text>

      <FlatList
        data={items}
        keyExtractor={(i) => i.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{formatWorkType(item.type as any)}</Text>
            <Text style={styles.cardSub}>{formatStatus(item.status)} • {formatPriority(item.priority)}</Text>
            <Text style={styles.cardSub}>Created: {new Date(item.createdAt).toLocaleString()}</Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 10 },
  title: { fontSize: 22, fontWeight: "800" },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 6 },
  filterRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  scrollFilter: { flex: 1, flexGrow: 0 },
  label: { width: 62, fontWeight: "700" },
  pill: { paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1", marginRight: 6 },
  pillOn: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { fontSize: 12 },
  pillTextOn: { color: "white" },
  count: { opacity: 0.7 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  cardTitle: { fontSize: 16, fontWeight: "800" },
  cardSub: { fontSize: 12, opacity: 0.8, marginTop: 4 },
});
