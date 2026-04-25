import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useOrg } from "../state/OrgContext";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import { maintenanceSlipsRepo } from "../repositories/maintenanceSlipsRepo";
import {
  formatMaintenanceSlipSeverity,
  formatMaintenanceSlipStatus,
  type MaintenanceSlip,
} from "../types/MaintenanceSlip";
import { hasRolePermission } from "../permissions/rolePermissions";

export default function MaintenanceSlipListScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const canView = hasRolePermission("viewMaintenanceSlip", role);
  const canCreate = hasRolePermission("createMaintenanceSlip", role);
  const [dbTick, setDbTick] = useState(0);
  const [slips, setSlips] = useState<MaintenanceSlip[]>([]);

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  const load = useCallback(async () => {
    if (!orgId || !canView) return;
    const rows = await maintenanceSlipsRepo.listRecent({ orgId, limit: 120 });
    setSlips(rows);
  }, [canView, orgId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", load);
    load();
    return unsubscribe;
  }, [navigation, load, dbTick]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={styles.title}>Vehicle Maintenance</Text>
          <Text style={styles.subtitle}>Problem sheets for trucks, equipment, and shop issues</Text>
        </View>
        {canCreate ? (
          <TouchableOpacity onPress={() => navigation.navigate("MaintenanceSlipCreate")} style={styles.newBtn}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {!canView ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Vehicle maintenance access is read-protected for your role.</Text>
          <Text style={styles.emptyHint}>A supervisor can still route you into a specific slip if your permissions change later.</Text>
        </View>
      ) : slips.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No maintenance slips yet.</Text>
          <Text style={styles.emptyHint}>
            {canCreate ? 'Use "+ New" to report the first issue.' : "Your role can view slips once they are reported."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={slips}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              onPress={() => navigation.navigate("MaintenanceSlipDetail", { id: item.id })}
              style={styles.row}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{item.unitLabel}</Text>
                <View style={[styles.badge, badgeColor(item.status)]}>
                  <Text style={styles.badgeText}>{formatMaintenanceSlipStatus(item.status)}</Text>
                </View>
              </View>
              <Text numberOfLines={1} style={styles.rowIssue}>{item.issueTitle}</Text>
              <Text numberOfLines={2} style={styles.rowMeta}>
                {formatMaintenanceSlipSeverity(item.severity)} severity
                {item.systemArea ? ` • ${item.systemArea}` : ""}
                {item.readingLabel ? ` • ${item.readingLabel}` : ""}
              </Text>
              <Text style={styles.rowUpdated}>Updated {new Date(item.updatedAt).toLocaleString()}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

function badgeColor(status: MaintenanceSlip["status"]) {
  switch (status) {
    case "open":
      return { backgroundColor: "#fee2e2" };
    case "scheduled":
      return { backgroundColor: "#dbeafe" };
    case "in_progress":
      return { backgroundColor: "#fef3c7" };
    case "resolved":
      return { backgroundColor: "#dcfce7" };
    default:
      return { backgroundColor: "#e5e7eb" };
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  headerText: { flex: 1, paddingRight: 12 },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 4, fontSize: 13, color: "#64748b" },
  newBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: "#111827",
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  empty: { padding: 32, alignItems: "center" },
  emptyText: { fontSize: 16, color: "#64748b", fontWeight: "600" },
  emptyHint: { fontSize: 13, color: "#94a3b8", marginTop: 8, textAlign: "center" },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  rowTitle: { fontSize: 15, fontWeight: "700", color: "#111827", flex: 1, paddingRight: 8 },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 11, fontWeight: "700", color: "#111827" },
  rowIssue: { marginTop: 6, fontSize: 15, color: "#0f172a" },
  rowMeta: { marginTop: 4, color: "#64748b", fontSize: 13 },
  rowUpdated: { marginTop: 6, color: "#94a3b8", fontSize: 12 },
});
