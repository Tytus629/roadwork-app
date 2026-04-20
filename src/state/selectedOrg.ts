import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";

// Legacy global key (pre user-scoping).
const LEGACY_KEY = "org.current.id";
const USER_KEY_PREFIX = "org.current.id.uid:";
const LAST_SIGNED_IN_UID_KEY = "auth.lastSignedInUid";
const LEGACY_LAST_AUTH_UID_KEY = "auth.last.uid";

function currentUidOrNull() {
  try {
    return getAuth(getApp()).currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function keyForUid(uid: string) {
  return `${USER_KEY_PREFIX}${uid}`;
}

export async function getSelectedOrgId(uid?: string | null) {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return null;
  return AsyncStorage.getItem(keyForUid(safeUid));
}

export async function setSelectedOrgId(orgId: string, uid?: string | null) {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) throw new Error("setSelectedOrgId requires an authenticated uid.");
  await AsyncStorage.setItem(keyForUid(safeUid), orgId);
}

export async function clearSelectedOrgId(uid?: string | null) {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return;
  await AsyncStorage.removeItem(keyForUid(safeUid));
}

export async function getLegacySelectedOrgId() {
  return AsyncStorage.getItem(LEGACY_KEY);
}

export async function clearLegacySelectedOrgId() {
  await AsyncStorage.removeItem(LEGACY_KEY);
}

export async function getLastAuthUid(): Promise<string | null> {
  const current = await AsyncStorage.getItem(LAST_SIGNED_IN_UID_KEY);
  if (current) return current;
  // Backward compatibility for older builds.
  return AsyncStorage.getItem(LEGACY_LAST_AUTH_UID_KEY);
}

export async function setLastAuthUid(uid: string | null): Promise<void> {
  if (!uid) {
    await AsyncStorage.multiRemove([LAST_SIGNED_IN_UID_KEY, LEGACY_LAST_AUTH_UID_KEY]);
    return;
  }
  await AsyncStorage.setItem(LAST_SIGNED_IN_UID_KEY, uid);
  await AsyncStorage.removeItem(LEGACY_LAST_AUTH_UID_KEY);
}
