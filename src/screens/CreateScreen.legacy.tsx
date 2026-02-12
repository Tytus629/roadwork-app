import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useAppDispatch } from "../store/hooks";
import { createPointWorkOrder } from "../services/workOrdersService";
import { addLog } from "../store/workLogSlice";
import type { WorkItem } from "../types/workItem";
import { uid } from "../utils/uid";
import { persistAuditLog } from "../utils/audit";

export default function CreateScreen() {
  const dispatch = useAppDispatch();
  const [lastAddedAt, setLastAddedAt] = useState<number | null>(null);

  const lastAddedLabel = useMemo(() => {
    if (!lastAddedAt) return null;
    return new Date(lastAddedAt).toLocaleTimeString();
  }, [lastAddedAt]);

  const quickAddTestPothole = async () => {
    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      type: "pothole",
      status: "needs",
      priority: "high",
      title: "Test pothole",
      notes: "Created from Create tab (temporary)",
      geometry: { kind: "point", coordinates: { lat: 46.602, lng: -120.505 } },
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
      assignedTo: null,
      needsSync: true,
    };

    // Persist via service
    createPointWorkOrder({
      id: item.id,
      type: item.type,
      status: item.status,
      priority: item.priority,
      note: item.notes ?? null,
      point: item.geometry.coordinates,
      createdAt: now,
    });

    // ✅ Create log entry
    dispatch(addLog({
      id: uid(),
      at: now,
      workItemId: item.id,
      action: "created",
      message: `Created test pothole: ${item.title ?? item.type}`,
    }));

    // STEP D-5: Persist audit log
    await persistAuditLog(item.id, "created", {
      title: item.title,
      type: item.type,
    });

    // ✅ Green success banner timestamp
    setLastAddedAt(now);
  };

  const quickAddTestSign = async () => {
    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      type: "sign",
      status: "needs",
      priority: "medium",
      title: "Test sign work order",
      notes: "Created from Create tab to test sign type picker",
      geometry: { kind: "point", coordinates: { lat: 46.602, lng: -120.505 } },
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
      assignedTo: null,
      needsSync: true,
    };

    createPointWorkOrder({
      id: item.id,
      type: item.type,
      status: item.status,
      priority: item.priority,
      note: item.notes ?? null,
      point: item.geometry.coordinates,
      createdAt: now,
    });

    dispatch(addLog({
      id: uid(),
      at: now,
      workItemId: item.id,
      action: "created",
      message: `Created test sign: ${item.title ?? item.type}`,
    }));

    await persistAuditLog(item.id, "created", {
      title: item.title,
      type: item.type,
    });

    setLastAddedAt(now);
  };

  const quickAddUrgentPothole = async () => {
    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      type: "pothole",
      status: "needs",
      priority: "urgent",
      title: "URGENT: Large pothole blocking lane",
      notes: "Created to test notification system",
      geometry: { kind: "point", coordinates: { lat: 46.602, lng: -120.505 } },
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
      assignedTo: null,
      needsSync: true,
    };

    createPointWorkOrder({
      id: item.id,
      type: item.type,
      status: item.status,
      priority: item.priority,
      note: item.notes ?? null,
      point: item.geometry.coordinates,
      createdAt: now,
    });

    dispatch(addLog({
      id: uid(),
      at: now,
      workItemId: item.id,
      action: "created",
      message: `Created urgent pothole: ${item.title ?? item.type}`,
    }));

    await persistAuditLog(item.id, "created", {
      title: item.title,
      type: item.type,
    });

    setLastAddedAt(now);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create</Text>
      <Text style={styles.sub}>Wizard comes next: type → geometry → photos/notes → status/priority → save</Text>

      {lastAddedLabel && (
        <View style={styles.success}>
          <Text style={styles.successText}>✓ Added work order at {lastAddedLabel}</Text>
        </View>
      )}
      <Pressable onPress={quickAddTestPothole} style={styles.button}>
        <Text style={styles.buttonText}>Quick Add Test Pothole</Text>
      </Pressable>
      <Pressable onPress={quickAddTestSign} style={[styles.button, { backgroundColor: "#0ea5e9" }]}>
        <Text style={styles.buttonText}>Quick Add Test Sign</Text>
      </Pressable>
      <Pressable onPress={quickAddUrgentPothole} style={[styles.button, { backgroundColor: "#ef4444" }]}>
        <Text style={styles.buttonText}>🔔 Add URGENT (Tests Notification)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 12 },
  title: { fontSize: 22, fontWeight: "900" },
  sub: { fontSize: 12, opacity: 0.7 },
  success: { padding: 12, borderRadius: 12, backgroundColor: "#dcfce7", borderWidth: 1, borderColor: "#86efac" },
  successText: { fontWeight: "900", color: "#14532d" },
  button: { padding: 14, borderRadius: 10, backgroundColor: "#1f2937" },
  buttonText: { color: "white", fontWeight: "900", textAlign: "center" },
});
