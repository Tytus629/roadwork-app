import notifee, { AndroidImportance } from "@notifee/react-native";

let channelCreated = false;

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
export async function notifyWorkOrderCreated(title: string, body: string) {
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
    console.log("[notify] Notification displayed with ID:", notificationId);
  } catch (e) {
    console.warn("[notify] Failed to display notification:", e);
  }
}

/**
 * Request notification permissions (iOS primarily, Android auto-grants)
 */
export async function requestNotificationPermission(): Promise<boolean> {
  try {
    const settings = await notifee.requestPermission();
    return settings.authorizationStatus >= 1; // AUTHORIZED or PROVISIONAL
  } catch (e) {
    console.warn("[notify] Failed to request permission:", e);
    return false;
  }
}
