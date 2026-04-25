import { getApp } from "@react-native-firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
} from "@react-native-firebase/firestore";
import { normalizeRole } from "../permissions/rolePermissions";
import { validateMembershipRecord } from "./orgJoin";
import {
  buildDisplayName,
  normalizeEmail,
  resolveIdentityDisplayName,
  trimToNull,
} from "../utils/userIdentity";
import type { AssignmentCandidate } from "../utils/workOrderAssignment";

type MemberRow = {
  uid: string;
  data: Record<string, any>;
};

function firstNonBlank(source: Record<string, any> | null | undefined, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = trimToNull(source[key]);
    if (value) return value;
  }
  return null;
}

export async function listAssignableOrgMembers(orgId: string): Promise<AssignmentCandidate[]> {
  const safeOrgId = trimToNull(orgId);
  if (!safeOrgId) return [];

  const db = getFirestore(getApp());
  const memberSnap = await getDocs(collection(db, "orgs", safeOrgId, "members"));

  const activeMembers: MemberRow[] = memberSnap.docs
    .map((snap: any): MemberRow => ({
      uid: trimToNull(snap.id) ?? trimToNull(snap.data()?.uid) ?? "",
      data: snap.data() as Record<string, any>,
    }))
    .filter((row: MemberRow) => row.uid)
    .filter((row: MemberRow) => validateMembershipRecord(row.data).isActive);

  const profileRows = await Promise.all(
    activeMembers.map(async (member: MemberRow) => {
      try {
        const snap = await getDoc(doc(db, "users", member.uid));
        return snap.exists() ? (snap.data() as Record<string, any>) : null;
      } catch {
        return null;
      }
    }),
  );

  return activeMembers
    .map((member: MemberRow, index: number): AssignmentCandidate => {
      const profile = profileRows[index];
      const email =
        normalizeEmail(firstNonBlank(profile, ["email"])) ??
        normalizeEmail(firstNonBlank(member.data, ["email", "memberEmail", "userEmail"]));
      const firstName =
        firstNonBlank(profile, ["firstName"]) ??
        firstNonBlank(member.data, ["firstName", "memberFirstName", "userFirstName"]);
      const lastName =
        firstNonBlank(profile, ["lastName"]) ??
        firstNonBlank(member.data, ["lastName", "memberLastName", "userLastName"]);
      const explicitDisplayName =
        firstNonBlank(profile, ["displayName", "name", "fullName"]) ??
        firstNonBlank(member.data, [
          "displayName",
          "memberDisplayName",
          "userDisplayName",
          "name",
          "fullName",
        ]) ??
        buildDisplayName(firstName, lastName);

      return {
        uid: member.uid,
        email,
        displayName: resolveIdentityDisplayName({
          uid: member.uid,
          email,
          firstName,
          lastName,
          displayName: explicitDisplayName,
        }),
        role: normalizeRole(member.data?.role),
      } satisfies AssignmentCandidate;
    })
    .sort((a: AssignmentCandidate, b: AssignmentCandidate) => {
      const byName = a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return a.uid.localeCompare(b.uid, undefined, { sensitivity: "base" });
    });
}