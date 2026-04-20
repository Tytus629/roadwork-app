import notifee, { AndroidImportance } from "@notifee/react-native";
import { Platform } from "react-native";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import {
  collection,
  doc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "@react-native-firebase/firestore";
import { getDeviceMeta } from "../utils/deviceMeta";

let channelCreated = false;
const recentlyShownKeys = new Map<string, number>();

function markShown(key: string): void {
  const now = Date.now();
  recentlyShownKeys.set(key, now);

  if (recentlyShownKeys.size > 200) {
    const cutoff = now - 10 * 60 * 1000;
    for (const [k, ts] of recentlyShownKeys.entries()) {
      if (ts < cutoff) {
        recentlyShownKeys.delete(k);
      }
    }
  }
}

function wasShown(key: string): boolean {
  return recentlyShownKeys.has(key);
}

async function ensureChannel() {
  if (channelCreated) return;
  
  try {
    await notifee.createChannel({
      id: "work-orders",
      name: "Work Orders",
      importance: AndroidImportance.HIGH,
      sound: "default",
    });
    channelCreated = true;
  } catch (e) {
    console.warn("[notify] Failed to create channel:", e);
  }
}

/**
 * Show a local notification for a high/urgent work order
 */
export async function notifyWorkOrderCreated(
  title: string,
  body: string,
  metadata?: {
    workOrderId?: string;
    type?: string;
    priority?: string;
  },
) {
  try {
    console.log("[notify] Creating notification:", title, body);
    await ensureChannel();
    
    const notificationId = await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: "work-orders",
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: "default",
        },
        smallIcon: "ic_launcher",
      },
    });
    console.log("[notify][receive]", {
      source: "local-only",
      title,
      body,
      workOrderId: metadata?.workOrderId ?? null,
      type: metadata?.type ?? null,
      priority: metadata?.priority ?? null,
    });
    console.log("[notify] Notification displayed with ID:", notificationId);
  } catch (e) {
    console.warn("[notify] Failed to display notification:", e);
  }
}

export async function notifyWorkOrderFromRemoteSync(args: {
  workOrderId: string;
  type: string;
  priority: string;
  eventType: "added" | "modified";
  updatedAt: number;
  createdByUid?: string | null;
}): Promise<void> {
  const dedupeKey = `${args.workOrderId}:${args.eventType}:${args.updatedAt}`;
  if (wasShown(dedupeKey)) return;

  markShown(dedupeKey);

  const title = `${String(args.priority).toUpperCase()} Priority Work Order`;
  const body = `${args.type} ${args.eventType === "added" ? "created" : "updated"}`;

  try {
    await ensureChannel();

    const notificationId = await notifee.displayNotification({
      title,
      body,
      android: {
        channelId: "work-orders",
        importance: AndroidImportance.HIGH,
        pressAction: {
          id: "default",
        },
        smallIcon: "ic_launcher",
      },
    });

    console.log("[notify][receive]", {
      source: "remote-sync-derived",
      workOrderId: args.workOrderId,
      type: args.type,
      priority: args.priority,
      eventType: args.eventType,
      updatedAt: args.updatedAt,
      createdByUid: args.createdByUid ?? null,
    });
    console.log("[notify] Notification displayed with ID:", notificationId);
  } catch (e) {
    console.warn("[notify] Failed to display remote-derived notification:", e);
  }
}

export async function registerNotificationDeviceDiagnostics(args: {
  orgId: string;
  uid: string;
}): Promise<void> {
  const { deviceId, appVersion } = getDeviceMeta();
  const safeDeviceId = String(deviceId ?? "unknown").trim() || "unknown";
  const token = `in_app_remote_sync:${safeDeviceId}`;

  try {
    const app = getApp();
    const firestore = getFirestore(app);

    const deviceDoc = doc(
      collection(
        doc(collection(firestore, "orgs"), args.orgId),
        "users",
        args.uid,
        "notificationDevices",
      ),
      safeDeviceId,
    );

    await setDoc(
      deviceDoc,
      {
        orgId: args.orgId,
        uid: args.uid,
        deviceId: safeDeviceId,
        appVersion: appVersion ?? "unknown",
        platform: Platform.OS,
        notificationMode: "in_app_remote_sync",
        pseudoToken: token,
        lastSeenAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );

    console.log("[notify][token-registration-success]", {
      userId: args.uid,
      orgId: args.orgId,
      deviceId: safeDeviceId,
      token,
      mode: "in_app_remote_sync",
    });

    console.log("[notify][token-refresh]", {
      userId: args.uid,
      orgId: args.orgId,
      deviceId: safeDeviceId,
      token,
      reason: "org-session-start",
    });
  } catch (e) {
    console.warn("[notify] Notification device diagnostics registration failed:", e);
  }
}

/**
 * Request notification permissions (iOS primarily, Android auto-grants)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    const uid = getAuth(getApp()).currentUser?.uid ?? null;
    const { deviceId } = getDeviceMeta();
    console.log("[notify][permission]", {
      granted: settings.authorizationStatus >= 1,
      uid,
      deviceId: deviceId ?? null,
    });
    return settings.authorizationStatus >= 1; // AUTHORIZED or PROVISIONAL
  } catch (e) {
    console.warn("[notify] Failed to request permission:", e);
    return false;
  }
}
