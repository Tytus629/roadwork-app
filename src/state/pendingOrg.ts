/**
 * pendingOrg.ts
 *
 * AsyncStorage helpers for "pending join" state.
 * Written when a user submits a join request; cleared when membership is
 * confirmed or the request is cancelled.
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";

const LEGACY_KEY = "org.pending.id";
const USER_KEY_PREFIX = "org.pending.id.uid:";

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

export async function getPendingOrgId(uid?: string | null): Promise<string | null> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return null;
  try {
    return await AsyncStorage.getItem(keyForUid(safeUid));
  } catch {
    return null;
  }
}

export async function setPendingOrgId(orgId: string, uid?: string | null): Promise<void> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) throw new Error("setPendingOrgId requires an authenticated uid.");
  await AsyncStorage.setItem(keyForUid(safeUid), orgId);
}

export async function clearPendingOrgId(uid?: string | null): Promise<void> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return;
  await AsyncStorage.removeItem(keyForUid(safeUid));
}

export async function clearLegacyPendingOrgId(): Promise<void> {
  await AsyncStorage.removeItem(LEGACY_KEY);
}
