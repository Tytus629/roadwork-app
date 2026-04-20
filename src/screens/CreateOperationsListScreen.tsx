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

const PROGRAM_OPTIONS = [
  { value: "crack_seal", label: "Crack Seal" },
  { value: "snow_plow", label: "Snow Plow" },
  { value: "shoulder_sweeping", label: "Shoulder Sweeping" },
  { value: "other", label: "Other" },
] as const;

export default function CreateOperationsListScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const normalizedRole = normalizeRole(role);
  const canManage =
    normalizedRole === "platform_owner" ||
    normalizedRole === "org_owner" ||
    normalizedRole === "org_admin" ||
    normalizedRole === "asset_manager";

  const [title, setTitle] = useState("");
  const [programType, setProgramType] = useState<string>("crack_seal");
  const [seasonYear, setSeasonYear] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const canSubmit = useMemo(() => {
    if (!canManage) return false;
    return title.trim().length >= 3;
  }, [canManage, title]);

  async function onCreate() {
    if (!orgId || !canSubmit) return;

    setSaving(true);
    try {
      const yearNum = Number(seasonYear);
      const hasYear = seasonYear.trim().length > 0 && Number.isFinite(yearNum);

      const res = await operationsListsService.createList({
        orgId,
        title: title.trim(),
        programType,
        seasonYear: hasYear ? yearNum : null,
        description: description.trim() || null,
      });

      navigation.replace("OperationsListDetail", { listId: res.listId });
    } catch (e: any) {
      Alert.alert("Create failed", e?.message ?? "Could not create operations list.");
    } finally {
      setSaving(false);
    }
  }

  if (!canManage) {
    return (
      <View style={styles.center}>
        <Text style={styles.lockedTitle}>Permission required</Text>
        <Text style={styles.lockedText}>Your role can view operations lists but cannot create them.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Text style={styles.title}>New Operations List</Text>
      <Text style={styles.subtitle}>Create a shared list so crews can coordinate work in real time.</Text>

      <Text style={styles.label}>Title</Text>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Example: District 3 Snow Plow"
        style={styles.input}
      />

      <Text style={styles.label}>Program Type</Text>
      <View style={styles.chipRow}>
        {PROGRAM_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            onPress={() => setProgramType(opt.value)}
            style={[styles.chip, programType === opt.value && styles.chipActive]}
          >
            <Text style={[styles.chipText, programType === opt.value && styles.chipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.label}>Season Year (optional)</Text>
      <TextInput
        value={seasonYear}
        onChangeText={(v) => setSeasonYear(v.replace(/[^0-9]/g, ""))}
        keyboardType="number-pad"
        maxLength={4}
        placeholder="2026"
        style={styles.input}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Crew notes, route scope, constraints..."
        style={[styles.input, styles.textArea]}
        multiline
      />

      <TouchableOpacity
        disabled={!canSubmit || saving}
        onPress={onCreate}
        style={[styles.createBtn, (!canSubmit || saving) && styles.createBtnDisabled]}
      >
        {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.createBtnText}>Create List</Text>}
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
