// src/screens/OutboxFailedScreen.tsx
//
// Shows outbox jobs that have failed (attempts >= 3 or lastError set).
// Provides "Retry All Failed" and "Clear Failed" controls.

import React, { useCallback, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useOrg } from "../state/OrgContext";
import {
  getFailedJobs,
  retryAllFailed,
  clearFailedJobs,
  resetFailedRowById,
  deleteFailedRowById,
} from "../sync/outboxSync";

type FailedJob = ReturnType<typeof getFailedJobs>[number];

function OutboxItemSeparator() {
  return <View style={s.itemSeparator} />;
}

export default function OutboxFailedScreen() {
  const { orgId } = useOrg();
  const [jobs, setJobs] = useState<FailedJob[]>([]);

  const refresh = useCallback(() => {
    if (!orgId) return;
    setJobs(getFailedJobs(orgId, { minAttempts: 1, limit: 50 }));
  }, [orgId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  function handleRetryAll() {
    if (!orgId) return;
    const count = retryAllFailed(orgId);
    Alert.alert("Retry queued", `${count} job(s) reset for retry.`);
    refresh();
  }

  function handleClearFailed() {
    if (!orgId) return;
    Alert.alert(
      "Clear failed jobs?",
      "This permanently removes jobs with 10+ failed attempts. They will NOT be synced.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            const count = clearFailedJobs(orgId);
            Alert.alert("Cleared", `${count} job(s) removed.`);
            refresh();
          },
        },
      ],
    );
  }

  function fmtTime(ts: number | null) {
    if (!ts) return "—";
    return new Date(ts).toLocaleString();
  }

  function handleRetryOne(rowId: string) {
    if (!orgId) return;
    const count = resetFailedRowById(orgId, rowId);
    const title = count > 0 ? "Row reset" : "No change";
    const message = count > 0 ? "Row " + rowId + " reset for retry." : "Row not found or not failed.";
    Alert.alert(title, message);
    refresh();
  }

  function handleDeleteOne(rowId: string) {
    if (!orgId) return;
    Alert.alert(
      "Delete failed row?",
      `This permanently removes row ${rowId} from outbox.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const count = deleteFailedRowById(orgId, rowId);
            const title = count > 0 ? "Deleted" : "No change";
            const message = count > 0 ? "Row " + rowId + " removed." : "Row not found or not failed.";
            Alert.alert(title, message);
            refresh();
          },
        },
      ],
    );
  }

  const renderItem = ({ item }: { item: FailedJob }) => (
    <View style={s.card}>
      <View style={s.cardHeader}>
        <Text style={s.kind}>{item.kind}</Text>
        <Text style={s.attempts}>×{item.attempts}</Text>
      </View>
      <Text style={s.entityId} numberOfLines={1}>
        ID: {item.entityId}
      </Text>
      {item.lastError ? (
        <Text style={s.error} numberOfLines={3}>
          {item.lastError}
        </Text>
      ) : null}
      <Text style={s.meta}>
        Created: {fmtTime(item.createdAt)}  •  Last try: {fmtTime(item.lastAttemptAt)}
      </Text>
      {item.nextAttemptAt ? (
        <Text style={s.meta}>
          Next retry: {fmtTime(item.nextAttemptAt)}
        </Text>
      ) : null}

      <View style={s.rowActions}>
        <TouchableOpacity style={s.retryOneBtn} onPress={() => handleRetryOne(item.id)}>
          <Text style={s.retryOneBtnText}>Retry Row</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.deleteOneBtn} onPress={() => handleDeleteOne(item.id)}>
          <Text style={s.deleteOneBtnText}>Delete Row</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <View style={s.root}>
      {/* Action buttons */}
      <View style={s.actions}>
        <TouchableOpacity style={s.retryBtn} onPress={handleRetryAll}>
          <Text style={s.retryBtnText}>Retry All Failed</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.clearBtn} onPress={handleClearFailed}>
          <Text style={s.clearBtnText}>Clear Failed (10+)</Text>
        </TouchableOpacity>
      </View>

      {jobs.length === 0 ? (
        <View style={s.empty}>
          <Text style={s.emptyText}>No failed jobs 🎉</Text>
        </View>
      ) : (
        <FlatList
          data={jobs}
          keyExtractor={(j) => j.id}
          renderItem={renderItem}
          contentContainerStyle={s.contentContainer}
          ItemSeparatorComponent={OutboxItemSeparator}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#f9fafb" },
  actions: {
    flexDirection: "row",
    padding: 12,
    gap: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  retryBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#2563eb",
    alignItems: "center",
  },
  retryBtnText: { color: "#fff", fontWeight: "700" },
  clearBtn: {
    flex: 1,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#dc2626",
    alignItems: "center",
  },
  clearBtnText: { color: "#dc2626", fontWeight: "700" },
  empty: { flex: 1, justifyContent: "center", alignItems: "center" },
  emptyText: { fontSize: 16, opacity: 0.5 },
  contentContainer: { padding: 16, paddingBottom: 40 },
  itemSeparator: { height: 10 },
  card: {
    backgroundColor: "#fff",
    borderRadius: 10,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "#e5e7eb",
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 4,
  },
  kind: { fontWeight: "700", fontSize: 14 },
  attempts: { fontWeight: "700", color: "#dc2626", fontSize: 14 },
  entityId: { fontSize: 12, opacity: 0.6, marginBottom: 4 },
  error: {
    fontSize: 12,
    color: "#b91c1c",
    backgroundColor: "#fef2f2",
    padding: 6,
    borderRadius: 6,
    marginBottom: 4,
  },
  meta: { fontSize: 11, opacity: 0.5 },
  rowActions: {
    marginTop: 10,
    flexDirection: "row",
    gap: 8,
  },
  retryOneBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 8,
  },
  retryOneBtnText: {
    color: "#2563eb",
    fontWeight: "700",
    fontSize: 12,
  },
  deleteOneBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 8,
    alignItems: "center",
    paddingVertical: 8,
  },
  deleteOneBtnText: {
    color: "#dc2626",
    fontWeight: "700",
    fontSize: 12,
  },
});
