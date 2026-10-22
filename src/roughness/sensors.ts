/**
 * sensors.ts — thin adapter over react-native-sensors + geolocation so the
 * rest of Drive Mode stays platform-free. Requests ~100 Hz (10 ms); the OS may
 * deliver less (Android caps non-privileged apps at 200 Hz, iOS ~100 Hz).
 */
import { accelerometer, gyroscope, setUpdateIntervalForType, SensorTypes } from "react-native-sensors";
import Geolocation from "@react-native-community/geolocation";
import type { GpsFix, Vec3 } from "./signal";
import { G } from "./signal";

export type SensorHandlers = {
  onAccel: (t: number, a: Vec3) => void;
  onGyro: (g: Vec3) => void;
  onFix: (f: GpsFix) => void;
  onError?: (msg: string) => void;
};

export function startDriveSensors(h: SensorHandlers, intervalMs = 10): () => void {
  setUpdateIntervalForType(SensorTypes.accelerometer, intervalMs);
  setUpdateIntervalForType(SensorTypes.gyroscope, intervalMs);
  // iOS reports accelerometer in g; Android in m/s^2.
  const { Platform } = require("react-native");
  const scale = Platform.OS === "ios" ? G : 1;
  const accSub = accelerometer.subscribe({
    next: ({ x, y, z }) => h.onAccel(Date.now(), { x: x * scale, y: y * scale, z: z * scale }),
    error: () => h.onError?.("Accelerometer unavailable on this device."),
  });
  const gyroSub = gyroscope.subscribe({
    next: ({ x, y, z }) => h.onGyro({ x, y, z }),
    error: () => h.onError?.("Gyroscope unavailable; mount check will use tilt only."),
  });
  const watchId = Geolocation.watchPosition(
    (pos) =>
      h.onFix({
        t: pos.timestamp ?? Date.now(),
        lat: pos.coords.latitude,
        lng: pos.coords.longitude,
        speedMps: pos.coords.speed != null && pos.coords.speed >= 0 ? pos.coords.speed : null,
        accuracyM: pos.coords.accuracy,
      }),
    (err) => h.onError?.(`GPS: ${err?.message ?? "unavailable"}`),
    { enableHighAccuracy: true, distanceFilter: 0, interval: 1000, fastestInterval: 500 } as any
  );
  return () => {
    accSub.unsubscribe();
    gyroSub.unsubscribe();
    Geolocation.clearWatch(watchId);
  };
}
