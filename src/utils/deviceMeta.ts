// src/utils/deviceMeta.ts
//
// Cached device metadata (deviceId + appVersion).
// Call initDeviceMeta() once at app startup, then use getDeviceMeta() synchronously.

import DeviceInfo from "react-native-device-info";

let _deviceId: string | null = null;
let _appVersion: string | null = null;

/**
 * Call once at app startup (awaitable).
 * Caches deviceId + appVersion so later calls are synchronous.
 */
export async function initDeviceMeta() {
  try {
    _deviceId = await DeviceInfo.getUniqueId();
  } catch {
    _deviceId = "unknown";
  }
  try {
    _appVersion = `${DeviceInfo.getVersion()} (${DeviceInfo.getBuildNumber()})`;
  } catch {
    _appVersion = "unknown";
  }
}

/**
 * Synchronous accessor — returns cached values.
 * Returns nulls if initDeviceMeta() hasn't been called yet.
 */
export function getDeviceMeta(): { deviceId: string | null; appVersion: string | null } {
  return { deviceId: _deviceId, appVersion: _appVersion };
}
