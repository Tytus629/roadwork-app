/**
 * firebase.ts
 *
 * PURPOSE:
 * Firebase service layer for cloud sync and authentication.
 * Manages sign deduplication with Firestore using geohash-based spatial queries.
 *
 * KEY RESPONSIBILITIES:
 * - Initialize Firebase app, auth, firestore, and crashlytics
 * - Upsert signs for work orders (dedupe or create new)
 * - Geohash-based sign lookup for merge detection
 * - Auth helpers for organization membership
 *
 * SIGN DEDUPLICATION STRATEGY:
 * - Search radius: ~30ft to account for GPS variance
 * - Merge radius: 5ft (strict match required)
 * - Uses geohash for efficient spatial queries
 * - Manual merge in admin UI for edge cases
 *
 * DATA MODEL (Firestore):
 * orgs/{orgId}/signs/{signId}:
 *   - code: string (MUTCD code, e.g., "R1-1")
 *   - name: string (e.g., "STOP")
 *   - category: string (Regulatory, Warning, etc.)
 *   - lat: number
 *   - lng: number
 *   - geohash: string (for spatial queries)
 *   - createdAt: timestamp
 *   - updatedAt: timestamp
 *   - workOrderIds: string[] (linked work orders)
 */

import auth from "@react-native-firebase/auth";
import firestore, {
  FirebaseFirestoreTypes,
} from "@react-native-firebase/firestore";
// TODO: Re-enable when google-services.json is added
// import crashlytics from "@react-native-firebase/crashlytics";

// ============================================================================
// GEOHASH UTILITIES
// ============================================================================

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

/**
 * Encode lat/lng to geohash string
 * Precision 9 gives ~4.77m accuracy - good for sign deduplication
 */
export function encodeGeohash(
  lat: number,
  lng: number,
  precision: number = 9
): string {
  const latRange = [-90.0, 90.0];
  const lngRange = [-180.0, 180.0];
  let hash = "";
  let bit = 0;
  let ch = 0;
  let isEven = true;

  while (hash.length < precision) {
    if (isEven) {
      const mid = (lngRange[0] + lngRange[1]) / 2;
      if (lng >= mid) {
        // eslint-disable-next-line no-bitwise
        ch = ch | (1 << (4 - bit));
        lngRange[0] = mid;
      } else {
        lngRange[1] = mid;
      }
    } else {
      const mid = (latRange[0] + latRange[1]) / 2;
      if (lat >= mid) {
        // eslint-disable-next-line no-bitwise
        ch = ch | (1 << (4 - bit));
        latRange[0] = mid;
      } else {
        latRange[1] = mid;
      }
    }
    isEven = !isEven;
    if (bit < 4) {
      bit++;
    } else {
      hash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return hash;
}

/**
 * Get neighboring geohash cells for broader search
 * Used to handle signs near cell boundaries
 */
export function getGeohashNeighbors(geohash: string): string[] {
  // For simplicity, returns prefix-based range for the search
  // In production, would compute actual neighbor hashes
  const prefix = geohash.substring(0, 7); // ~150m precision for search
  return [prefix];
}

/**
 * Calculate distance between two points in feet
 * Uses Haversine formula
 */
export function distanceFeet(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 20902231; // Earth radius in feet
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** Strict merge threshold - only merge if within 5ft */
const MERGE_RADIUS_FT = 5;

/** Search radius accounts for GPS variance (10-30ft typical) */
const SEARCH_RADIUS_FT = 50;

// ============================================================================
// TYPES
// ============================================================================

export type SignInfo = {
  code: string; // MUTCD code (e.g., "R1-1")
  name: string; // Display name (e.g., "STOP")
  category: string; // Regulatory, Warning, Guide, etc.
};

export type FirestoreSign = SignInfo & {
  lat: number;
  lng: number;
  geohash: string;
  createdAt: FirebaseFirestoreTypes.Timestamp;
  updatedAt: FirebaseFirestoreTypes.Timestamp;
  workOrderIds: string[];
};

export type UpsertSignResult = {
  signId: string;
  isNew: boolean;
  mergedWith?: string; // If merged with existing sign
};

// ============================================================================
// AUTH HELPERS
// ============================================================================

/**
 * Get current authenticated user
 */
export function getCurrentUser() {
  return auth().currentUser;
}

/**
 * Get current user's ID token for API calls
 */
export async function getIdToken(): Promise<string | null> {
  const user = auth().currentUser;
  if (!user) return null;
  return user.getIdToken();
}

/**
 * Sign in anonymously (for development/testing)
 */
export async function signInAnonymously() {
  return auth().signInAnonymously();
}

/**
 * Sign out current user
 */
export async function signOut() {
  return auth().signOut();
}

/**
 * Listen to auth state changes
 */
export function onAuthStateChanged(
  callback: (user: ReturnType<typeof getCurrentUser>) => void
) {
  return auth().onAuthStateChanged(callback);
}

// ============================================================================
// CRASHLYTICS
// ============================================================================

/**
 * Log error to Crashlytics
 * TODO: Re-enable when google-services.json is added
 */
export function logError(error: Error, context?: Record<string, string>) {
  console.error("[Firebase] Error:", error, context);
  // if (context) {
  //   Object.entries(context).forEach(([key, value]) => {
  //     crashlytics().setAttribute(key, value);
  //   });
  // }
  // crashlytics().recordError(error);
}

/**
 * Set user ID for crash reports
 * TODO: Re-enable when google-services.json is added
 */
export function setCrashlyticsUserId(userId: string) {
  console.log("[Firebase] Set user ID:", userId);
  // crashlytics().setUserId(userId);
}

// ============================================================================
// SIGN MANAGEMENT
// ============================================================================

/**
 * Upsert a sign for a work order
 *
 * This function handles sign deduplication:
 * 1. Searches for existing signs within search radius (~50ft)
 * 2. If exact match found (same code, within 5ft), links work order to existing sign
 * 3. If no match, creates new sign document
 *
 * @param orgId - Organization ID
 * @param signInfo - Sign code, name, and category
 * @param lat - Latitude
 * @param lng - Longitude
 * @param workOrderId - Local work order ID to link
 * @returns signId and whether it was newly created or merged
 */
export async function upsertSignForWorkOrder(
  orgId: string,
  signInfo: SignInfo,
  lat: number,
  lng: number,
  workOrderId?: string
): Promise<UpsertSignResult> {
  const signsRef = firestore().collection("orgs").doc(orgId).collection("signs");
  const geohash = encodeGeohash(lat, lng);
  const searchPrefix = geohash.substring(0, 7); // ~150m precision for search

  try {
    // Search for nearby signs with matching code
    const candidatesSnapshot = await signsRef
      .where("geohash", ">=", searchPrefix)
      .where("geohash", "<=", searchPrefix + "\uf8ff")
      .where("code", "==", signInfo.code)
      .get();

    let bestMatchId: string | null = null;
    let bestMatchDistance: number = Infinity;

    // Find closest matching sign within merge radius
    candidatesSnapshot.docs.forEach((doc) => {
      const data = doc.data() as FirestoreSign;
      const dist = distanceFeet(lat, lng, data.lat, data.lng);

      if (dist <= MERGE_RADIUS_FT && dist < bestMatchDistance) {
        bestMatchId = doc.id;
        bestMatchDistance = dist;
      }
    });

    if (bestMatchId) {
      // Merge: Link work order to existing sign
      if (workOrderId) {
        await signsRef.doc(bestMatchId).update({
          updatedAt: firestore.FieldValue.serverTimestamp(),
          workOrderIds: firestore.FieldValue.arrayUnion(workOrderId),
        });
      }

      return {
        signId: bestMatchId,
        isNew: false,
        mergedWith: bestMatchId,
      };
    }

    // No match: Create new sign
    const newSignRef = signsRef.doc();
    const newSign: Omit<FirestoreSign, "createdAt" | "updatedAt"> & {
      createdAt: FirebaseFirestoreTypes.FieldValue;
      updatedAt: FirebaseFirestoreTypes.FieldValue;
    } = {
      ...signInfo,
      lat,
      lng,
      geohash,
      createdAt: firestore.FieldValue.serverTimestamp(),
      updatedAt: firestore.FieldValue.serverTimestamp(),
      workOrderIds: workOrderId ? [workOrderId] : [],
    };

    await newSignRef.set(newSign);

    return {
      signId: newSignRef.id,
      isNew: true,
    };
  } catch (error) {
    logError(error as Error, { orgId, signCode: signInfo.code });
    throw error;
  }
}

/**
 * Get signs near a location
 *
 * @param orgId - Organization ID
 * @param lat - Latitude
 * @param lng - Longitude
 * @param radiusFt - Search radius in feet (default: 50ft)
 */
export async function getSignsNear(
  orgId: string,
  lat: number,
  lng: number,
  radiusFt: number = SEARCH_RADIUS_FT
): Promise<Array<FirestoreSign & { id: string; distanceFt: number }>> {
  const signsRef = firestore().collection("orgs").doc(orgId).collection("signs");
  const geohash = encodeGeohash(lat, lng);
  const searchPrefix = geohash.substring(0, 6); // Broader search for listing

  const snapshot = await signsRef
    .where("geohash", ">=", searchPrefix)
    .where("geohash", "<=", searchPrefix + "\uf8ff")
    .get();

  const results: Array<FirestoreSign & { id: string; distanceFt: number }> = [];

  snapshot.docs.forEach((doc) => {
    const data = doc.data() as FirestoreSign;
    const dist = distanceFeet(lat, lng, data.lat, data.lng);

    if (dist <= radiusFt) {
      results.push({
        id: doc.id,
        ...data,
        distanceFt: dist,
      });
    }
  });

  // Sort by distance
  results.sort((a, b) => a.distanceFt - b.distanceFt);

  return results;
}

/**
 * Get a sign by ID
 */
export async function getSign(
  orgId: string,
  signId: string
): Promise<(FirestoreSign & { id: string }) | null> {
  const doc = await firestore()
    .collection("orgs")
    .doc(orgId)
    .collection("signs")
    .doc(signId)
    .get();

  if (!doc.exists()) return null;

  return {
    id: doc.id,
    ...(doc.data() as FirestoreSign),
  };
}

/**
 * Update sign information
 */
export async function updateSign(
  orgId: string,
  signId: string,
  updates: Partial<SignInfo>
): Promise<void> {
  await firestore()
    .collection("orgs")
    .doc(orgId)
    .collection("signs")
    .doc(signId)
    .update({
      ...updates,
      updatedAt: firestore.FieldValue.serverTimestamp(),
    });
}

// ============================================================================
// ORG MEMBERSHIP (Foundation for Backend Step A)
// ============================================================================

export type OrgRole = "viewer" | "member" | "admin" | "owner";

export type OrgMember = {
  uid: string;
  email?: string;
  displayName?: string;
  role: OrgRole;
  joinedAt: FirebaseFirestoreTypes.Timestamp;
};

/**
 * Check if current user is a member of an organization
 */
export async function isOrgMember(orgId: string): Promise<boolean> {
  const user = getCurrentUser();
  if (!user) return false;

  const memberDoc = await firestore()
    .collection("orgs")
    .doc(orgId)
    .collection("members")
    .doc(user.uid)
    .get();

  // Note: exists() is a method in react-native-firebase
  return memberDoc.exists();
}

/**
 * Get current user's role in an organization
 */
export async function getOrgRole(orgId: string): Promise<OrgRole | null> {
  const user = getCurrentUser();
  if (!user) return null;

  const memberDoc = await firestore()
    .collection("orgs")
    .doc(orgId)
    .collection("members")
    .doc(user.uid)
    .get();

  if (!memberDoc.exists()) return null;

  return (memberDoc.data() as OrgMember).role;
}

/**
 * Assert minimum role for an operation (throws if insufficient)
 * This is a client-side check - Firestore rules provide server-side enforcement
 */
export async function assertRole(
  orgId: string,
  minRole: OrgRole
): Promise<void> {
  const roleOrder: OrgRole[] = ["viewer", "member", "admin", "owner"];
  const userRole = await getOrgRole(orgId);

  if (!userRole) {
    throw new Error("Not a member of this organization");
  }

  const userRoleIndex = roleOrder.indexOf(userRole);
  const minRoleIndex = roleOrder.indexOf(minRole);

  if (userRoleIndex < minRoleIndex) {
    throw new Error(`Insufficient permissions. Required: ${minRole}, Have: ${userRole}`);
  }
}

// ============================================================================
// EXPORTS for easy importing
// ============================================================================

export const firebase = {
  // Auth
  getCurrentUser,
  getIdToken,
  signInAnonymously,
  signOut,
  onAuthStateChanged,

  // Crashlytics
  logError,
  setCrashlyticsUserId,

  // Signs
  upsertSignForWorkOrder,
  getSignsNear,
  getSign,
  updateSign,

  // Org membership
  isOrgMember,
  getOrgRole,
  assertRole,

  // Utils
  encodeGeohash,
  distanceFeet,
};

export default firebase;
