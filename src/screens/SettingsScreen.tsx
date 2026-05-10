import React, { useEffect, useState } from "react";
import { View, Text, Switch, StyleSheet, ScrollView, Pressable, Alert, Button, TouchableOpacity, TextInput, Platform } from "react-native";
import { toastSuccess, toastError } from "../ui/toast";
import { manualSyncNow } from "../sync/syncScheduler";
import { debugLocalCounts } from "../debug/localDbDebug";
import { printTableSchema } from "../debug/printSchema";
import { getOutboxStatus, getOutboxErrors } from "../sync/outboxSync";
import { getDevNetState, setForceOffline, subscribeDevNet, isForceOffline } from "../dev/devNetwork";
import { DevFlagStore } from "../dev/devFlagStore";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import RNFS from "react-native-fs";
import { useOrg } from "../state/OrgContext";
import { useNavigation } from "@react-navigation/native";
import {
  WORK_ORDER_TYPE_OPTIONS,
  formatWorkType,
  getWorkOrderTypeA11yLabel,
  getWorkOrderTypeChipBorder,
  getWorkOrderTypeChipFill,
  getWorkOrderTypeChipText,
  getWorkOrderTypePreviewTypes,
  getWorkOrderTypeStyle,
} from "../constants/workOrderTypes";
import type { WorkType } from "../types/workItem";
import { forceCrash, sendCrashlyticsTestEvent } from "../telemetry/crashlytics";
import { exportTailgateCsv } from "../export/exportTailgate";
import { exportDmiCsv } from "../export/exportDmi";
import { exportCounterCsv } from "../export/exportCounter";
import {
  getCurrentUserIdentitySnapshot,
  updateCurrentUserName,
} from "../services/userProfileService";
import { hasRolePermission } from "../permissions/rolePermissions";
import {
  getColorblindModePreference,
  setColorblindModePreference,
  useColorblindModePreference,
} from "../settings/colorblindMode";
import {
  setWorkOrderTypeVisibilityPreference,
  useWorkOrderTypeVisibilityPreference,
} from "../settings/workOrderTypeVisibility";
import DeviceInfo from "react-native-device-info";
import { getEmulatorConnectionInfo, getRecommendedMetroHost } from "../firebase/emulators";
import { callDevFunctionHttp, getDevFunctionUrl } from "../firebase/devFunctionsHttp";
import { getGlobalWorkOrderPhotoDevDiagnostics } from "../services/workOrderPhotosService";
import { workOrdersService } from "../services/workOrdersService";
import { addWorkOrderPhoto, getAttachmentPhotosForWorkOrder } from "../services/workOrderPhotosService";
import type { WorkOrder } from "../types/WorkOrder";
import type { WorkPhoto } from "../types/workItem";
import { getWorkOrderById } from "../db/workOrdersRepo";
import { logSyncBreadcrumb, recordErrorWithContext } from "../telemetry/crashlytics";

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

const PHOTO_SMOKE_TITLE_MOBILE = "PHOTO SYNC SMOKE TEST - MOBILE CREATED";
const PHOTO_SMOKE_TITLE_BACKEND = "PHOTO SYNC SMOKE TEST - BACKEND CREATED";
const PHOTO_SMOKE_NOTE = "Created by backend photo sync smoke test. Safe to delete.";
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7+1e8AAAAASUVORK5CYII=";

type DebugVerifyPhotoSyncResponse = {
  ok: boolean;
  orgId?: string;
  workOrderId?: string;
  photoCount?: number;
  message?: string;
  reason?: string;
  photos?: Array<{
    photoId?: string;
    storagePath?: string;
    hasStoragePath?: boolean;
    hasCreatedAt?: boolean;
    hasCreatedBy?: boolean;
    storageObjectExists?: boolean | null;
  }>;
};

type DebugCreateWorkOrderWithPhotoResponse = {
  ok: boolean;
  orgId?: string;
  workOrderId?: string;
  photoId?: string;
  storagePath?: string;
  title?: string;
  reason?: string;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function callPhotoSmokeDebugFn<T = any>(functionName: string, payload: Record<string, any>): Promise<T> {
  const emulatorInfo = getEmulatorConnectionInfo();
  if (__DEV__ && functionName.startsWith("roadwork_debug") && !emulatorInfo.enabled) {
    throw new Error(
      "DEV Firebase emulators are disabled. Enable emulator mode for photo smoke debug callables.",
    );
  }
  if (__DEV__ && emulatorInfo.enabled) {
    return callDevFunctionHttp<T>(functionName, payload);
  }
  const fn = httpsCallable(getFunctions(getApp()), functionName);
  const res = await fn(payload);
  return res.data as T;
}

function buildSmokeWorkOrder(orgId: string, title: string): WorkOrder {
  const now = Date.now();
  const id = `wo_smoke_${now}_${Math.random().toString(36).slice(2, 8)}`;
  return {
    id,
    orgId,
    type: "pothole",
    status: "Needs",
    priority: "Low",
    geomType: "point",
    lat: 37.4219999,
    lng: -122.0840575,
    line: null,
    minLat: 0,
    minLng: 0,
    maxLat: 0,
    maxLng: 0,
    note: `${title}. ${PHOTO_SMOKE_NOTE}`,
    createdAt: now,
    updatedAt: now,
  };
}

async function createPlaceholderSmokePhoto(prefix: string): Promise<WorkPhoto> {
  const now = Date.now();
  const id = `photo_smoke_${now}_${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${prefix}_${id}.png`;
  const fullPath = `${RNFS.CachesDirectoryPath}/${fileName}`;
  await RNFS.writeFile(fullPath, TINY_PNG_BASE64, "base64");

  return {
    id,
    uri: `file://${fullPath}`,
    fileName,
    mimeType: "image/png",
    createdAt: now,
    source: "gallery",
  };
}

const COLOR_PREVIEW_TYPES: string[] = getWorkOrderTypePreviewTypes();

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
  const colorblindMode = useColorblindModePreference();
  const workOrderTypeVisibility = useWorkOrderTypeVisibilityPreference();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileEmail, setProfileEmail] = useState<string | null>(null);
  const { orgId, role, clearOrgId } = useOrg();
  const navigation = useNavigation<any>();
  const isViewer = role === "viewer";
  const canCreateWorkOrders = hasRolePermission("createWorkOrder", role);
  const canUseExports =
    hasRolePermission("createTailgate", role) ||
    hasRolePermission("createDmi", role) ||
    hasRolePermission("createCounter", role);
  const authUid = getAuth(getApp()).currentUser?.uid ?? null;
  const authEmail = getAuth(getApp()).currentUser?.email ?? null;
  const isSimulatorOrEmulator = DeviceInfo.isEmulatorSync();
  const devConn = getEmulatorConnectionInfo();
  const devFunctionsBase = (() => {
    try {
      const full = getDevFunctionUrl("roadwork_devBootstrapOrg");
      const idx = full.indexOf("/us-central1/");
      return idx >= 0 ? full.slice(0, idx) : full;
    } catch {
      return "unavailable";
    }
  })();
  const [photoSmokeBusy, setPhotoSmokeBusy] = useState<null | "mobile" | "backend" | "cleanup">(null);
  const globalPhotoDiag = __DEV__ ? getGlobalWorkOrderPhotoDevDiagnostics() : null;

  useEffect(() => {
    (async () => {
      const loaded = await getNotificationSettings();
      setSettings(loaded);
      await getColorblindModePreference();

      try {
        const identity = await getCurrentUserIdentitySnapshot();
        setFirstName(identity.firstName ?? "");
        setLastName(identity.lastName ?? "");
        setProfileEmail(identity.email ?? null);
      } catch (e) {
        console.warn("[Settings] Failed to load profile", e);
      }
    })();
  }, []);

  const saveProfileName = async () => {
    if (profileSaving) return;

    const safeFirst = firstName.trim();
    const safeLast = lastName.trim();
    if (!safeFirst) {
      Alert.alert("First name required", "Please enter your first name.");
      return;
    }
    if (!safeLast) {
      Alert.alert("Last name required", "Please enter your last name.");
      return;
    }

    setProfileSaving(true);
    try {
      const profile = await updateCurrentUserName({
        firstName: safeFirst,
        lastName: safeLast,
      });
      setFirstName(profile.firstName ?? "");
      setLastName(profile.lastName ?? "");
      setProfileEmail(profile.email ?? null);
      Alert.alert("Saved", "Your profile name has been updated.");
    } catch (e: any) {
      Alert.alert("Save failed", e?.message ?? "Could not update profile.");
    } finally {
      setProfileSaving(false);
    }
  };

  const updateSetting = async (patch: Partial<NotificationSettings>) => {
    const updated = { ...settings, ...patch };
    setSettings(updated);
    await AsyncStorage.setItem(KEY, JSON.stringify(updated));
  };

  const setWorkOrderTypeVisible = async (workType: WorkType, nextVisible: boolean) => {
    const currentlyVisible = WORK_ORDER_TYPE_OPTIONS.filter((option) => !!workOrderTypeVisibility[option.key]);
    if (!nextVisible && currentlyVisible.length <= 1 && workOrderTypeVisibility[workType]) {
      Alert.alert("At least one type required", "Keep at least one work-order type visible in Create.");
      return;
    }

    try {
      await setWorkOrderTypeVisibilityPreference({
        ...workOrderTypeVisibility,
        [workType]: nextVisible,
      });
    } catch (e) {
      console.warn("[Settings] Failed to save work-order type visibility", e);
    }
  };

  // DEV: Test Functions emulator connection
  const devPingFunctions = async () => {
    if (!__DEV__) return;
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

  const runPhotoSmokeMobileUpload = async () => {
    if (!orgId) {
      Alert.alert("No org selected", "Select an org before running photo smoke tests.");
      return;
    }

    setPhotoSmokeBusy("mobile");
    try {
      console.log("[PhotoSmokeTest] START mobile upload test", { orgId });
      logSyncBreadcrumb("PhotoSmokeTest START mobile upload", { orgId });

      const workOrder = buildSmokeWorkOrder(orgId, PHOTO_SMOKE_TITLE_MOBILE);
      await workOrdersService.upsertAndEnqueue(workOrder);
      console.log("[PhotoSmokeTest] Created local work order", { workOrderId: workOrder.id });

      const photo = await createPlaceholderSmokePhoto("mobile");
      await addWorkOrderPhoto({ workOrderId: workOrder.id, photo });
      console.log("[PhotoSmokeTest] Attached placeholder photo", {
        workOrderId: workOrder.id,
        photoId: photo.id,
        fileName: photo.fileName,
      });

      await manualSyncNow();
      console.log("[PhotoSmokeTest] Upload queued and sync requested", { workOrderId: workOrder.id });

      await sleep(1000);
      const verify = await callPhotoSmokeDebugFn<DebugVerifyPhotoSyncResponse>(
        "roadwork_debugVerifyWorkOrderPhotoSync",
        { orgId, workOrderId: workOrder.id },
      );

      console.log("[PhotoSmokeTest] Backend verify result", verify);

      if (verify?.ok) {
        const firstPhoto = verify.photos?.[0];
        console.log("[PhotoSmokeTest] PASS mobile upload -> backend", {
          workOrderId: workOrder.id,
          photoId: firstPhoto?.photoId ?? photo.id,
          storagePath: firstPhoto?.storagePath ?? null,
          photoCount: verify.photoCount ?? 0,
        });
        Alert.alert(
          "PASS: Mobile Upload -> Backend",
          [
            `WorkOrderId: ${workOrder.id}`,
            `PhotoId: ${firstPhoto?.photoId ?? photo.id}`,
            `StoragePath: ${firstPhoto?.storagePath ?? "n/a"}`,
            "",
            "Now open Phone B on the same org. Pull to refresh or tap Sync Now. Search for 'PHOTO SYNC SMOKE TEST - MOBILE CREATED'. Open the work order and confirm the photo appears.",
          ].join("\n"),
        );
      } else {
        Alert.alert(
          "FAIL: Mobile Upload -> Backend",
          `Reason: ${verify?.reason ?? verify?.message ?? "Verification did not pass."}`,
        );
      }
    } catch (e: any) {
      console.error("[PhotoSmokeTest] FAIL mobile upload -> backend", e);
      recordErrorWithContext(e, {
        message: "PhotoSmokeTest mobile upload failed",
        extras: { orgId: orgId ?? "none" },
      });
      Alert.alert("Photo Smoke Test Failed", e?.message ?? String(e));
    } finally {
      setPhotoSmokeBusy(null);
    }
  };

  const runPhotoSmokeBackendCreated = async () => {
    if (!orgId) {
      Alert.alert("No org selected", "Select an org before running photo smoke tests.");
      return;
    }

    setPhotoSmokeBusy("backend");
    try {
      console.log("[PhotoSmokeTest] START backend-created test", { orgId });
      logSyncBreadcrumb("PhotoSmokeTest START backend-created", { orgId });

      const created = await callPhotoSmokeDebugFn<DebugCreateWorkOrderWithPhotoResponse>(
        "roadwork_debugCreateWorkOrderWithPhoto",
        {
          orgId,
          title: PHOTO_SMOKE_TITLE_BACKEND,
          workType: "pothole",
        },
      );

      if (!created?.ok || !created.workOrderId) {
        throw new Error(created?.reason || "Backend smoke create did not return workOrderId.");
      }

      console.log("[PhotoSmokeTest] Backend created", {
        workOrderId: created.workOrderId,
        photoId: created.photoId ?? null,
        storagePath: created.storagePath ?? null,
      });

      let localRow = null as ReturnType<typeof getWorkOrderById>;
      let localPhotos: WorkPhoto[] = [];

      for (let i = 0; i < 8; i += 1) {
        await manualSyncNow();
        await sleep(1200);

        localRow = getWorkOrderById(created.workOrderId, orgId);
        if (!localRow) continue;

        const attachments = Array.isArray(localRow.attachments) ? localRow.attachments : [];
        if (attachments.length < 1) continue;

        localPhotos = await getAttachmentPhotosForWorkOrder({
          orgId,
          workOrderId: created.workOrderId,
          attachmentsRaw: attachments,
        });

        if (localPhotos.length > 0) break;
      }

      const hasLocalRow = !!localRow;
      const hasAttachmentMeta = (localRow?.attachments?.length ?? 0) > 0;
      const hasDetailPhotoSource = localPhotos.length > 0;

      console.log("[PhotoSmokeTest] Local verification", {
        workOrderId: created.workOrderId,
        hasLocalRow,
        hasAttachmentMeta,
        detailSourcePhotoCount: localPhotos.length,
      });

      if (hasLocalRow && hasAttachmentMeta && hasDetailPhotoSource) {
        console.log("[PhotoSmokeTest] PASS backend -> mobile", {
          workOrderId: created.workOrderId,
          photoId: created.photoId ?? null,
        });
        Alert.alert(
          "PASS: Backend -> Mobile",
          [
            `WorkOrderId: ${created.workOrderId}`,
            `PhotoId: ${created.photoId ?? "n/a"}`,
            `Local photos in detail source: ${localPhotos.length}`,
            "",
            "Backend-created photo work order is ready. On any phone in the same org, sync and open 'PHOTO SYNC SMOKE TEST - BACKEND CREATED'. Confirm the photo appears.",
          ].join("\n"),
        );
      } else {
        const reason = [
          hasLocalRow ? null : "work order missing locally",
          hasAttachmentMeta ? null : "photo metadata missing locally",
          hasDetailPhotoSource ? null : "photo missing in detail source",
        ]
          .filter(Boolean)
          .join(", ");
        Alert.alert("FAIL: Backend -> Mobile", reason || "Unknown local verification failure.");
      }
    } catch (e: any) {
      console.error("[PhotoSmokeTest] FAIL backend -> mobile", e);
      recordErrorWithContext(e, {
        message: "PhotoSmokeTest backend-created failed",
        extras: { orgId: orgId ?? "none" },
      });
      Alert.alert("Photo Smoke Test Failed", e?.message ?? String(e));
    } finally {
      setPhotoSmokeBusy(null);
    }
  };

  const runPhotoSmokeCleanup = async () => {
    if (!orgId) {
      Alert.alert("No org selected", "Select an org before cleanup.");
      return;
    }
    setPhotoSmokeBusy("cleanup");
    try {
      console.log("[PhotoSmokeTest] START cleanup", { orgId });
      const response = await callPhotoSmokeDebugFn<any>(
        "roadwork_debugCleanupPhotoSyncSmokeTestData",
        {
          orgId,
          titlePrefix: "PHOTO SYNC SMOKE TEST",
        },
      );
      console.log("[PhotoSmokeTest] Cleanup result", response);
      Alert.alert("Cleanup complete", `Response: ${JSON.stringify(response, null, 2)}`);
    } catch (e: any) {
      console.warn("[PhotoSmokeTest] cleanup failed", e);
      Alert.alert(
        "Cleanup failed",
        `${e?.message ?? String(e)}\n\nIf backend cleanup callable is not deployed yet, this is expected.`,
      );
    } finally {
      setPhotoSmokeBusy(null);
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
            if (__DEV__) {
              const uid = getAuth(getApp()).currentUser?.uid ?? null;
              console.log(
                `[Settings] switch org requested uid=${uid ?? "none"} currentOrg=${orgId ?? "none"}`
              );
            }
            await clearOrgId();
            // RootGate will automatically show OrgPicker when orgId is cleared
          },
        },
      ]
    );
  }

  async function onJoinNewOrg() {
    Alert.alert(
      "Join new organization?",
      "You'll return to organization selection where you can request access to another org.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Continue",
          style: "default",
          onPress: async () => {
            await clearOrgId();
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
              await clearOrgId();
              const auth = getAuth(getApp());
              await auth.signOut();
              console.log("[Settings] Signed out successfully (org session cleared)");
              // RootGate + OrgContext will clear in-memory org context and route to Auth.
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

        <View style={styles.profileCard}>
          <Text style={styles.profileLabel}>First Name</Text>
          <TextInput
            value={firstName}
            onChangeText={setFirstName}
            placeholder="First name"
            autoCapitalize="words"
            style={styles.profileInput}
          />

          <Text style={[styles.profileLabel, { marginTop: 10 }]}>Last Name</Text>
          <TextInput
            value={lastName}
            onChangeText={setLastName}
            placeholder="Last name"
            autoCapitalize="words"
            style={styles.profileInput}
          />

          {!!profileEmail && (
            <Text style={styles.profileMeta}>Email: {profileEmail}</Text>
          )}

          <TouchableOpacity
            onPress={saveProfileName}
            disabled={profileSaving}
            style={[styles.profileSaveBtn, profileSaving && styles.profileSaveBtnDisabled]}
          >
            <Text style={styles.profileSaveBtnText}>
              {profileSaving ? "Saving..." : "Save Name"}
            </Text>
          </TouchableOpacity>
        </View>
        
        <SettingsRow
          title="Switch Organization"
          subtitle={orgId ? `Current org: ${orgId.slice(0, 8)}...` : "No org selected"}
          onPress={onSwitchOrg}
        />

        <SettingsRow
          title="Join New Organization"
          subtitle="Open org selection and submit a new join request."
          onPress={onJoinNewOrg}
        />

        <SettingsRow
          title="Sign Out"
          subtitle="Sign out of your account on this device."
          destructive
          onPress={onSignOut}
        />
      </View>

      {!isViewer && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Display</Text>

        <View style={styles.settingRow}>
          <View style={styles.settingText}>
            <Text style={styles.settingLabel}>Colorblind-friendly colors</Text>
            <Text style={styles.settingDescription}>
              Uses a higher-contrast work-order palette and adds short-code cues in previews and the create chooser.
            </Text>
          </View>
          <Switch
            value={colorblindMode}
            onValueChange={(v) => {
              setColorblindModePreference(v).catch((e) => {
                console.warn("[Settings] Failed to save colorblind mode", e);
              });
            }}
            trackColor={{ false: "#fca5a5", true: "#86efac" }}
            thumbColor="white"
          />
        </View>

        <Text style={styles.previewTitle}>Sample work-order colors</Text>
        <View style={styles.previewWrap}>
          {COLOR_PREVIEW_TYPES.map((sampleType) => {
            const typeStyle = getWorkOrderTypeStyle(sampleType, { colorblindMode });
            return (
              <View
                key={sampleType}
                style={[
                  styles.previewChip,
                  colorblindMode && styles.previewChipColorblind,
                  {
                    borderColor: getWorkOrderTypeChipBorder(sampleType, { colorblindMode }),
                    backgroundColor: getWorkOrderTypeChipFill(sampleType, { colorblindMode, selected: true }),
                  },
                ]}
              >
                {colorblindMode ? <Text style={styles.previewChipCode}>{typeStyle.shortLabel}</Text> : null}
                <Text style={[styles.previewChipText, { color: getWorkOrderTypeChipText(sampleType, { colorblindMode, selected: true }) }]}>
                  {formatWorkType(sampleType)}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
      )}

      {!isViewer && (
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
              <View style={styles.typeLabelWrap}>
                <View
                  style={[
                    styles.typeSwatch,
                    {
                      borderColor: getWorkOrderTypeChipBorder(t.key, { colorblindMode }),
                      backgroundColor: getWorkOrderTypeChipFill(t.key, { colorblindMode, selected: true }),
                    },
                  ]}
                >
                  {colorblindMode ? (
                    <Text style={styles.typeSwatchCode}>{getWorkOrderTypeStyle(t.key, { colorblindMode }).shortLabel.slice(0, 2)}</Text>
                  ) : null}
                </View>
                <Text style={styles.typeLabel}>{getWorkOrderTypeA11yLabel(t.key)}</Text>
              </View>
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
      )}

      {canCreateWorkOrders && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Create</Text>
        <Text style={styles.settingDescription}>
          Choose which work-order types appear in the Create picker.
        </Text>

        <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
          <Pressable
            onPress={() => {
              setWorkOrderTypeVisibilityPreference(
                WORK_ORDER_TYPE_OPTIONS.reduce((acc, option) => {
                  acc[option.key] = true;
                  return acc;
                }, {} as Record<WorkType, boolean>),
              ).catch((e) => {
                console.warn("[Settings] Failed to enable all work-order types", e);
              });
            }}
            style={styles.selectButton}
          >
            <Text style={styles.selectButtonText}>Show All</Text>
          </Pressable>
        </View>

        {WORK_ORDER_TYPE_OPTIONS.map((option) => (
          <View key={option.key} style={styles.typeRow}>
            <View style={styles.typeLabelWrap}>
              <View
                style={[
                  styles.typeSwatch,
                  {
                    borderColor: getWorkOrderTypeChipBorder(option.key, { colorblindMode }),
                    backgroundColor: getWorkOrderTypeChipFill(option.key, { colorblindMode, selected: true }),
                  },
                ]}
              >
                {colorblindMode ? (
                  <Text style={styles.typeSwatchCode}>{getWorkOrderTypeStyle(option.key, { colorblindMode }).shortLabel.slice(0, 2)}</Text>
                ) : null}
              </View>
              <Text style={styles.typeLabel}>{getWorkOrderTypeA11yLabel(option.key)}</Text>
            </View>
            <Switch
              value={!!workOrderTypeVisibility[option.key]}
              onValueChange={(next) => {
                setWorkOrderTypeVisible(option.key, next);
              }}
              trackColor={{ false: "#d1d5db", true: "#22c55e" }}
              thumbColor="white"
            />
          </View>
        ))}
      </View>
      )}

      {/* ── Exports ── */}
      {canUseExports && (
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📤 Exports</Text>
        <View style={{ gap: 10 }}>
          <TouchableOpacity
            onPress={async () => {
              if (!orgId) return Alert.alert("No org selected");
              try {
                await exportTailgateCsv({ orgId });
              } catch (e: any) {
                if (e?.message !== "User did not share") {
                  Alert.alert("Export failed", e?.message ?? String(e));
                }
              }
            }}
            style={styles.exportBtn}
          >
            <Text style={styles.exportBtnText}>Export Tailgate CSV</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              if (!orgId) return Alert.alert("No org selected");
              try {
                await exportDmiCsv({ orgId });
              } catch (e: any) {
                if (e?.message !== "User did not share") {
                  Alert.alert("Export failed", e?.message ?? String(e));
                }
              }
            }}
            style={styles.exportBtn}
          >
            <Text style={styles.exportBtnText}>Export DMI CSV</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={async () => {
              if (!orgId) return Alert.alert("No org selected");
              try {
                await exportCounterCsv({ orgId });
              } catch (e: any) {
                if (e?.message !== "User did not share") {
                  Alert.alert("Export failed", e?.message ?? String(e));
                }
              }
            }}
            style={styles.exportBtn}
          >
            <Text style={styles.exportBtnText}>Export Counters CSV</Text>
          </TouchableOpacity>
        </View>
      </View>
      )}

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal</Text>
        <SettingsRow
          title="Privacy Policy"
          subtitle="How WayCrew collects, uses, and protects data."
          onPress={() => navigation.navigate("PrivacyPolicy")}
        />
      </View>

      {/* DEV SECTION: Test Functions Emulator */}
      {__DEV__ && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Developer Tools</Text>

          <View style={styles.devInfoCard}>
            <Text style={styles.devInfoTitle}>Runtime Diagnostics</Text>
            <Text style={styles.devInfoLine}>Platform: {Platform.OS}</Text>
            <Text style={styles.devInfoLine}>Simulator/Emulator: {isSimulatorOrEmulator ? "yes" : "no"}</Text>
            <Text style={styles.devInfoLine}>Device mode: {devConn.mode}</Text>
            <Text style={styles.devInfoLine}>ADB reverse expected: {devConn.adbReverseAssumed ? "yes" : "no"}</Text>
            <Text style={styles.devInfoLine}>Current orgId: {orgId ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Current uid: {authUid ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Current email: {authEmail ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Firebase emulator host: {devConn.selectedHost}</Text>
            <Text style={styles.devInfoLine}>Functions URL base: {devFunctionsBase}</Text>
            <Text style={styles.devInfoLine}>Functions Target: {devConn.functionsTarget}</Text>
            <Text style={styles.devInfoLine}>Firestore Target: {devConn.firestoreTarget}</Text>
            <Text style={styles.devInfoLine}>Auth Target: {devConn.authUrl}</Text>
            <Text style={styles.devInfoLine}>Storage Target: {devConn.storageTarget}</Text>
            <Text style={styles.devInfoLine}>Metro Host Hint: {getRecommendedMetroHost()}</Text>
            <Text style={styles.devInfoLine}>Metro Port: 8081</Text>
            <Text style={styles.devInfoLine}>Photo sync debug: Work Order details to DEV Photo Sync Diagnostics</Text>
            <Text style={styles.devInfoLine}>Photo last WO: {globalPhotoDiag?.lastOpenedWorkOrderId ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload status: {globalPhotoDiag?.latestUploadStatus ?? "idle"}</Text>
            <Text style={styles.devInfoLine}>Photo upload error code: {globalPhotoDiag?.latestUploadErrorCode ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload error message: {globalPhotoDiag?.latestUploadErrorMessage ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Photo upload storage path: {globalPhotoDiag?.latestUploadStoragePath ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload orgId: {globalPhotoDiag?.latestSelectedOrgId ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload assetId: {globalPhotoDiag?.latestUploadAssetId ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload auth UID: {globalPhotoDiag?.latestAuthUid ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload auth email: {globalPhotoDiag?.latestAuthEmail ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload dev emulator mode: {globalPhotoDiag?.latestDevEmulatorModeActive == null ? "n/a" : globalPhotoDiag.latestDevEmulatorModeActive ? "yes" : "no"}</Text>
            <Text style={styles.devInfoLine}>Photo upload URI: {globalPhotoDiag?.latestUploadLocalUri ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo upload URI scheme: {globalPhotoDiag?.latestUploadUriScheme ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Attachment write status: {globalPhotoDiag?.latestAttachmentWriteStatus ?? "idle"}</Text>
            <Text style={styles.devInfoLine}>Attachment write error: {globalPhotoDiag?.latestAttachmentWriteErrorMessage ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Attachment count(last): {globalPhotoDiag?.latestRemoteAttachmentCount ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo diag error: {globalPhotoDiag?.latestRemoteFetchError ?? "none"}</Text>
            <Text style={styles.devInfoLine}>Photo storage emulator host: {globalPhotoDiag?.latestStorageEmulatorHost ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo storage target: {globalPhotoDiag?.latestStorageEmulatorTarget ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo storage bucket: {globalPhotoDiag?.latestStorageBucket ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo storage app: {globalPhotoDiag?.latestStorageAppName ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Photo storage library: {globalPhotoDiag?.latestStorageLibrary ?? "n/a"}</Text>
            <Text style={styles.devInfoLine}>Membership exists: {globalPhotoDiag?.latestMembershipDocExists == null ? "n/a" : globalPhotoDiag.latestMembershipDocExists ? "true" : "false"}</Text>
            <Text style={styles.devInfoLine}>Membership status/role/active: {(globalPhotoDiag?.latestMembershipStatus ?? "n/a") + " / " + (globalPhotoDiag?.latestMembershipRole ?? "n/a") + " / " + (globalPhotoDiag?.latestMembershipActive ?? "n/a")}</Text>
            <Text style={styles.devInfoLine}>Membership warning: {globalPhotoDiag?.latestMembershipWarning ?? "none"}</Text>
          </View>
          
          <Button
            title="Toast Test"
            onPress={() => {
              toastSuccess("Toast Test", "Toast is working ✅");
            }}
          />
          <View style={{ height: 12 }} />

          <Button
            title="Sync Now"
            onPress={async () => {
              try {
                if (!orgId) return toastError("No org selected");
                const before = getOutboxStatus(orgId);
                console.log("[SyncNow] orgId:", orgId);
                console.log("[SyncNow] outbox pending:", before.pending);
                if (isForceOffline()) {
                  console.log("[SyncNow] blocked by DEV Force Offline");
                  toastError("Blocked", "DEV Force Offline is on");
                  return;
                }
                await manualSyncNow();
                debugLocalCounts(orgId);
                printTableSchema("work_orders");
                printTableSchema("outbox");
                const after = getOutboxStatus(orgId);
                toastSuccess(
                  "Sync complete",
                  `Pending: ${after.pending} (was ${before.pending})`
                );
              } catch (e: any) {
                toastError("Sync failed", e?.message ?? String(e));
              }
            }}
          />
          <View style={{ height: 12 }} />

          <Pressable
            onPress={runPhotoSmokeMobileUpload}
            disabled={photoSmokeBusy != null}
            style={[styles.devTestButton, photoSmokeBusy != null && { opacity: 0.7 }]}
          >
            <Text style={styles.devTestButtonText}>
              {photoSmokeBusy === "mobile" ? "Running..." : "Run Photo Sync Smoke Test: Mobile Upload"}
            </Text>
            <Text style={styles.devTestDescription}>
              Creates a local smoke-test work order, attaches a tiny placeholder photo, runs normal outbox/upload flow,
              then verifies backend attachment presence via roadwork_debugVerifyWorkOrderPhotoSync.
            </Text>
          </Pressable>

          <View style={{ height: 10 }} />

          <Pressable
            onPress={runPhotoSmokeBackendCreated}
            disabled={photoSmokeBusy != null}
            style={[styles.devTestButton, photoSmokeBusy != null && { opacity: 0.7 }]}
          >
            <Text style={styles.devTestButtonText}>
              {photoSmokeBusy === "backend" ? "Running..." : "Run Photo Sync Smoke Test: Backend Created"}
            </Text>
            <Text style={styles.devTestDescription}>
              Calls roadwork_debugCreateWorkOrderWithPhoto, syncs down, then verifies local work order and attachment
              metadata plus detail-screen photo source resolution.
            </Text>
          </Pressable>

          <View style={{ height: 10 }} />

          <Pressable
            onPress={runPhotoSmokeCleanup}
            disabled={photoSmokeBusy != null}
            style={[styles.devTestButton, { borderColor: "#b45309", backgroundColor: "#fffbeb" }, photoSmokeBusy != null && { opacity: 0.7 }]}
          >
            <Text style={[styles.devTestButtonText, { color: "#92400e" }]}>
              {photoSmokeBusy === "cleanup" ? "Running..." : "Clean Photo Sync Smoke Test Data"}
            </Text>
            <Text style={styles.devTestDescription}>
              Calls roadwork_debugCleanupPhotoSyncSmokeTestData for rows titled with PHOTO SYNC SMOKE TEST prefix.
            </Text>
          </Pressable>

          <View style={{ height: 12 }} />

          {/* ── Outbox Errors ── */}
          <OutboxErrorsPanel orgId={orgId} />

          <TouchableOpacity
            onPress={() => navigation.navigate("OutboxFailed")}
            style={{
              marginTop: 8,
              padding: 12,
              borderWidth: 1,
              borderColor: "#6b7280",
              borderRadius: 10,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "700" }}>View Failed Jobs</Text>
          </TouchableOpacity>

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

          {/* ── DEV: Force Offline Toggle ──
              When enabled, the sync scheduler (syncScheduler.ts) skips all remote
              Cloud Function calls. However:
              - Local SQLite reads/writes still work normally
              - Outbox items still get enqueued (they just don't sync)
              - When disabled again, sync resumes and drains the outbox

              This lets you test the full offline-first flow without airplane mode:
              create work orders → see them locally → disable toggle → watch sync  */}
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>DEV Network</Text>
            <DevForceOfflineToggle />
            <Text style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              When enabled, the app saves locally + enqueues outbox, but will not call Cloud Functions.
            </Text>
          </View>

          {/* ── DEV: Wipe Gate Flags ──
              These toggles control whether the startup wipe / outbox clear logic
              in App.tsx actually fires. Both are OFF by default for safety.
              Flipping them here only affects the current session (reset on fresh start). */}
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>DEV: Wipe Gate Flags</Text>
            <DevWipeGateToggles />
            <Text style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Both flags default to OFF. The one-shot DB clear below will not fire unless "Enable Startup Wipe" is ON.
            </Text>
          </View>

          {/* ── DEV: One-Shot DB Clear ──
              Arms a globalThis flag that App.tsx checks on startup. When armed:
              1. Next app restart (or hot-reload) triggers the clear
              2. Wipes outbox + offline_work_orders + work_orders tables
              3. Resets AsyncStorage org.current.id → shows OrgPicker
              4. Auto-disarms immediately so it never fires twice

              REQUIRES devFlags.enableStartupWipe to be ON (see toggles above).

              WHY NOT A DIRECT WIPE HERE:
              Wiping the DB mid-session while hooks are subscribed could cause
              crashes. The one-shot pattern ensures the wipe happens at startup
              before any screens mount. See App.tsx header docs for full explanation. */}
          <View style={{ marginTop: 16, padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.06)" }}>
            <Text style={{ fontWeight: "700", marginBottom: 8 }}>DEV: Clear Local DB</Text>
            <Pressable
              onPress={() => {
                (globalThis as any).__ROADWORK_CLEAR_LOCAL_DB_ON_START__ = true;
                Alert.alert(
                  "Armed ⚠️",
                  "Local DB will be wiped on next app restart.\n\nHot-reload will trigger it.",
                );
                console.log("[DEV] Will clear local DB on next restart");
              }}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.15)",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#dc2626" }}>
                Enable one-time clear on restart
              </Text>
            </Pressable>
            <Pressable
              onPress={() => {
                (globalThis as any).__ROADWORK_CLEAR_LOCAL_DB_ON_START__ = false;
                Alert.alert("Disarmed", "Clear on restart disabled.");
                console.log("[DEV] Clear local DB on start disabled");
              }}
              style={{
                marginTop: 8,
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: "rgba(0,0,0,0.05)",
              }}
            >
              <Text style={{ fontWeight: "700" }}>Disable clear on restart</Text>
            </Pressable>
            <Text style={{ marginTop: 6, opacity: 0.7, fontSize: 12 }}>
              Wipes work_orders, offline_work_orders, outbox, and resets org selection.
            </Text>
          </View>

          {/* Force Crash — Crashlytics smoke test */}
          <View style={{ marginTop: 16 }}>
            <Text style={{ fontWeight: "800", fontSize: 15, marginBottom: 6 }}>
              Crashlytics
            </Text>
            <TouchableOpacity
              onPress={async () => {
                try {
                  const now = await sendCrashlyticsTestEvent({
                    uid: getAuth(getApp()).currentUser?.uid ?? null,
                    orgId: orgId ?? null,
                  });
                  Alert.alert(
                    "Crashlytics Test Sent ✅",
                    `Non-fatal test event recorded at ${now}.\n\nCheck Firebase Console → Crashlytics (it may take a minute to appear).`,
                  );
                } catch (e: any) {
                  Alert.alert(
                    "Crashlytics Test Failed ❌",
                    e?.message ?? String(e),
                  );
                }
              }}
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: "#2563eb",
                borderRadius: 10,
                backgroundColor: "rgba(37,99,235,0.12)",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontWeight: "700", color: "#1d4ed8" }}>
                DEV: Send Crashlytics Test Event
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => forceCrash()}
              style={{
                padding: 12,
                borderWidth: 1,
                borderColor: "#dc2626",
                borderRadius: 10,
                backgroundColor: "rgba(239,68,68,0.15)",
              }}
            >
              <Text style={{ fontWeight: "700", color: "#dc2626" }}>
                DEV: Force Crash (Crashlytics)
              </Text>
            </TouchableOpacity>
            <Text style={{ marginTop: 4, opacity: 0.7, fontSize: 12 }}>
              Triggers a native crash. Verify it appears in Firebase Console → Crashlytics.
            </Text>
          </View>
        </View>
      )}

      <View style={styles.footer}>
        <Text style={styles.footerText}>WayCrew v1.0</Text>
      </View>
    </ScrollView>
  );
}

// DEV-only toggle: wipe gate flags (persisted via DevFlagStore)
function DevWipeGateToggles() {
  const [devFlags, setDevFlags] = useState(DevFlagStore.defaults());

  useEffect(() => {
    let mounted = true;
    if (__DEV__) {
      DevFlagStore.load().then((f) => {
        if (mounted) setDevFlags(f);
      });
    }
    return () => { mounted = false; };
  }, []);

  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <Text>Enable Startup Wipe</Text>
        <Switch
          value={devFlags.enableStartupWipe}
          onValueChange={async (v) => {
            const next = await DevFlagStore.set({ enableStartupWipe: v });
            setDevFlags(next);
            console.log(`[DEV] enableStartupWipe → ${v}`);
          }}
        />
      </View>
      {devFlags.enableStartupWipe ? (
        <Text style={{ marginBottom: 8, color: "#b45309", fontSize: 12, fontWeight: "600" }}>
          ⚠️ Startup wipe enabled. Wipe still requires ARMED flag.
        </Text>
      ) : null}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text>Enable Outbox Clear on Start</Text>
        <Switch
          value={devFlags.enableOutboxClearOnStart}
          onValueChange={async (v) => {
            const next = await DevFlagStore.set({ enableOutboxClearOnStart: v });
            setDevFlags(next);
            console.log(`[DEV] enableOutboxClearOnStart → ${v}`);
          }}
        />
      </View>
    </View>
  );
}

// DEV-only toggle component
function DevForceOfflineToggle() {
  const [devNet, setDevNet] = useState(getDevNetState());
  useEffect(() => {
    const unsub = subscribeDevNet(setDevNet);
    return () => { unsub(); };
  }, []);

  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
      <Text>Force Offline (block sync)</Text>
      <Switch value={devNet.forceOffline} onValueChange={(v) => setForceOffline(v)} />
    </View>
  );
}

// DEV-only: show recent outbox sync errors
function OutboxErrorsPanel({ orgId }: { orgId: string | null }) {
  const [errors, setErrors] = useState<ReturnType<typeof getOutboxErrors>>([]);

  useEffect(() => {
    if (!orgId) return;
    setErrors(getOutboxErrors(orgId, 5));
  }, [orgId]);

  function refresh() {
    if (orgId) setErrors(getOutboxErrors(orgId, 5));
  }

  if (!errors.length) {
    return (
      <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(0,0,0,0.04)" }}>
        <Text style={{ fontWeight: "700", marginBottom: 4 }}>Outbox Errors</Text>
        <Text style={{ opacity: 0.6, fontSize: 12 }}>No failed items</Text>
      </View>
    );
  }

  return (
    <View style={{ padding: 12, borderRadius: 12, backgroundColor: "rgba(239,68,68,0.08)" }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
        <Text style={{ fontWeight: "700" }}>Outbox Errors ({errors.length})</Text>
        <Pressable onPress={refresh}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: "#2563eb" }}>Refresh</Text>
        </Pressable>
      </View>
      {errors.map((e) => (
        <View key={e.id} style={{ marginBottom: 8, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "rgba(0,0,0,0.08)" }}>
          <Text style={{ fontSize: 11, fontWeight: "800" }}>{e.kind} ({e.attempts}x)</Text>
          <Text style={{ fontSize: 11, opacity: 0.7 }} numberOfLines={2}>
            {e.lastError ?? "unknown error"}
          </Text>
          {e.lastAttemptAt ? (
            <Text style={{ fontSize: 10, opacity: 0.5 }}>
              Last attempt: {new Date(e.lastAttemptAt).toLocaleTimeString()}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
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
  previewTitle: {
    marginTop: 10,
    marginBottom: 8,
    fontSize: 12,
    fontWeight: "700",
    color: "#475467",
  },
  previewWrap: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  previewChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  previewChipColorblind: {
    borderWidth: 2,
  },
  previewChipCode: {
    color: "#ffffff",
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  previewChipText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "800",
  },
  profileCard: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fafafa",
    marginBottom: 8,
  },
  profileLabel: {
    fontSize: 13,
    fontWeight: "700",
    color: "#374151",
    marginBottom: 6,
  },
  profileInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  profileMeta: {
    marginTop: 10,
    fontSize: 12,
    color: "#6b7280",
  },
  profileSaveBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  profileSaveBtnDisabled: {
    opacity: 0.6,
  },
  profileSaveBtnText: {
    color: "white",
    fontWeight: "800",
    fontSize: 14,
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
  typeLabelWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flex: 1,
    paddingRight: 8,
  },
  typeSwatch: {
    width: 28,
    height: 28,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  typeSwatchCode: {
    color: "#ffffff",
    fontSize: 9,
    fontWeight: "900",
    letterSpacing: 0.4,
  },
  typeLabel: {
    fontWeight: "700",
    fontSize: 15,
  },
  devInfoCard: {
    marginBottom: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f8fafc",
  },
  devInfoTitle: {
    fontWeight: "700",
    marginBottom: 6,
    color: "#111827",
  },
  devInfoLine: {
    fontSize: 12,
    color: "#374151",
    marginBottom: 2,
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
  exportBtn: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 10,
    backgroundColor: "#eff6ff",
    alignItems: "center" as const,
  },
  exportBtnText: {
    fontWeight: "700" as const,
    color: "#1d4ed8",
    fontSize: 15,
  },
});
