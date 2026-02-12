import { Platform } from "react-native";
import { PERMISSIONS, request, RESULTS } from "react-native-permissions";

export type LocationFix = {
  lat: number;
  lng: number;
  accuracyM?: number;
};

export async function requestLocationPermission(): Promise<boolean> {
  const perm =
    Platform.OS === "android"
      ? PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION
      : PERMISSIONS.IOS.LOCATION_WHEN_IN_USE;

  const res = await request(perm);
  return res === RESULTS.GRANTED || res === RESULTS.LIMITED;
}

export async function getOneLocationFix(timeoutMs = 7000): Promise<LocationFix | null> {
  // Use built-in geolocation if available (RN has it on some setups) — simplest for now.
  // If your RN build doesn't include navigator.geolocation, we'll swap to react-native-geolocation-service in Step D.
  return new Promise((resolve) => {
    const geo = (globalThis as any).navigator?.geolocation;
    if (!geo) return resolve(null);

    geo.getCurrentPosition(
      (pos: any) => {
        resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracyM: pos.coords.accuracy,
        });
      },
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}
