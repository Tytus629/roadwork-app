// src/screens/TailgateListScreen.tsx
//
// Lists recent tailgate safety logs with a "New" button.

import React, { useCallback, useEffect, useState } from "react";
import { View, Text, TouchableOpacity, FlatList, StyleSheet } from "react-native";
import { useOrg } from "../state/OrgContext";
import { tailgateRepo, TailgateLog } from "../repositories/tailgateRepo";

export default function TailgateListScreen({ navigation }: any) {
  const { orgId } = useOrg();
  const [logs, setLogs] = useState<TailgateLog[]>([]);

  const load = useCallback(async () => {
    if (!orgId) return;
    const rows = await tailgateRepo.listByDateDesc({ orgId, limit: 90 });
    setLogs(rows);
  }, [orgId]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    load();
    return unsub;
  }, [navigation, load]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Tailgate Logs</Text>
        <TouchableOpacity
          onPress={() => navigation.navigate("TailgateCreate")}
          style={styles.newBtn}
        >
          <Text style={styles.newBtnText}>+ New</Text>
        </TouchableOpacity>
      </View>

      {logs.length === 0 && (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>No tailgate logs yet.</Text>
          <Text style={styles.emptyHint}>Tap "+ New" to create your first daily safety log.</Text>
        </View>
      )}

      <FlatList
        data={logs}
        keyExtractor={(x) => x.id}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate("TailgateDetail", { id: item.id })}
            style={styles.row}
          >
            <Text style={styles.rowDate}>{item.dateKey}</Text>
            <Text numberOfLines={1} style={styles.rowSub}>
              Work: {(item.workTypes ?? []).join(", ") || "—"} {" • "}
              Hazards: {(item.hazards ?? []).slice(0, 3).join(", ") || "—"}
            </Text>
            {item.supervisorName ? (
              <Text style={styles.rowSupervisor}>Supervisor: {item.supervisorName}</Text>
            ) : null}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: { fontSize: 20, fontWeight: "bold", color: "#111827" },
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
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  rowDate: { fontWeight: "700", fontSize: 15, color: "#111827" },
  rowSub: { color: "#64748b", marginTop: 4, fontSize: 13 },
  rowSupervisor: { color: "#94a3b8", marginTop: 2, fontSize: 12 },
});
