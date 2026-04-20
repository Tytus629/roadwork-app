import { getApp, getApps } from "@react-native-firebase/app";
import {
  getAuth,
  getIdToken,
  signOut,
  connectAuthEmulator,
} from "@react-native-firebase/auth";
import {
  getFirestore,
  connectFirestoreEmulator,
} from "@react-native-firebase/firestore";
import {
  getFunctions,
  connectFunctionsEmulator,
} from "@react-native-firebase/functions";
import {
  getStorage,
  connectStorageEmulator,
} from "@react-native-firebase/storage";
import { Platform } from "react-native";
import DeviceInfo from "react-native-device-info";

let _didConnect = false;
let _emulatorHost = "localhost";

/**
 * Dev-only emulator toggle.
 *
 * Recommended:
 * - true while you are actively using the local emulator suite
 * - false when you want debug builds to hit the real Firebase project
 *
 * Release builds still will NOT use emulators because of the __DEV__ guard.
 */
const ENABLE_FIREBASE_EMULATORS = true;

type AndroidDevClientMode =
  | "android_emulator"
  | "android_device_usb_or_lan";

type AndroidDeviceHostStrategy = "lan" | "adb_reverse_localhost";
type IOSDeviceHostStrategy = "lan" | "localhost_tunneled";

type ResolvedDevConnection = {
  enabled: boolean;
  platform: string;
  mode:
    | AndroidDevClientMode
    | "ios_simulator"
    | "ios_device_usb_or_lan"
    | "ios_or_other";
  selectedHost: string;
  adbReverseAssumed: boolean;
  authUrl: string;
  firestoreTarget: string;
  functionsTarget: string;
  storageTarget: string;
};

/**
 * DEV host-mode defaults. Keep these values explicit for two-client testing.
 *
 * android_emulator:
 * - Uses 10.0.2.2 to reach services on the host machine.
 *
 * android_device_usb_or_lan:
 * - "lan": use your host machine LAN IP (set DEV_ANDROID_DEVICE_LAN_HOST)
 * - "adb_reverse_localhost": use 127.0.0.1 and run adb reverse for all emulator ports
 */
const DEV_ANDROID_MODE_DEFAULT: "auto" | AndroidDevClientMode = "auto";
const DEV_ANDROID_EMULATOR_HOST = "10.0.2.2";
const DEV_ANDROID_DEVICE_HOST_STRATEGY: AndroidDeviceHostStrategy = "lan";
const DEV_ANDROID_DEVICE_LAN_HOST = "192.168.1.37";

const DEV_IOS_SIMULATOR_HOST = "localhost";
const DEV_IOS_DEVICE_HOST_STRATEGY: IOSDeviceHostStrategy = "lan";
const DEV_IOS_DEVICE_LAN_HOST = "192.168.1.37";

function detectAndroidEmulatorHeuristic(): boolean {
  const constants = (Platform.constants ?? {}) as Record<string, unknown>;
  const bag = [
    constants["Model"],
    constants["model"],
    constants["Brand"],
    constants["brand"],
    constants["Fingerprint"],
    constants["fingerprint"],
    constants["Manufacturer"],
    constants["manufacturer"],
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");

  return (
    bag.includes("sdk") ||
    bag.includes("emulator") ||
    bag.includes("generic") ||
    bag.includes("goldfish") ||
    bag.includes("ranchu") ||
    bag.includes("google_sdk")
  );
}

function resolveAndroidMode(): AndroidDevClientMode {
  const overrideMode = String(
    (globalThis as any).__WAYCREW_DEV_ANDROID_MODE__ ?? ""
  ).trim();

  if (overrideMode === "android_emulator") return "android_emulator";
  if (overrideMode === "android_device_usb_or_lan") {
    return "android_device_usb_or_lan";
  }

  if (DEV_ANDROID_MODE_DEFAULT === "android_emulator") return "android_emulator";
  if (DEV_ANDROID_MODE_DEFAULT === "android_device_usb_or_lan") {
    return "android_device_usb_or_lan";
  }

  return detectAndroidEmulatorHeuristic()
    ? "android_emulator"
    : "android_device_usb_or_lan";
}

function resolveDevConnection(hostOverride?: string): ResolvedDevConnection {
  const explicitHost = String(hostOverride ?? "").trim();

  if (!__DEV__ || !ENABLE_FIREBASE_EMULATORS) {
    const selectedHost = explicitHost || "localhost";
    return {
      enabled: false,
      platform: Platform.OS,
      mode: "ios_or_other",
      selectedHost,
      adbReverseAssumed: false,
      authUrl: `http://${selectedHost}:9099`,
      firestoreTarget: `${selectedHost}:8080`,
      functionsTarget: `${selectedHost}:5001`,
      storageTarget: `${selectedHost}:9199`,
    };
  }

  let mode: ResolvedDevConnection["mode"] = "ios_or_other";
  let selectedHost = explicitHost || "localhost";
  let adbReverseAssumed = false;

  if (!explicitHost && Platform.OS === "android") {
    mode = resolveAndroidMode();

    if (mode === "android_emulator") {
      selectedHost = DEV_ANDROID_EMULATOR_HOST;
      adbReverseAssumed = false;
    } else {
      if (DEV_ANDROID_DEVICE_HOST_STRATEGY === "adb_reverse_localhost") {
        selectedHost = "127.0.0.1";
        adbReverseAssumed = true;
      } else {
        selectedHost = DEV_ANDROID_DEVICE_LAN_HOST;
        adbReverseAssumed = false;
      }
    }
  } else if (!explicitHost && Platform.OS === "ios") {
    const isSimulator = DeviceInfo.isEmulatorSync();
    mode = isSimulator ? "ios_simulator" : "ios_device_usb_or_lan";

    if (isSimulator) {
      selectedHost = DEV_IOS_SIMULATOR_HOST;
      adbReverseAssumed = false;
    } else {
      if (DEV_IOS_DEVICE_HOST_STRATEGY === "localhost_tunneled") {
        selectedHost = "127.0.0.1";
        adbReverseAssumed = true;
      } else {
        selectedHost = DEV_IOS_DEVICE_LAN_HOST;
        adbReverseAssumed = false;
      }
    }
  }

  return {
    enabled: true,
    platform: Platform.OS,
    mode,
    selectedHost,
    adbReverseAssumed,
    authUrl: `http://${selectedHost}:9099`,
    firestoreTarget: `${selectedHost}:8080`,
    functionsTarget: `${selectedHost}:5001`,
    storageTarget: `${selectedHost}:9199`,
  };
}

/**
 * Connect Firebase services to the local Emulator Suite in development.
 *
 * host examples:
 * - "10.0.2.2" for Android Studio emulator
 * - your PC LAN IP for a physical Android phone
 * - "localhost" for local desktop-style testing where applicable
 */
export function connectToEmulatorsIfDev(hostOverride?: string) {
  const resolved = resolveDevConnection(hostOverride);

  if (!__DEV__) {
    return;
  }

  if (!ENABLE_FIREBASE_EMULATORS) {
    console.log("[Emulators] Skipped (ENABLE_FIREBASE_EMULATORS=false)");
    return;
  }

  if (_didConnect) {
    console.log("[Emulators] Already connected");
    return;
  }

  _emulatorHost = resolved.selectedHost;

  if (getApps().length === 0) {
    console.warn("[Emulators] Firebase not initialized yet");
    return;
  }

  try {
    const app = getApp();

    // Pull projectId from the actual native Firebase app config
    const projectId =
      (app as any)?.options?.projectId ||
      (app as any)?._options?.projectId ||
      "";

    if (!projectId) {
      console.warn("[Emulators] Missing projectId on Firebase app config");
    }

    // Auth FIRST
    const authInst = getAuth(app);
    connectAuthEmulator(authInst, resolved.authUrl, {
      disableWarnings: true,
    });

    connectFirestoreEmulator(getFirestore(app), resolved.selectedHost, 8080);
    connectFunctionsEmulator(getFunctions(app), resolved.selectedHost, 5001);
    connectStorageEmulator(getStorage(app), resolved.selectedHost, 9199);

    _didConnect = true;
    console.log("[Emulators] Connected", {
      enabled: resolved.enabled,
      platform: resolved.platform,
      mode: resolved.mode,
      host: resolved.selectedHost,
      adbReverseAssumed: resolved.adbReverseAssumed,
      authUrl: resolved.authUrl,
      firestoreTarget: resolved.firestoreTarget,
      functionsTarget: resolved.functionsTarget,
      storageTarget: resolved.storageTarget,
    });

    // One-shot sanity check to confirm the phone can reach the Functions emulator.
    // Only runs in DEV + when emulators are enabled.
    (async () => {
      try {
        if (!projectId) {
          console.warn("[Emulators] Ping skipped: projectId unavailable");
          return;
        }

        const url = `http://${resolved.selectedHost}:5001/${projectId}/us-central1/roadwork_devBootstrapOrg`;

        let token: string | null = null;
        try {
          const user = getAuth(app).currentUser;
          token = user ? await getIdToken(user) : null;
        } catch (authErr: any) {
          console.warn(
            "[Emulators] Auth token stale, signing out:",
            authErr?.code ?? authErr?.message
          );
          try {
            await signOut(getAuth(app));
          } catch {
            // intentional
          }
        }

        const resp = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ data: { name: "PING_FROM_MOBILE" } }),
        });

        const json = await resp.json().catch(() => null);

        if (resp.ok) {
          console.log(
            "[Emulators] Functions ping OK",
            resp.status,
            json?.result ?? json
          );
        } else {
          console.warn(
            "[Emulators] Functions ping returned",
            resp.status,
            json
          );
        }
      } catch (pingErr: any) {
        console.error(
          "[Emulators] Functions ping FAILED",
          pingErr?.message ?? String(pingErr)
        );
      }
    })();
  } catch (e) {
    console.warn("[Emulators] Failed:", e);
  }
}

export function getEmulatorHost(): string {
  return _emulatorHost;
}

export function getEmulatorConnectionInfo(hostOverride?: string): ResolvedDevConnection {
  return resolveDevConnection(hostOverride);
}

export function getRecommendedMetroHost(hostOverride?: string): string {
  return resolveDevConnection(hostOverride).selectedHost;
}
