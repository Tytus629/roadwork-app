import { getApp, getApps } from "@react-native-firebase/app";
import { getAuth, connectAuthEmulator } from "@react-native-firebase/auth";
import { getFirestore, connectFirestoreEmulator } from "@react-native-firebase/firestore";
import { getFunctions, connectFunctionsEmulator } from "@react-native-firebase/functions";
import { getStorage, connectStorageEmulator } from "@react-native-firebase/storage";

let emulatorsConnected = false;

export function connectToEmulatorsIfDev() {
  if (!__DEV__) return;

  // Only connect once (prevent issues with hot reload)
  if (emulatorsConnected) {
    console.log("[Firebase] Emulators already connected");
    return;
  }

  // Check if Firebase is initialized
  if (getApps().length === 0) {
    console.warn("[Firebase] Cannot connect to emulators - Firebase not initialized yet");
    return;
  }

  // IMPORTANT:
  // Android emulator uses 10.0.2.2 to reach your host machine.
  // Physical device on same Wi-Fi needs your PC LAN IP (e.g., 192.168.1.50).
  // Using LAN IP for physical device connection:
  const host = "192.168.1.37"; // Your PC's LAN IP

  try {
    const app = getApp();
    const auth = getAuth(app);
    const firestore = getFirestore(app);
    const functions = getFunctions(app);
    const storage = getStorage(app);

    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(firestore, host, 8080);
    connectFunctionsEmulator(functions, host, 5001);
    connectStorageEmulator(storage, host, 9199);
    
    emulatorsConnected = true;
    console.log(`[Firebase] Connected to emulators at ${host}`);
  } catch (e) {
    console.warn("[Firebase] Failed to connect to emulators:", e);
  }
}
