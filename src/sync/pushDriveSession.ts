// Pushes one Drive Mode session to orgs/{orgId}/driveSessions|driveSegments|driveEvents
// with direct client writes (rules: creator writes own docs). Idempotent.
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { doc, getFirestore, writeBatch } from "@react-native-firebase/firestore";
import { db } from "../db/db";
import { getDriveSession, listDriveEvents, listDriveSegments } from "../repositories/roughnessRepo";
import { buildSessionWrites, splitIntoBatches } from "./driveSyncMapping";

export async function pushDriveSession(orgId: string, sessionId: string) {
  const uid = getAuth(getApp()).currentUser?.uid;
  if (!uid) throw new Error("unauthenticated: sign in to sync drives");
  const s = getDriveSession(sessionId);
  if (!s) return; // deleted locally; nothing to do
  if (!s.endedAt) throw new Error("drive session still recording");
  const writes = buildSessionWrites(s, listDriveSegments({ sessionId }, 100000), listDriveEvents({ sessionId }, 100000), { uid, orgId });
  const fs = getFirestore(getApp());
  for (const batchWrites of splitIntoBatches(writes)) {
    const b = writeBatch(fs);
    for (const w of batchWrites) b.set(doc(fs, "orgs", orgId, w.collection, w.id), w.data);
    await b.commit();
  }
  db.executeSync(`UPDATE drive_sessions SET syncedAt = ? WHERE id = ?;`, [Date.now(), sessionId]);
}
