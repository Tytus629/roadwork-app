import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useOrg } from "../state/OrgContext";
import { normalizeRole } from "../permissions/rolePermissions";
import { operationsListsService } from "../services/operationsListsService";

const PRIORITY_OPTIONS = ["low", "medium", "high", "urgent"] as const;

export default function AddOperationsListItemScreen({ navigation, route }: any) {
  const listId = String(route?.params?.listId ?? "");
  const { orgId, role } = useOrg();
  const normalizedRole = normalizeRole(role);
  const canAddItems = normalizedRole !== "viewer";

  const [roadName, setRoadName] = useState("");
  const [segmentLabel, setSegmentLabel] = useState("");
  const [notes, setNotes] = useState("");
  const [priority, setPriority] = useState<string | null>(null);
  const [assignedCrew, setAssignedCrew] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!canAddItems) return false;
    return roadName.trim().length > 0 && !!listId;
  }, [canAddItems, listId, roadName]);

  async function onAdd() {
    if (!orgId || !canSubmit) return;

    setSaving(true);
    try {
      await operationsListsService.addItem({
        orgId,
        listId,
        roadName: roadName.trim(),
        segmentLabel: segmentLabel.trim() || null,
        notes: notes.trim() || null,
        priority: (priority as any) ?? null,
        assignedCrew: assignedCrew.trim() || null,
      });
      navigation.goBack();
    } catch (e: any) {
      Alert.alert("Add failed", e?.message ?? "Could not add list item.");
    } finally {
      setSaving(false);
    }
  }

  if (!canAddItems) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockedTitle}>Permission required</Text>
        <Text style={styles.lockedText}>Your role can view operations lists but cannot add list items.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>Add Operations Item</Text>
      <Text style={styles.subtitle}>Add a road/segment entry for crews to track and close out.</Text>

      <Text style={styles.label}>Road Name</Text>
      <TextInput
        value={roadName}
        onChangeText={setRoadName}
        placeholder="Example: SR-410"
        style={styles.input}
      />

      <Text style={styles.label}>Segment Label (optional)</Text>
      <TextInput
        value={segmentLabel}
        onChangeText={setSegmentLabel}
        placeholder="MP 12.0 - 18.3"
        style={styles.input}
      />

      <Text style={styles.label}>Priority (optional)</Text>
      <View style={styles.chipRow}>
        <TouchableOpacity
          onPress={() => setPriority(null)}
          style={[styles.chip, !priority && styles.chipActive]}
        >
          <Text style={[styles.chipText, !priority && styles.chipTextActive]}>None</Text>
        </TouchableOpacity>
        {PRIORITY_OPTIONS.map((p) => (
          <TouchableOpacity
            key={p}
            onPress={() => setPriority(p)}
            style={[styles.chip, priority === p && styles.chipActive]}
          >
            <Text style={[styles.chipText, priority === p && styles.chipTextActive]}>{p.toUpperCase()}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Assigned Crew (optional)</Text>
      <TextInput
        value={assignedCrew}
        onChangeText={setAssignedCrew}
        placeholder="Crew A"
        style={styles.input}
      />

      <Text style={styles.label}>Notes (optional)</Text>
      <TextInput
        value={notes}
        onChangeText={setNotes}
        placeholder="Field notes, constraints, hazards..."
        style={[styles.input, styles.textArea]}
        multiline
      />

      <TouchableOpacity
        disabled={!canSubmit || saving}
        onPress={onAdd}
        style={[styles.createBtn, (!canSubmit || saving) && styles.createBtnDisabled]}
      >
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createBtnText}>Add Item</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  contentContainer: { padding: 16, paddingBottom: 28 },
  title: { fontSize: 22, fontWeight: "800", color: "#111827" },
  subtitle: { marginTop: 6, color: "#64748b", fontSize: 13, marginBottom: 14 },
  label: { marginTop: 12, marginBottom: 6, fontWeight: "700", color: "#334155" },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "#fff",
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#111827",
  },
  textArea: { minHeight: 88, textAlignVertical: "top" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
  },
  chipActive: { backgroundColor: "#111827", borderColor: "#111827" },
  chipText: { fontWeight: "700", color: "#334155", fontSize: 12 },
  chipTextActive: { color: "#fff" },
  createBtn: {
    marginTop: 20,
    backgroundColor: "#111827",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 13,
  },
  createBtnDisabled: { opacity: 0.45 },
  createBtnText: { color: "#fff", fontWeight: "800" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  lockedTitle: { fontSize: 17, fontWeight: "800", color: "#0f172a" },
  lockedText: { marginTop: 8, color: "#64748b", textAlign: "center" },
});
