import React, { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet, ScrollView, Pressable, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { useOrg } from "../state/OrgContext";
import { WORK_ORDER_TYPE_OPTIONS } from "../constants/workOrderTypes";
import type { WorkType } from "../types/workItem";

const KEY = "settings.notifications.v1";

export type NotificationSettings = {
  notifyHighUrgentOnCreate: boolean;
  notifyTypes: Record<WorkType, boolean>;
};

const DEFAULT_TYPES = WORK_ORDER_TYPE_OPTIONS.reduce((acc, t) => {
  acc[t.key] = true;
  return acc;
}, {} as Record<WorkType, boolean>);

const DEFAULTS: NotificationSettings = {
  notifyHighUrgentOnCreate: true,
  notifyTypes: DEFAULT_TYPES,
};

export async function getNotificationSettings(): Promise<NotificationSettings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    return { ...DEFAULTS, ...JSON.parse(raw) };
  } catch {
    return DEFAULTS;
  }
}

function SettingsRow({
  title,
  subtitle,
  destructive,
  onPress,
}: {
  title: string;
  subtitle?: string;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => ({
        paddingVertical: 14,
        paddingHorizontal: 14,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: destructive ? "#fca5a5" : "#e5e7eb",
        backgroundColor: destructive ? "#fef2f2" : "white",
        opacity: pressed ? 0.7 : 1,
        marginTop: 10,
      })}
    >
      <Text style={{ fontSize: 16, fontWeight: "700", color: destructive ? "#dc2626" : "#111827" }}>
        {title}
      </Text>
      {!!subtitle && (
        <Text style={{ marginTop: 4, fontSize: 14, opacity: 0.7 }}>
          {subtitle}
        </Text>
      )}
    </Pressable>
  );
}

export default function SettingsScreen() {
  const [settings, setSettings] = useState<NotificationSettings>(DEFAULTS);
  const { orgId, clearOrgId } = useOrg();

  useEffect(() => {
    (async () => {
      const loaded = await getNotificationSettings();
      setSettings(loaded);
    })();
  }, []);

  const updateSetting = async (patch: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  };

  // DEV: Test Functions emulator connection
  const devPingFunctions = async () => {
    try {
      console.log("[DEV] Testing Functions emulator...");
      const functions = getFunctions(getApp());
      const ping = httpsCallable(functions, "roadwork_devBootstrapOrg");
      const res = await ping({});
      console.log("[DEV] Bootstrap OK:", res.data);
      Alert.alert(
        "Functions Emulator ✅",
        `Successfully called roadwork_devBootstrapOrg\n\nOrgId: ${(res.data as any)?.orgId}\n\nCheck console for full response.`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      console.error("[DEV] Functions ping failed:", e);
      Alert.alert(
        "Functions Emulator ❌",
        `Error: ${e?.message || e}\n\nCheck console for details.`,
        [{ text: "OK" }]
      );
    }
  };

  async function onSwitchOrg() {
    Alert.alert(
      "Switch organization?",
      "You'll return to the organization picker. Your account stays signed in.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Switch",
          style: "default",
          onPress: async () => {
            await clearOrgId();
            // RootGate will automatically show OrgPicker when orgId is cleared
          },
        },
      ]
    );
  }

  async function onSignOut() {
    Alert.alert(
      "Sign out?",
      "You'll be signed out of your account and will need to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Sign Out",
          style: "destructive",
          onPress: async () => {
            try {
              // Clear org selection FIRST (so RootGate can route cleanly)
              await clearOrgId();
              const auth = getAuth(getApp());
              await auth.signOut();
              console.log("[Settings] Signed out successfully");
              // RootGate will automatically show Auth screen when user is null
            } catch (e: any) {
              console.error("[Settings] Logout error:", e);
              Alert.alert("Error", "Failed to sign out. Please try again.");
            }
          },
        },
      ]
    );
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Settings</Text>

      {/* ACCOUNT SECTION */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        
        <SettingsRow
          title="Switch Organization"
          subtitle={orgId ? `Current org: ${orgId.slice(0, 8)}...` : "No org selected"}
          onPress={onSwitchOrg}
        />

        <SettingsRow
          title="Sign Out"
          subtitle="Sign out of your account on this device."
          destructive
          onPress={onSignOut}
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Notifications</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>High/Urgent Work Orders</Text>
            <Text style={styles.settingDescription}>
              Notify me when a new work order is created with High or Urgent priority.
            </Text>
          </View>
          <Switch
            value={settings.notifyHighUrgentOnCreate}
            onValueChange={(v) => updateSetting({ notifyHighUrgentOnCreate: v })}
            trackColor={{ false: "#d1d5db", true: "#22c55e" }}
            thumbColor="white"
          />
        </View>

        <View style={{ marginTop: 24 }}>
          <Text style={styles.settingLabel}>Notify by Type</Text>
          <Text style={styles.settingDescription}>
            Only send notifications for the types you enable below.
          </Text>

          <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
            <Pressable
              onPress={() => updateSetting({
                notifyTypes: WORK_ORDER_TYPE_OPTIONS.reduce((acc, t) => {
                  acc[t.key] = true;
                  return acc;
                }, {} as Record<WorkType, boolean>)
              })}
              style={styles.selectButton}
            >
              <Text style={styles.selectButtonText}>Select All</Text>
            </Pressable>

            <Pressable
              onPress={() => updateSetting({
                notifyTypes: WORK_ORDER_TYPE_OPTIONS.reduce((acc, t) => {
                  acc[t.key] = false;
                  return acc;
                }, {} as Record<WorkType, boolean>)
              })}
              style={styles.selectButton}
            >
              <Text style={styles.selectButtonText}>Select None</Text>
            </Pressable>
          </View>

          {WORK_ORDER_TYPE_OPTIONS.map((t) => (
            <View key={t.key} style={styles.typeRow}>
              <Text style={styles.typeLabel}>{t.label}</Text>
              <Switch
                value={!!settings.notifyTypes?.[t.key]}
                onValueChange={(v) => updateSetting({
                  notifyTypes: { ...(settings.notifyTypes ?? DEFAULT_TYPES), [t.key]: v }
                })}
                trackColor={{ false: "#d1d5db", true: "#22c55e" }}
                thumbColor="white"
              />
            </View>
          ))}
        </View>
      </View>

      {/* DEV SECTION: Test Functions Emulator */}
      {__DEV__ && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Developer Tools</Text>
          
          <Pressable
            onPress={devPingFunctions}
            style={styles.devTestButton}
          >
            <Text style={styles.devTestButtonText}>Test Functions Emulator</Text>
            <Text style={styles.devTestDescription}>
              Calls roadwork_devBootstrapOrg() to verify:
              {"\n"}• Phone → Functions emulator ✅
              {"\n"}• Auth token passed ✅
              {"\n"}• Callable reachable ✅
              {"\n"}• Firestore emulator write ✅
            </Text>
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>RoadWorkTracker v1.0</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#f9fafb",
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    marginBottom: 20,
  },
  section: {
    backgroundColor: "white",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginBottom: 16,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  settingText: {
    flex: 1,
    paddingRight: 16,
  },
  settingLabel: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: "#667085",
    lineHeight: 20,
  },
  footer: {
    marginTop: 32,
    alignItems: "center",
  },
  footerText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  selectButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "white",
  },
  selectButtonText: {
    fontWeight: "800",
    fontSize: 14,
  },
  typeRow: {
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    backgroundColor: "#fafafa",
  },
  typeLabel: {
    fontWeight: "700",
    fontSize: 15,
  },
  devTestButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 2,
    borderColor: "#3b82f6",
    borderRadius: 12,
    backgroundColor: "#eff6ff",
  },
  devTestButtonText: {
    fontWeight: "800",
    fontSize: 16,
    color: "#1d4ed8",
    marginBottom: 8,
  },
  devTestDescription: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
  },
  logoutButton: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#dc2626",
    borderRadius: 12,
    backgroundColor: "#fef2f2",
    alignItems: "center",
  },
  logoutButtonText: {
    fontWeight: "800",
    fontSize: 16,
    color: "#dc2626",
  },
});
