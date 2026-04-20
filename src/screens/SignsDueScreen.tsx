/**
 * SignsDueScreen — Shows signs overdue for inspection.
 *
 * ORG SCOPING:
 * Uses useOrg() to get the current orgId and passes it to useSignsDue().
 * This ensures only signs belonging to the active organization are shown.
 * Without orgId, switching orgs would show all orgs' signs mixed together.
 * See workOrdersRepo.ts header "ORG ISOLATION" section for details.
 *
 * DUE MODES:
 * Chip toggles let the user filter by inspection window (30d, 1y, 2y, 5y).
 * Each mode maps to a different SQL query in listSignsDueByMode().
 */
import React from "react";
import { View, Text, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSignsDue } from "../hooks/useSignsDue";
import { getSignLabelById, getSignCategoryById } from "../utils/signTypeLookup";
import type { DueMode } from "../db/workOrdersRepo";
import { debugSignOverdueSnapshot } from "../db/workOrdersRepo";
import { useOrg } from "../state/OrgContext";

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? `✓ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SignsDueScreen() {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
  const [mode, setMode] = React.useState<DueMode>("overdue_default");
  const items = useSignsDue(mode, orgId);

  // Debug: log SQLite state when switching to overdue_1y
  React.useEffect(() => {
    if (__DEV__ && mode === "overdue_1y") {
      debugSignOverdueSnapshot(orgId);
    }
  }, [mode, orgId]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Due</Text>
        <Text style={styles.subtitle}>{items.length} sign(s)</Text>

        <Text style={styles.filterTitle}>Filter</Text>
        <View style={styles.chipRow}>
          <Chip label="Due only" active={mode === "due_only"} onPress={() => setMode("due_only")} />
          <Chip label="Overdue (2y)" active={mode === "overdue_default"} onPress={() => setMode("overdue_default")} />
          <Chip label="Overdue 30d" active={mode === "overdue_30d"} onPress={() => setMode("overdue_30d")} />
          <Chip label="Overdue 1y" active={mode === "overdue_1y"} onPress={() => setMode("overdue_1y")} />
          <Chip label="Overdue 5y" active={mode === "overdue_5y"} onPress={() => setMode("overdue_5y")} />
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.wo.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const label = getSignLabelById(item.sd?.signTypeId ?? null);
          const title = label ?? "Sign";

          const cat =
            item.sd?.category ??
            getSignCategoryById(item.sd?.signTypeId ?? null) ??
            "Unknown";

          const lastInspected = item.sd?.inspectionLastSavedAt
            ? new Date(item.sd.inspectionLastSavedAt).toLocaleDateString()
            : "Never";

          const subtitle = `${cat} • ${item.wo.priority} • Last inspected: ${lastInspected}`;

          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("WorkItemSheet", { id: item.wo.id })}
              style={styles.listItem}
            >
              <Text style={styles.listTitle}>{title}</Text>
              <Text style={styles.listSubtitle}>{subtitle}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No signs match this filter.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontWeight: "900", fontSize: 18 },
  subtitle: { marginTop: 4, color: "#666" },
  filterTitle: { marginTop: 12, fontWeight: "900" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: { fontWeight: "700", fontSize: 13, color: "#374151" },
  chipTextActive: { color: "white" },
  listContent: { paddingHorizontal: 16, paddingVertical: 10 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  listTitle: { fontWeight: "900" },
  listSubtitle: { marginTop: 4, color: "#666" },
  emptyState: { paddingTop: 14 },
  emptyText: { color: "#666" },
});
