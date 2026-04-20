/**
 * orgJoin.ts
 *
 * Helpers for the "Join Org by Code" flow.
 *
 *  requestJoinOrg        – calls roadwork_requestJoinOrg cloud function
 *  getMyMembershipRole   – checks orgs/{orgId}/members/{uid}
 *  getMyJoinRequestStatus – checks orgs/{orgId}/joinRequests/{uid}
 */

import { getApp } from "@react-native-firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  limit,
  query,
  where,
} from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";

const REGION = "us-central1";

export type JoinRequestStatus = "none" | "pending" | "approved" | "rejected";

export type MembershipValidationResult = {
  isActive: boolean;
  role: string | null;
  reason: string;
};

export type JoinOrgResult = {
  orgId: string;
  alreadyMember: boolean;
  resolvedBy?: string;
  orgName?: string;
};

const INACTIVE_MEMBERSHIP_STATUSES = new Set([
  "disabled",
  "inactive",
  "revoked",
  "removed",
  "suspended",
  "blocked",
]);

function toBool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  return null;
}

function toStatus(v: unknown): string {
  if (typeof v !== "string") return "";
  return v.trim().toLowerCase();
}

export function validateMembershipRecord(data: Record<string, any> | null | undefined): MembershipValidationResult {
  if (!data) {
    return { isActive: false, role: null, reason: "missing_membership" };
  }

  const role = data?.role != null ? String(data.role) : "viewer";
  const disabled = toBool(data.disabled) ?? toBool(data.isDisabled) ?? toBool(data.membershipDisabled);
  if (disabled === true) {
    return { isActive: false, role, reason: "disabled_flag" };
  }

  const active = toBool(data.active) ?? toBool(data.isActive) ?? toBool(data.enabled);
  if (active === false) {
    return { isActive: false, role, reason: "inactive_flag" };
  }

  const status = toStatus(data.status) || toStatus(data.membershipStatus);
  if (status && INACTIVE_MEMBERSHIP_STATUSES.has(status)) {
    return { isActive: false, role, reason: `status_${status}` };
  }

  return { isActive: true, role, reason: "active" };
}

/**
 * Direct HTTP call for __DEV__ — bypasses App Check dual-task bug.
 */
async function callFnDev(fnName: string, payload: Record<string, any>): Promise<any> {
  return callDevFunctionHttp(fnName, payload, REGION);
}

async function invokeRequestJoin(payload: Record<string, any>): Promise<any> {
  if (__DEV__) {
    return callFnDev("roadwork_requestJoinOrg", payload);
  }
  const fn = httpsCallable(getFunctions(getApp()), "roadwork_requestJoinOrg");
  const res = await fn(payload);
  return res.data;
}

async function resolveOrgIdByCodeBestEffort(input: string): Promise<string | null> {
  const normalized = String(input ?? "").trim();
  if (!normalized) return null;

  const db = getFirestore(getApp());
  const orgsRef = collection(db, "orgs");
  const candidateFields = ["orgCode", "joinCode", "inviteCode", "code", "shortCode"];

  for (const fieldName of candidateFields) {
    try {
      const snap = await getDocs(query(orgsRef, where(fieldName, "==", normalized), limit(1)));
      const first = snap.docs[0];
      if (first?.id) {
        console.log("[JoinOrg] resolved org code via field", fieldName, "=>", first.id);
        return first.id;
      }
    } catch {
      // Keep trying other candidate fields.
    }
  }

  return null;
}

/**
 * Call roadwork_requestJoinOrg cloud function.
 * In __DEV__ uses direct HTTP to bypass App Check; in prod uses the SDK.
 * Accepts a short code (e.g. "2468") or a full Firestore orgId — the server resolves both.
 * Returns the full response including alreadyMember flag.
 * Throws on failure — caller should catch and show an alert.
 */
export async function requestJoinOrg(orgIdOrCode: string): Promise<JoinOrgResult> {
  const normalizedInput = String(orgIdOrCode ?? "").trim();
  console.log("[JoinOrg] Calling roadwork_requestJoinOrg with:", normalizedInput);

  // Compatibility payload: backend variants have historically used different key names.
  const payload = {
    orgIdOrCode: normalizedInput,
    orgCode: normalizedInput,
    code: normalizedInput,
    orgId: normalizedInput,
  };

  let data: any = null;
  let firstError: any = null;

  try {
    data = await invokeRequestJoin(payload);
  } catch (e: any) {
    firstError = e;
  }

  if (!data?.orgId && !data?.organizationId && !data?.resolvedOrgId) {
    const resolvedOrgId = await resolveOrgIdByCodeBestEffort(normalizedInput);
    if (resolvedOrgId && resolvedOrgId !== normalizedInput) {
      const retryPayload = {
        orgIdOrCode: resolvedOrgId,
        orgCode: normalizedInput,
        code: normalizedInput,
        orgId: resolvedOrgId,
      };

      try {
        data = await invokeRequestJoin(retryPayload);
      } catch (retryError: any) {
        firstError = retryError;
      }
    }
  }

  // Dev convenience: if test code 2468 isn't provisioned, bootstrap a dev org and retry.
  if (
    __DEV__ &&
    (!data?.orgId && !data?.organizationId && !data?.resolvedOrgId) &&
    normalizedInput === "2468" &&
    (firstError?.code === "functions/not_found" || firstError?.nativeErrorCode === "NOT_FOUND")
  ) {
    try {
      const boot = await callFnDev("roadwork_devBootstrapOrg", {
        name: "RoadWork Dev 2468",
        orgCode: "2468",
      });
      const bootOrgId = String(boot?.orgId ?? "").trim();
      if (bootOrgId) {
        data = await invokeRequestJoin({
          orgIdOrCode: bootOrgId,
          orgCode: "2468",
          code: "2468",
          orgId: bootOrgId,
        });
      }
    } catch (bootstrapErr: any) {
      throw bootstrapErr;
    }
  }

  if (!data?.orgId && !data?.organizationId && !data?.resolvedOrgId && firstError) {
    throw firstError;
  }

  console.log("[JoinOrg] Response:", JSON.stringify(data));
  const resolved = data?.orgId ?? data?.organizationId ?? data?.resolvedOrgId;
  if (!resolved) throw new Error("Server did not return an orgId. Check the org code and try again.");
  return {
    orgId: String(resolved),
    alreadyMember: !!data?.alreadyMember,
    resolvedBy: data?.resolvedBy,
    orgName: data?.orgName,
  };
}

/**
 * Returns the member's role string if the membership doc exists, null otherwise.
 * Existence of this doc is the source of truth for "approved".
 */
export async function getMyMembershipRole(
  orgId: string,
  uid: string,
): Promise<string | null> {
  const result = await validateMyMembership(orgId, uid);
  return result.isActive ? result.role : null;
}

export async function validateMyMembership(
  orgId: string,
  uid: string,
): Promise<MembershipValidationResult> {
  const db = getFirestore(getApp());
  const snap = await getDoc(doc(db, "orgs", orgId, "members", uid));
  if (!snap.exists()) {
    return { isActive: false, role: null, reason: "missing_membership" };
  }
  const data = snap.data() as Record<string, any>;
  return validateMembershipRecord(data);
}

/**
 * Returns the status field from orgs/{orgId}/joinRequests/{uid}.
 * Falls back to "none" if the doc is missing.
 */
export async function getMyJoinRequestStatus(
  orgId: string,
  uid: string,
): Promise<JoinRequestStatus> {
  const db = getFirestore(getApp());
  const snap = await getDoc(doc(db, "orgs", orgId, "joinRequests", uid));
  if (!snap.exists()) return "none";
  const data = snap.data() as Record<string, any>;
  return (data?.status ?? "pending") as JoinRequestStatus;
}
