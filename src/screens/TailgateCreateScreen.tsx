// src/screens/TailgateCreateScreen.tsx
//
// Form for creating a daily tailgate safety log.
// Multi-select chips for work types, hazards, PPE, traffic control.
// Saved to SQLite offline-first, enqueued to outbox.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useOrg } from "../state/OrgContext";
import { makeClientId } from "../repositories/repoUtils";
import { TailgateLog } from "../repositories/tailgateRepo";
import { tailgateService } from "../services/tailgateService";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";

// ─── Preset option lists ─────────────────────────────────────────────────

const WORK_TYPES = [
  "Potholes", "Signs", "Guardrail", "Culverts",
  "Ditching", "Spraying", "Brushing", "Asphalt",
];
const HAZARDS = [
  "Traffic", "Backing vehicles", "Slips/Trips", "Heavy lifting",
  "Flying debris", "Heat/Cold", "Wildlife",
];
const PPE = [
  "Hard hat", "Safety vest", "Gloves",
  "Eye protection", "Hearing protection", "Boots",
];
const TRAFFIC = [
  "Cones", "Signs ahead", "Flaggers", "Pilot car", "Arrow board",
];

// ─── Helpers ─────────────────────────────────────────────────────────────

function toggle(list: string[], item: string) {
  return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
}

function dateKeyLocal(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

// ─── Screen ──────────────────────────────────────────────────────────────

export default function TailgateCreateScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const canCreateTailgate = hasRolePermission("createTailgate", role);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [workTypes, setWorkTypes] = useState<string[]>([]);
  const [hazards, setHazards] = useState<string[]>([]);
  const [ppe, setPpe] = useState<string[]>([]);
  const [trafficControl, setTrafficControl] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [supervisorName, setSupervisorName] = useState("");
  const [saving, setSaving] = useState(false);

  const today = useMemo(() => dateKeyLocal(), []);
  const bottomClearance = tabBarHeight + insets.bottom + 28;

  async function save() {
    if (!canCreateTailgate) {
      Alert.alert("Permission denied", permissionDeniedMessage("createTailgate"));
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      const now = Date.now();

      // Get user info from Firebase auth
      let uid: string | null = null;
      let displayName: string | null = null;
      try {
        const user = getAuth(getApp()).currentUser;
        uid = user?.uid ?? null;
        displayName = user?.displayName ?? null;
      } catch {}

      const log: TailgateLog = {
        id: makeClientId("tailgate"),
        orgId: orgId!,
        dateKey: today,
        createdAt: now,
        updatedAt: now,

        createdByUid: uid,
        createdByDisplayName: displayName,

        workTypes,
        hazards,
        ppe,
        trafficControl,

        notes: notes.trim() || null,
        supervisorName: supervisorName.trim() || null,
        signedBy: displayName ? [{ name: displayName, at: now }] : [],
      };

      await tailgateService.upsertAndEnqueue(log);
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: bottomClearance }}
    >
      <Text style={styles.title}>Tailgate — {today}</Text>

      <ChipSection
        title="Work Types"
        items={WORK_TYPES}
        selected={workTypes}
        onToggle={setWorkTypes}
        disabled={!canCreateTailgate}
      />
      <ChipSection
        title="Hazards Discussed"
        items={HAZARDS}
        selected={hazards}
        onToggle={setHazards}
        disabled={!canCreateTailgate}
      />
      <ChipSection
        title="PPE"
        items={PPE}
        selected={ppe}
        onToggle={setPpe}
        disabled={!canCreateTailgate}
      />
      <ChipSection
        title="Traffic Control"
        items={TRAFFIC}
        selected={trafficControl}
        onToggle={setTrafficControl}
        disabled={!canCreateTailgate}
      />

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Supervisor</Text>
        <TextInput
          value={supervisorName}
          onChangeText={setSupervisorName}
          placeholder="Name (optional)"
          editable={canCreateTailgate}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldBlock}>
        <Text style={styles.fieldLabel}>Notes</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Anything noteworthy…"
          multiline
          editable={canCreateTailgate}
          style={[styles.input, styles.multilineInput]}
        />
      </View>

      <TouchableOpacity
        onPress={save}
        disabled={saving || !canCreateTailgate}
        style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
      >
        <Text style={styles.saveBtnText}>
          {!canCreateTailgate ? "Not allowed for this role" : saving ? "Saving…" : "Save Tailgate Log"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

// ─── Chip Section Component ──────────────────────────────────────────────

function ChipSection({
  title,
  items,
  selected,
  onToggle,
  disabled,
}: {
  title: string;
  items: string[];
  selected: string[];
  onToggle: (next: string[]) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.chipRow}>
        {items.map((it) => {
          const on = selected.includes(it);
          return (
            <TouchableOpacity
              key={it}
              onPress={() => onToggle(toggle(selected, it))}
              disabled={disabled}
              style={[styles.chip, on && styles.chipOn, disabled && styles.saveBtnDisabled]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>
                {on ? "\u2705 " : ""}
                {it}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: "#fff" },
  title: { fontSize: 22, fontWeight: "bold", color: "#111827", marginBottom: 8 },

  sectionBlock: { marginTop: 18 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 8 },
  chipRow: { flexDirection: "row", flexWrap: "wrap" },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 20,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  chipOn: { backgroundColor: "#dcfce7", borderColor: "#22c55e" },
  chipText: { fontSize: 13, color: "#374151" },
  chipTextOn: { color: "#15803d", fontWeight: "600" },

  fieldBlock: { marginTop: 18 },
  fieldLabel: { fontSize: 16, fontWeight: "700", color: "#111827", marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    fontSize: 14,
    color: "#111827",
  },
  multilineInput: {
    minHeight: 90,
    textAlignVertical: "top",
  },

  saveBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  saveBtnDisabled: {
    opacity: 0.5,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
});
