import { getApp } from "@react-native-firebase/app";
import { getAuth, updateProfile } from "@react-native-firebase/auth";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "@react-native-firebase/firestore";
import {
  buildDisplayName,
  normalizeEmail,
  resolveIdentityDisplayName,
  trimToNull,
  type IdentityLike,
} from "../utils/userIdentity";

export type UserProfileRecord = {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string | null;
};

function usersRef(uid: string) {
  return doc(getFirestore(getApp()), "users", uid);
}

export async function upsertUserProfile(args: {
  uid: string;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
}): Promise<UserProfileRecord> {
  const uid = trimToNull(args.uid) ?? "";
  if (!uid) throw new Error("Missing user uid.");

  const email = normalizeEmail(args.email);
  const firstName = trimToNull(args.firstName);
  const lastName = trimToNull(args.lastName);
  const displayName =
    trimToNull(args.displayName) ??
    buildDisplayName(firstName, lastName) ??
    email ??
    uid;

  const auth = getAuth(getApp());
  if (auth.currentUser?.uid === uid) {
    try {
      await updateProfile(auth.currentUser, { displayName });
    } catch (e) {
      console.warn("[Profile] Failed to update auth displayName", e);
    }
  }

  const ref = usersRef(uid);
  let existing: Record<string, any> | null = null;
  try {
    const snap = await getDoc(ref);
    existing = snap.exists() ? (snap.data() as Record<string, any>) : null;
  } catch (e) {
    console.warn("[Profile] Failed to read profile before write", e);
  }

  const payload: Record<string, any> = {
    uid,
    email,
    firstName,
    lastName,
    displayName,
    updatedAt: serverTimestamp(),
    createdAt: existing?.createdAt ?? serverTimestamp(),
  };

  await setDoc(ref, payload, { merge: true });

  return {
    uid,
    email,
    firstName,
    lastName,
    displayName,
  };
}

export async function getCurrentUserIdentitySnapshot(): Promise<IdentityLike> {
  const auth = getAuth(getApp());
  const user = auth.currentUser;

  if (!user) {
    return {
      uid: null,
      email: null,
      firstName: null,
      lastName: null,
      displayName: null,
    };
  }

  const base: IdentityLike = {
    uid: user.uid,
    email: normalizeEmail(user.email),
    displayName: trimToNull(user.displayName),
    firstName: null,
    lastName: null,
  };

  try {
    const snap = await getDoc(usersRef(user.uid));
    if (snap.exists()) {
      const data = snap.data() as Record<string, any>;
      base.email = normalizeEmail(data?.email) ?? base.email;
      base.firstName = trimToNull(data?.firstName);
      base.lastName = trimToNull(data?.lastName);
      base.displayName = trimToNull(data?.displayName) ?? base.displayName;
    }
  } catch (e) {
    console.warn("[Profile] Failed to read users profile doc", e);
  }

  return {
    ...base,
    displayName: resolveIdentityDisplayName(base),
  };
}

export async function updateCurrentUserName(args: {
  firstName: string;
  lastName: string;
}): Promise<UserProfileRecord> {
  const auth = getAuth(getApp());
  const user = auth.currentUser;
  if (!user) throw new Error("You must be signed in to update your name.");

  return upsertUserProfile({
    uid: user.uid,
    email: user.email,
    firstName: args.firstName,
    lastName: args.lastName,
  });
}
