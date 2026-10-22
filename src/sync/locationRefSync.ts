/**
 * locationRefSync.ts — pushes location_refs to orgs/{orgId}/locationRefs/{entityType}__{entityId}.
 * A SIDE collection, so the server-side replace of workOrders docs can never wipe it.
 * One outbox job can carry many keys (e.g. "Set route for this drive"); writes are batched.
 */
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { doc, getFirestore, writeBatch } from "@react-native-firebase/firestore";
import { db } from "../db/db";
import { safeJsonStringify } from "../repositories/repoUtils";
import type { LocationEntityType, LocationRef } from "../integration/locationRefs";
import { splitIntoBatches } from "./driveSyncMapping";

export type LocationRefKey = { entityType: LocationEntityType; entityId: string };

export function locationRefDocId(k: LocationRefKey) {
  return `${k.entityType}__${k.entityId}`.replace(/\//g, "_");
}

export function locationRefDoc(k: LocationRefKey, ref: LocationRef, w: { uid: string; orgId: string }, updatedAt: number) {
  return {
    id: locationRefDocId(k),
    orgId: w.orgId,
    entityType: k.entityType,
    entityId: k.entityId,
    routeId: ref.routeId ?? null,
    roadName: ref.roadName ?? null,
    beginMp: ref.beginMp ?? null,
    endMp: ref.endMp ?? null,
    source: ref.source === "resolver" ? "resolver" : "manual",
    updatedAt,
    updatedByUid: w.uid,
  };
}

export function enqueueLocationRefSync(orgId: string | null, keys: LocationRefKey[]) {
  if (!orgId || !keys.length) return;
  const now = Date.now();
  const entityId = keys.length === 1 ? locationRefDocId(keys[0]) : `batch_${keys.length}`;
  db.executeSync(
    `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError)
     VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
    [`${entityId}:UPSERT_LOCATION_REFS:${now}:${Math.random().toString(16).slice(2, 8)}`, orgId, "UPSERT_LOCATION_REFS", entityId,
      safeJsonStringify({ orgId, keys, createdAt: now, updatedAt: now }), now],
  );
}

/** Reads the CURRENT local values at send time (so later edits win) and batch-writes them. */
export async function pushLocationRefs(orgId: string, keys: LocationRefKey[], read: (k: LocationRefKey) => LocationRef | null) {
  const uid = getAuth(getApp()).currentUser?.uid;
  if (!uid) throw new Error("unauthenticated: sign in to sync location refs");
  const fs = getFirestore(getApp());
  const docs = keys
    .map((k) => ({ k, ref: read(k) }))
    .filter((x): x is { k: LocationRefKey; ref: LocationRef } => !!x.ref)
    .map((x) => locationRefDoc(x.k, x.ref, { uid, orgId }, Date.now()));
  for (const part of splitIntoBatches(docs)) {
    const b = writeBatch(fs);
    for (const d of part) b.set(doc(fs, "orgs", orgId, "locationRefs", d.id), d);
    await b.commit();
  }
}
