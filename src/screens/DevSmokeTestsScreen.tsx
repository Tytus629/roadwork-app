import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import Clipboard from "@react-native-clipboard/clipboard";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaView } from "react-native-safe-area-context";
import { useOrg } from "../state/OrgContext";
import {
  buildSmokeRunClipboardText,
  runDeveloperSmokeTests,
  type SmokeCheck,
  type SmokeRunResult,
  type SmokeStatus,
} from "../dev/smokeRunner";

const CHECKLIST_KEY = "dev_smoke_two_device_checklist_v1";

type TwoDeviceChecklistState = {
  enabled: boolean;
  items: Record<string, boolean>;
};

const DEFAULT_CHECKLIST: TwoDeviceChecklistState = {
  enabled: false,
  items: {
    deviceA_signedIn: false,
    deviceB_signedIn: false,
    deviceA_createWorkOrder: false,
    deviceB_receivesSync: false,
    deviceB_statusChange: false,
    deviceA_receivesStatusSync: false,
    photoUploadVisibleBothDevices: false,
  },
};

const CHECKLIST_LABELS: Array<{ id: keyof TwoDeviceChecklistState["items"]; label: string }> = [
  { id: "deviceA_signedIn", label: "Device A signed in and org selected" },
  { id: "deviceB_signedIn", label: "Device B signed in and same org selected" },
  { id: "deviceA_createWorkOrder", label: "Device A created/edited a work order" },
  { id: "deviceB_receivesSync", label: "Device B received work order sync" },
  { id: "deviceB_statusChange", label: "Device B changed work order status" },
  { id: "deviceA_receivesStatusSync", label: "Device A received status sync" },
  { id: "photoUploadVisibleBothDevices", label: "Photo attachment visible on both devices" },
];

function statusColor(status: SmokeStatus): string {
  if (status === "PASS") return "#166534";
  if (status === "WARN") return "#92400e";
  if (status === "FAIL") return "#991b1b";
  return "#374151";
}

function statusBg(status: SmokeStatus): string {
  if (status === "PASS") return "#ecfdf3";
  if (status === "WARN") return "#fff7ed";
  if (status === "FAIL") return "#fef2f2";
  return "#f3f4f6";
}

function checkRow(check: SmokeCheck) {
  return (
    <View key={check.id} style={styles.checkRow}>
      <View style={[styles.statusPill, { backgroundColor: statusBg(check.status), borderColor: statusColor(check.status) }]}>
        <Text style={[styles.statusPillText, { color: statusColor(check.status) }]}>{check.status}</Text>
      </View>
      <View style={styles.checkTextWrap}>
        <Text style={styles.checkTitle}>{check.title}</Text>
        <Text style={styles.checkDetail}>{check.detail}</Text>
      </View>
    </View>
  );
}

export default function DevSmokeTestsScreen() {
  const { clearOrgId } = useOrg();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<SmokeRunResult | null>(null);
  const [checklist, setChecklist] = useState<TwoDeviceChecklistState>(DEFAULT_CHECKLIST);

  useEffect(() => {
    let mounted = true;
    AsyncStorage.getItem(CHECKLIST_KEY)
      .then((raw) => {
        if (!mounted || !raw) return;
        try {
          const parsed = JSON.parse(raw) as TwoDeviceChecklistState;
          if (parsed && parsed.items) {
            setChecklist({
              enabled: !!parsed.enabled,
              items: { ...DEFAULT_CHECKLIST.items, ...parsed.items },
            });
          }
        } catch {
          setChecklist(DEFAULT_CHECKLIST);
        }
      })
      .catch(() => {
        setChecklist(DEFAULT_CHECKLIST);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const persistChecklist = useCallback(async (next: TwoDeviceChecklistState) => {
    setChecklist(next);
    await AsyncStorage.setItem(CHECKLIST_KEY, JSON.stringify(next));
  }, []);

  const runAll = useCallback(async () => {
    setRunning(true);
    try {
      const output = await runDeveloperSmokeTests({
        canClearOrgContext: typeof clearOrgId === "function",
        devSmokeRouteVisibleFromMore: __DEV__,
      });
      setResult(output);
    } catch (error: any) {
      Alert.alert("Smoke run failed", error?.message ?? String(error));
    } finally {
      setRunning(false);
    }
  }, [clearOrgId]);

  const resetAll = useCallback(async () => {
    setResult(null);
    await AsyncStorage.removeItem(CHECKLIST_KEY);
    setChecklist(DEFAULT_CHECKLIST);
  }, []);

  const copySummary = useCallback(() => {
    if (!result) {
      Alert.alert("Nothing to copy", "Run smoke tests first.");
      return;
    }
    const summary = buildSmokeRunClipboardText(result);
    Clipboard.setString(summary);
    Alert.alert("Copied", "Smoke test summary copied to clipboard.");
  }, [result]);

  const checklistProgress = useMemo(() => {
    const total = CHECKLIST_LABELS.length;
    const done = CHECKLIST_LABELS.filter((item) => checklist.items[item.id]).length;
    return `${done}/${total}`;
  }, [checklist.items]);

  return (
    <SafeAreaView style={styles.safeArea} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.container}>
        <Text style={styles.title}>Developer Smoke Tests</Text>
        <Text style={styles.subtitle}>
          DEV-only, non-destructive checks for auth/org UI, map routing contracts, and photo sync contracts.
        </Text>

        <View style={styles.controlsRow}>
          <Pressable onPress={runAll} style={[styles.button, styles.primaryButton, running && styles.disabledButton]} disabled={running}>
            {running ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.primaryButtonText}>Run All</Text>}
          </Pressable>
          <Pressable onPress={copySummary} style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.secondaryButtonText}>Copy Results</Text>
          </Pressable>
          <Pressable onPress={resetAll} style={[styles.button, styles.secondaryButton]}>
            <Text style={styles.secondaryButtonText}>Reset</Text>
          </Pressable>
        </View>

        <View style={styles.metaCard}>
          <Text style={styles.metaLabel}>Last run</Text>
          <Text style={styles.metaValue}>{result ? result.finishedAtIso : "Not run"}</Text>
          <Text style={styles.metaLabel}>Overall</Text>
          <Text style={[styles.metaValue, { color: result ? statusColor(result.status) : "#374151" }]}>
            {result ? result.status : "NOT_RUN"}
          </Text>
        </View>

        <View style={styles.metaCard}>
          <View style={styles.checklistHeaderRow}>
            <Text style={styles.metaLabel}>Optional Two-Device Checklist</Text>
            <Switch
              value={checklist.enabled}
              onValueChange={(enabled) => {
                void persistChecklist({ ...checklist, enabled });
              }}
            />
          </View>
          <Text style={styles.metaValue}>Progress: {checklistProgress}</Text>
          {checklist.enabled ? (
            <View style={styles.checklistList}>
              {CHECKLIST_LABELS.map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.checklistRow}
                  onPress={() => {
                    void persistChecklist({
                      ...checklist,
                      items: {
                        ...checklist.items,
                        [item.id]: !checklist.items[item.id],
                      },
                    });
                  }}
                >
                  <Text style={styles.checklistMark}>{checklist.items[item.id] ? "[x]" : "[ ]"}</Text>
                  <Text style={styles.checklistText}>{item.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.checkDetail}>Enable to persist a manual two-device sync checklist on this device.</Text>
          )}
        </View>

        {(result?.groups ?? []).map((group) => (
          <View key={group.id} style={styles.groupCard}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.title}</Text>
              <Text style={[styles.groupStatus, { color: statusColor(group.status) }]}>{group.status}</Text>
            </View>
            {group.checks.map((check) => checkRow(check))}
          </View>
        ))}

        <Text style={styles.note}>
          Dev note: These checks are intentionally non-destructive and focus on contracts, wiring, and safety assertions rather than mutating field data.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  container: {
    padding: 16,
    gap: 12,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: "800",
    color: "#0f172a",
  },
  subtitle: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
  },
  controlsRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  button: {
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  primaryButton: {
    backgroundColor: "#0f766e",
  },
  primaryButtonText: {
    color: "white",
    fontWeight: "700",
  },
  secondaryButton: {
    backgroundColor: "#e2e8f0",
  },
  secondaryButtonText: {
    color: "#0f172a",
    fontWeight: "600",
  },
  disabledButton: {
    opacity: 0.7,
  },
  metaCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 4,
  },
  metaLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  metaValue: {
    color: "#0f172a",
    fontSize: 14,
    marginBottom: 4,
  },
  checklistHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  checklistList: {
    marginTop: 6,
    gap: 8,
  },
  checklistRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  checklistMark: {
    width: 28,
    color: "#0f172a",
    fontWeight: "700",
  },
  checklistText: {
    flex: 1,
    color: "#1e293b",
  },
  groupCard: {
    backgroundColor: "white",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 12,
    gap: 10,
  },
  groupHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  groupTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
  },
  groupStatus: {
    fontSize: 13,
    fontWeight: "800",
  },
  checkRow: {
    flexDirection: "row",
    gap: 10,
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusPillText: {
    fontWeight: "800",
    fontSize: 11,
  },
  checkTextWrap: {
    flex: 1,
  },
  checkTitle: {
    color: "#0f172a",
    fontWeight: "700",
    fontSize: 14,
  },
  checkDetail: {
    color: "#475569",
    marginTop: 2,
    fontSize: 13,
    lineHeight: 18,
  },
  note: {
    marginTop: 10,
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
  },
});
