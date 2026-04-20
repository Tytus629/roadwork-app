// src/screens/CounterScreen.tsx
//
// Up to 3 tally counters on one screen, each with its own label.
// Saves each counter individually to SQLite offline-first.

import React, { useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
  ScrollView,
} from "react-native";
import { useOrg } from "../state/OrgContext";
import { makeClientId } from "../repositories/repoUtils";
import { counterService } from "../services/counterService";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";

type CounterSlot = { label: string; count: number; notes: string };

const DEFAULTS: CounterSlot[] = [
  { label: "Signs", count: 0, notes: "" },
  { label: "Culverts", count: 0, notes: "" },
  { label: "Guardrail", count: 0, notes: "" },
];

export default function CounterScreen() {
  const { orgId, role } = useOrg();
  const canCreateCounter = hasRolePermission("createCounter", role);
  const [slots, setSlots] = useState<CounterSlot[]>(DEFAULTS.map((d) => ({ ...d })));

  function update(idx: number, patch: Partial<CounterSlot>) {
    setSlots((prev) => prev.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  }

  function inc(idx: number) {
    setSlots((prev) =>
      prev.map((s, i) => (i === idx ? { ...s, count: s.count + 1 } : s)),
    );
  }

  function resetSlot(idx: number) {
    update(idx, { count: 0 });
  }

  async function saveSlot(idx: number) {
    if (!canCreateCounter) {
      Alert.alert("Permission denied", permissionDeniedMessage("createCounter"));
      return;
    }

    const slot = slots[idx];
    if (!slot.label.trim()) {
      Alert.alert("Missing label", "Enter a label (e.g. 'Stop signs').");
      return;
    }

    let uid: string | null = null;
    let displayName: string | null = null;
    try {
      const user = getAuth(getApp()).currentUser;
      uid = user?.uid ?? null;
      displayName = user?.displayName ?? null;
    } catch {}

    const now = Date.now();
    await counterService.insertAndEnqueue({
      id: makeClientId("counter"),
      orgId: orgId!,
      createdAt: now,
      updatedAt: now,
      createdByUid: uid,
      createdByDisplayName: displayName,
      label: slot.label.trim(),
      count: slot.count,
      lat: null,
      lng: null,
      notes: slot.notes.trim() || null,
    });

    Alert.alert("Saved", `${slot.count} × ${slot.label.trim()}`);
    update(idx, { count: 0, notes: "" });
  }

  async function saveAll() {
    if (!canCreateCounter) {
      Alert.alert("Permission denied", permissionDeniedMessage("createCounter"));
      return;
    }

    const nonZero = slots.filter((s) => s.count > 0 && s.label.trim());
    if (!nonZero.length) {
      Alert.alert("Nothing to save", "All counters are at zero.");
      return;
    }

    let uid: string | null = null;
    let displayName: string | null = null;
    try {
      const user = getAuth(getApp()).currentUser;
      uid = user?.uid ?? null;
      displayName = user?.displayName ?? null;
    } catch {}

    const now = Date.now();
    for (const slot of nonZero) {
      await counterService.insertAndEnqueue({
        id: makeClientId("counter"),
        orgId: orgId!,
        createdAt: now,
        updatedAt: now,
        createdByUid: uid,
        createdByDisplayName: displayName,
        label: slot.label.trim(),
        count: slot.count,
        lat: null,
        lng: null,
        notes: slot.notes.trim() || null,
      });
    }
    const summary = nonZero.map((s) => `${s.count} × ${s.label.trim()}`).join(", ");
    Alert.alert("Saved", summary);
    setSlots((prev) => prev.map((s) => ({ ...s, count: 0, notes: "" })));
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Counter</Text>

      {slots.map((slot, idx) => (
        <View key={idx} style={styles.card}>
          <TextInput
            value={slot.label}
            onChangeText={(t) => update(idx, { label: t })}
            placeholder="Label…"
            editable={canCreateCounter}
            style={styles.labelInput}
          />

          <View style={styles.cardRow}>
            <Text style={styles.countText}>{slot.count}</Text>

            <TouchableOpacity onPress={() => inc(idx)} disabled={!canCreateCounter} style={[styles.plusButton, !canCreateCounter && styles.disabledButton]}>
              <Text style={styles.plusText}>+1</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => resetSlot(idx)} disabled={!canCreateCounter} style={[styles.smallButton, !canCreateCounter && styles.disabledButton]}>
              <Text style={styles.smallButtonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => saveSlot(idx)} disabled={!canCreateCounter} style={[styles.smallButton, !canCreateCounter && styles.disabledButton]}>
              <Text style={styles.smallButtonText}>Save</Text>
            </TouchableOpacity>
          </View>

          <TextInput
            value={slot.notes}
            onChangeText={(t) => update(idx, { notes: t })}
            placeholder="Notes…"
            editable={canCreateCounter}
            style={styles.notesInput}
          />
        </View>
      ))}

      <TouchableOpacity onPress={saveAll} disabled={!canCreateCounter} style={[styles.saveAllButton, !canCreateCounter && styles.disabledButton]}>
        <Text style={styles.saveAllText}>{canCreateCounter ? "Save All" : "Not allowed for this role"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 14, gap: 12, paddingBottom: 32 },
  title: { fontSize: 22, fontWeight: "900" },

  card: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 14,
    padding: 12,
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  labelInput: {
    fontWeight: "700",
    fontSize: 15,
    borderBottomWidth: 1,
    borderColor: "#ddd",
    paddingVertical: 4,
  },
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  countText: { fontSize: 36, fontWeight: "800", minWidth: 50, textAlign: "center" },
  plusButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  plusText: { fontSize: 18, fontWeight: "800" },
  smallButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#999",
    alignItems: "center",
  },
  smallButtonText: { fontWeight: "700", fontSize: 12 },
  notesInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 8,
    fontSize: 13,
  },

  saveAllButton: {
    marginTop: 4,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
    backgroundColor: "#f0f9ff",
  },
  saveAllText: { fontWeight: "800", fontSize: 16 },
  disabledButton: { opacity: 0.5 },
});
