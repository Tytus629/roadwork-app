/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROAD WORK TRACKER - ROOT APP COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DATABASE DIAGNOSTIC BANNER:
 * Shows real-time persistence status at top of app.
 * 
 * WHAT IT SHOWS:
 * - "Persistence: ON (SQLite)" - Database initialized successfully
 * - "Persistence: OFF (In-memory)" - Running without DB (rare failure case)
 * - Error message - Shows why DB failed to initialize
 * 
 * HOW IT WORKS:
 * - Polls isDbReady() every 1 second
 * - Displays getDbInitError() if initialization failed
 * - Blue banner with minimal height (~30px)
 * 
 * WHY IT EXISTS:
 * Created to debug "Work Orders disappear after restart" issue.
 * Gives immediate visibility into persistence layer health.
 * 
 * STYLING:
 * - Light blue background (#f0f9ff)
 * - Bold title, small error text
 * - Truncates long errors to 2 lines
 * 
 * ─── DEV: ONE-SHOT DB CLEAR PATTERN ───────────────────────────────────
 * 
 * WHY globalThis INSTEAD OF A CONSTANT:
 * Previously we had `const CLEAR_ON_LAUNCH = false;` that you'd flip to
 * `true` to wipe the DB. This was dangerous because:
 *   1. Accidental commit of `= true` would silently wipe production data.
 *   2. No UI feedback — you'd only see the effect in logs.
 *   3. Hot-reload would re-trigger the wipe repeatedly.
 * 
 * The globalThis pattern works like this:
 *   1. SettingsScreen DEV section has "Enable one-time clear" button that
 *      sets globalThis.__ROADWORK_CLEAR_LOCAL_DB_ON_START__ = true
 *   2. On next app restart (or hot-reload), the App() useEffect checks it
 *   3. If true: immediately disarms (sets back to false), then wipes all
 *      tables (outbox, offline_work_orders, work_orders) + resets org
 *   4. Single-shot — can never fire twice without explicit re-arming
 *   5. Only runs in __DEV__ mode — production builds always skip
 * 
 * WHAT GETS CLEARED:
 * - outbox (pending sync queue)
 * - offline_work_orders (local-first writes waiting for sync)
 * - work_orders (all cached work orders from Firestore)
 * - user-scoped selected/pending org keys (forces org re-selection for active user context)
 */
import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { NavigationContainer } from "@react-navigation/native";
import { View, Text, StyleSheet, StatusBar } from "react-native";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";

import RootNavigator from "./src/navigation/RootNavigator";
import { SignsProvider } from "./src/state/SignsContext";
import { requestNotificationPermission } from "./src/services/notify";
import { ensureDbSchemaReady } from "./src/db/migrations";
import { dbPing } from "./src/db/db";
import { FilterProvider } from "./src/state/FilterContext";
import { AssetsProvider } from "./src/context/AssetsContext";
import {
  connectToEmulatorsIfDev,
  getEmulatorConnectionInfo,
  getRecommendedMetroHost,
} from "./src/firebase/emulators";
import DeviceInfo from "react-native-device-info";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OrgPickerScreen } from "./src/screens/OrgPickerScreen";
import {
  clearOrgSettings,
  setOrgId as setServiceOrgId,
} from "./src/services/orgSettings";
import { getApp } from "@react-native-firebase/app";
import { OrgProvider, useOrg } from "./src/state/OrgContext";
import { validateMyMembership } from "./src/services/orgJoin";
import Toast, { BaseToast, ErrorToast } from "react-native-toast-message";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { DevFlagStore } from "./src/dev/devFlagStore";
import { initDeviceMeta } from "./src/utils/deviceMeta";
import { initCrashlytics } from "./src/telemetry/crashlytics";
import {
  clearLegacySelectedOrgId,
  clearSelectedOrgId,
  getLastAuthUid,
} from "./src/state/selectedOrg";
import {
  clearLegacyPendingOrgId,
  clearPendingOrgId,
} from "./src/state/pendingOrg";

let dbPreflightDone = false;

function ensureDbPreflightMigrations() {
  if (dbPreflightDone) return;
  try {
    ensureDbSchemaReady("App.preflight");
    dbPreflightDone = true;
    console.log("[DB] Preflight migrations complete");
  } catch (e) {
    console.warn("[DB] Preflight migrations failed", e);
  }
}

// ─── Toast config ────────────────────────────────────────────────────────
const toastConfig = {
  success: (props: any) => (
    <BaseToast
      {...props}
      style={{ borderLeftWidth: 10, elevation: 9999, zIndex: 9999 }}
      contentContainerStyle={{ paddingHorizontal: 16 }}
      text1Style={{ fontSize: 16, fontWeight: "800" }}
      text2Style={{ fontSize: 14 }}
    />
  ),
  error: (props: any) => (
    <ErrorToast
      {...props}
      style={{ borderLeftWidth: 10, elevation: 9999, zIndex: 9999 }}
      text1Style={{ fontSize: 16, fontWeight: "800" }}
      text2Style={{ fontSize: 14 }}
    />
  ),
};

// ─── Firebase init ───────────────────────────────────────────────────────
// @react-native-firebase reads google-services.json (Android) / GoogleService-Info.plist (iOS)
// automatically — no manual initializeApp() needed.
// Connect emulators at module scope, BEFORE any auth calls.
const emulatorInfo = getEmulatorConnectionInfo();
if (__DEV__) {
  console.log("[App][Emulators] Startup config", emulatorInfo);
}
connectToEmulatorsIfDev();
console.log("[Firebase] Native auto-init via google-services.json");
ensureDbPreflightMigrations();

/**
 * RootGate: Determines which screen to show based on auth + org state
 */
function RootGate() {
  const { orgId, ready: orgReady, setOrgId, clearOrgId } = useOrg();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);
  const [orgCheckReady, setOrgCheckReady] = useState(false);

  // Auth state listener
  useEffect(() => {
    try {
      const auth = getAuth(getApp());
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setUser(user);
        setAuthReady(true);
        // Tag Crashlytics with user ID for crash context
        if (user?.uid) {
          initCrashlytics({ uid: user.uid });
        }
      });
      return unsubscribe;
    } catch (e) {
      console.warn("[App] Failed to setup auth listener:", e);
      setAuthReady(true);
    }
  }, []);

  // Never enter main app with a cached org unless this uid is actually a member.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!authReady || !orgReady) {
        if (!cancelled) setOrgCheckReady(false);
        return;
      }

      if (!user || !orgId) {
        if (!cancelled) setOrgCheckReady(true);
        return;
      }

      if (!cancelled) setOrgCheckReady(false);

      try {
        const membership = await validateMyMembership(orgId, user.uid);
        if (!membership.isActive) {
          if (__DEV__) {
            console.log(
              `[RootGate] clearing stale org=${orgId} (membership ${membership.reason})`
            );
          }
          await clearOrgId();
        } else if (__DEV__) {
          console.log(`[RootGate] org restore validated org=${orgId} role=${membership.role ?? "member"}`);
        }
      } catch (e) {
        console.warn("[RootGate] Membership validation failed, clearing cached org", e);
        await clearOrgId();
      } finally {
        if (!cancelled) setOrgCheckReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, orgReady, user?.uid, orgId]);

  // Sync orgId to service settings whenever it changes
  useEffect(() => {
    if (!__DEV__) return;
    if (!authReady || !orgReady || !orgCheckReady) return;
    console.log(
      `[RootGate] settled authUid=${user?.uid ?? "none"} activeOrgId=${orgId ?? "none"} devMode=${emulatorInfo.mode} devHost=${emulatorInfo.selectedHost}`
    );
  }, [authReady, orgReady, orgCheckReady, user?.uid, orgId]);

  useEffect(() => {
    if (orgId) {
      setServiceOrgId(orgId);
    }
  }, [orgId]);

  // Show loading while checking auth and org state
  if (!authReady || !orgReady || !orgCheckReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // Show auth screen if not signed in
  if (!user) {
    return (
      <AuthScreen
        onDone={async (bootstrappedOrgId) => {
          // If bootstrap returned an orgId, save it
          if (bootstrappedOrgId) {
            await setOrgId(bootstrappedOrgId);
          }
        }}
      />
    );
  }

  // Show org picker if signed in but no org selected
  if (!orgId) {
    return <OrgPickerScreen />;
  }

  // Main app - user is authenticated and org is selected
  return (
    <FilterProvider>
      <SignsProvider>
        <AssetsProvider>
          <View style={{ flex: 1 }}>
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </View>
        </AssetsProvider>
      </SignsProvider>
    </FilterProvider>
  );
}

export default function App() {
  useEffect(() => {
    if (!__DEV__) return;
    const isEmulator = DeviceInfo.isEmulatorSync();
    console.log("[App][DEV][runtime]", {
      platform: emulatorInfo.platform,
      mode: emulatorInfo.mode,
      isSimulatorOrEmulator: isEmulator,
      devHost: emulatorInfo.selectedHost,
      functionsTarget: emulatorInfo.functionsTarget,
      firestoreTarget: emulatorInfo.firestoreTarget,
      storageTarget: emulatorInfo.storageTarget,
      metroHostHint: getRecommendedMetroHost(),
      metroPortHint: 8081,
    });
  }, []);

  useEffect(() => {
    async function init() {
      // Initialize SQLite database (op-sqlite)
      try {
        ensureDbPreflightMigrations();
        console.log("[DB] SQLite initialized, ping:", dbPing());

        // Cache device metadata (deviceId + appVersion) for all record creation
        await initDeviceMeta();

        // ── Load persisted DEV flags ──
        if (__DEV__) {
          await DevFlagStore.load();
        }
        const devFlags = DevFlagStore.get();

        // ── DEV ONE-SHOT DB CLEAR ──
        // Armed via: Settings → DEV → "Enable one-time clear on restart"
        // Fires once, then immediately disarms. See header docs for full explanation.
        // Only active in __DEV__ mode AND when devFlags.enableStartupWipe is true.
        // Production builds always skip this block.
        const SHOULD_CLEAR_ON_START =
          __DEV__ &&
          devFlags.enableStartupWipe &&
          (globalThis as any).__ROADWORK_CLEAR_LOCAL_DB_ON_START__ === true;
        if (SHOULD_CLEAR_ON_START) {
          console.log("[DEV] Startup wipe ENABLED — running wipe/reset logic");
          // Disarm immediately — prevents re-firing on subsequent hot-reloads
          (globalThis as any).__ROADWORK_CLEAR_LOCAL_DB_ON_START__ = false;
          try {
            const { db: _db } = require("./src/db/db");
            _db.executeSync("DELETE FROM outbox");
            _db.executeSync("DELETE FROM offline_work_orders");
            _db.executeSync("DELETE FROM work_orders");
            console.log("[CLEAR] Stale outbox + work orders cleared");
          } catch (_e: any) { console.warn("[CLEAR]", _e?.message); }
          try {
            const lastUid = await getLastAuthUid();
            await clearLegacySelectedOrgId();
            await clearLegacyPendingOrgId();
            if (lastUid) {
              await clearSelectedOrgId(lastUid);
              await clearPendingOrgId(lastUid);
              await clearOrgSettings(lastUid);
            }
            console.log("[CLEAR] Org selection reset for active user context");
          } catch (_e2: any) { console.warn("[CLEAR] org reset", _e2?.message); }
        } else if (__DEV__) {
          console.log("[DEV] Startup wipe disabled (safe default)");
        }

        // ── DEV OUTBOX-ONLY CLEAR ──
        if (__DEV__ && devFlags.enableOutboxClearOnStart) {
          console.log("[DEV] Outbox clear ENABLED — clearing outbox only");
          try {
            const { db: _db } = require("./src/db/db");
            _db.executeSync("DELETE FROM outbox");
            console.log("[CLEAR] Outbox cleared (outbox-only mode)");
          } catch (_e: any) { console.warn("[CLEAR] outbox-only", _e?.message); }
        }
        // ── END DEV ONE-SHOT ──

      } catch (e) {
        console.warn("[DB] SQLite init failed:", e);
      }

      // Request notification permissions (Android 13+ requires this)
      try {
        const granted = await requestNotificationPermission();
        console.log("[App] Notification permission:", granted ? "GRANTED" : "DENIED");
      } catch (e) {
        console.warn("[App] Failed to request notification permission:", e);
      }
    }

    init();
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <OrgProvider>
        <RootGate />
      </OrgProvider>

      {/* Toast host: inside SafeAreaProvider, outside OrgProvider/navigation */}
      <Toast
        config={toastConfig}
        position="bottom"
        bottomOffset={110}
        visibilityTime={4000}
      />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({});
