/**
 * orgSettings.ts
 *
 * PURPOSE:
 * Manage organization settings stored locally.
 * Provides the orgId needed for Firebase operations.
 *
 * USAGE:
 * await setOrgId("my-org-id") - Set the current org
 * const orgId = await getOrgId() - Get current org (may be null if not set)
 */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";

const LEGACY_KEY_ORG_ID = "org.current.id";
const LEGACY_KEY_ORG_NAME = "org.current.name";
const USER_KEY_ORG_ID_PREFIX = "org.current.id.uid:";
const USER_KEY_ORG_NAME_PREFIX = "org.current.name.uid:";

export type OrgSettings = {
  orgId: string | null;
  orgName: string | null;
};

function currentUidOrNull() {
  try {
    return getAuth(getApp()).currentUser?.uid ?? null;
  } catch {
    return null;
  }
}

function keyOrgId(uid: string) {
  return `${USER_KEY_ORG_ID_PREFIX}${uid}`;
}

function keyOrgName(uid: string) {
  return `${USER_KEY_ORG_NAME_PREFIX}${uid}`;
}

/**
 * Get the current organization ID
 * Returns null if not configured
 */
export async function getOrgId(uid?: string | null): Promise<string | null> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return null;
  try {
    return await AsyncStorage.getItem(keyOrgId(safeUid));
  } catch {
    return null;
  }
}

/**
 * Get the current organization name
 */
export async function getOrgName(uid?: string | null): Promise<string | null> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return null;
  try {
    return await AsyncStorage.getItem(keyOrgName(safeUid));
  } catch {
    return null;
  }
}

/**
 * Get full org settings
 */
export async function getOrgSettings(uid?: string | null): Promise<OrgSettings> {
  const [orgId, orgName] = await Promise.all([getOrgId(uid), getOrgName(uid)]);
  return { orgId, orgName };
}

/**
 * Set the current organization
 */
export async function setOrgId(orgId: string, orgName?: string, uid?: string | null): Promise<void> {
  const safeUid = uid ?? currentUidOrNull();
  if (!safeUid) return;
  await AsyncStorage.setItem(keyOrgId(safeUid), orgId);
  if (orgName) {
    await AsyncStorage.setItem(keyOrgName(safeUid), orgName);
  }
}

/**
 * Clear org settings (logout scenario)
 */
export async function clearOrgSettings(uid?: string | null): Promise<void> {
  const safeUid = uid ?? currentUidOrNull();
  if (safeUid) {
    await AsyncStorage.multiRemove([keyOrgId(safeUid), keyOrgName(safeUid)]);
  }
  await AsyncStorage.multiRemove([LEGACY_KEY_ORG_ID, LEGACY_KEY_ORG_NAME]);
}
