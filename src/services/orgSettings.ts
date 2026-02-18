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

const KEY_ORG_ID = "org.current.id";
const KEY_ORG_NAME = "org.current.name";

export type OrgSettings = {
  orgId: string | null;
  orgName: string | null;
};

/**
 * Get the current organization ID
 * Returns null if not configured
 */
export async function getOrgId(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_ORG_ID);
  } catch {
    return null;
  }
}

/**
 * Get the current organization name
 */
export async function getOrgName(): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(KEY_ORG_NAME);
  } catch {
    return null;
  }
}

/**
 * Get full org settings
 */
export async function getOrgSettings(): Promise<OrgSettings> {
  const [orgId, orgName] = await Promise.all([getOrgId(), getOrgName()]);
  return { orgId, orgName };
}

/**
 * Set the current organization
 */
export async function setOrgId(orgId: string, orgName?: string): Promise<void> {
  await AsyncStorage.setItem(KEY_ORG_ID, orgId);
  if (orgName) {
    await AsyncStorage.setItem(KEY_ORG_NAME, orgName);
  }
}

/**
 * Clear org settings (logout scenario)
 */
export async function clearOrgSettings(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_ORG_ID, KEY_ORG_NAME]);
}
