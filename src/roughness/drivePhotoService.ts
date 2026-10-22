/**
 * drivePhotoService.ts — saves Drive Mode photos locally with GPS/heading/speed,
 * queues upload to Firebase Storage (app already uses Storage), and prunes to a cap.
 */
import RNFS from "react-native-fs";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { doc, getFirestore, setDoc } from "@react-native-firebase/firestore";
import { getStorage, ref } from "@react-native-firebase/storage";
import { db } from "../db/db";
import { safeJsonStringify, makeClientId } from "../repositories/repoUtils";
import { assertOrgScopedStoragePath } from "../firebase/storagePaths";
import {
  getDrivePhoto, insertDrivePhoto, listPhotosForPrune, markDrivePhotoPruned, markDrivePhotoUploaded,
} from "../repositories/drivePhotosRepo";
import { DEFAULT_PHOTO_SETTINGS, planPrune, type CaptureReason, type PhotoSettings } from "./photoPolicy";

const SETTINGS_KEY = "driveMode.photoSettings.v1";
export const DRIVE_PHOTO_DIR = `${RNFS.DocumentDirectoryPath}/drive_photos`;

export async function loadPhotoSettings(): Promise<PhotoSettings> {
  try {
    const raw = await AsyncStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULT_PHOTO_SETTINGS, ...JSON.parse(raw) } : DEFAULT_PHOTO_SETTINGS;
  } catch {
    return DEFAULT_PHOTO_SETTINGS;
  }
}
export async function savePhotoSettings(s: PhotoSettings) {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export type CaptureContext = {
  orgId: string | null; sessionId: string; eventId: string | null; reason: CaptureReason;
  lat: number | null; lng: number | null; headingDeg: number | null; speedMps: number | null; accuracyM: number | null;
};

export function drivePhotoStoragePath(orgId: string, sessionId: string, photoId: string) {
  return `orgs/${orgId}/drivePhotos/${sessionId}/${photoId}.jpg`;
}

/** Move a temp camera file into app storage and record it. Returns the photo id. */
export async function saveCapturedPhoto(tempPath: string, size: { width?: number; height?: number }, ctx: CaptureContext): Promise<string> {
  await RNFS.mkdir(DRIVE_PHOTO_DIR);
  const id = makeClientId("dph");
  const dest = `${DRIVE_PHOTO_DIR}/${id}.jpg`;
  await RNFS.moveFile(tempPath.replace(/^file:\/\//, ""), dest);
  const st = await RNFS.stat(dest);
  insertDrivePhoto({
    id, orgId: ctx.orgId, sessionId: ctx.sessionId, eventId: ctx.eventId, reason: ctx.reason, capturedAt: Date.now(),
    localUri: `file://${dest}`, width: size.width ?? null, height: size.height ?? null, sizeBytes: Number(st.size) || 0,
    lat: ctx.lat, lng: ctx.lng, headingDeg: ctx.headingDeg, speedMps: ctx.speedMps, accuracyM: ctx.accuracyM,
  });
  if (ctx.orgId) {
    const now = Date.now();
    db.executeSync(
      `INSERT OR IGNORE INTO outbox (id, orgId, kind, entityId, payloadJson, createdAt, attempts, lastError) VALUES (?, ?, ?, ?, ?, ?, 0, NULL)`,
      [`${id}:UPLOAD_DRIVE_PHOTO`, ctx.orgId, "UPLOAD_DRIVE_PHOTO", id, safeJsonStringify({ orgId: ctx.orgId, photoId: id, createdAt: now, updatedAt: now }), now],
    );
  }
  return id;
}

/** Outbox handler: upload file to Storage + metadata doc to orgs/{orgId}/drivePhotos/{id}. */
export async function uploadDrivePhoto(orgId: string, photoId: string) {
  const p = getDrivePhoto(photoId);
  if (!p || p.uploadedAt || p.prunedAt) return; // gone or done
  const uid = getAuth(getApp()).currentUser?.uid;
  if (!uid) throw new Error("unauthenticated: sign in to upload drive photos");
  const path = assertOrgScopedStoragePath(orgId, drivePhotoStoragePath(orgId, p.sessionId, p.id));
  await ref(getStorage(getApp()), path).putFile(p.localUri.replace(/^file:\/\//, ""), { contentType: "image/jpeg" });
  await setDoc(doc(getFirestore(getApp()), "orgs", orgId, "drivePhotos", p.id), drivePhotoDoc(p, { uid, orgId, storagePath: path }));
  markDrivePhotoUploaded(p.id, path);
}

export function drivePhotoDoc(p: { id: string; sessionId: string; eventId: string | null; reason: string; capturedAt: number; width: number | null; height: number | null; sizeBytes: number; lat: number | null; lng: number | null; headingDeg: number | null; speedMps: number | null },
  w: { uid: string; orgId: string; storagePath: string }) {
  return {
    id: p.id, orgId: w.orgId, createdByUid: w.uid, sessionId: p.sessionId, eventId: p.eventId ?? null, reason: p.reason,
    capturedAt: p.capturedAt, storagePath: w.storagePath, width: p.width ?? null, height: p.height ?? null, sizeBytes: p.sizeBytes ?? 0,
    lat: p.lat ?? null, lng: p.lng ?? null, headingDeg: p.headingDeg ?? null, speedMps: p.speedMps ?? null, blurred: false,
  };
}

/** Delete local files oldest-first until under cap (see planPrune for what's protected). */
export async function pruneDrivePhotos(capMb: number): Promise<number> {
  const victims = planPrune(listPhotosForPrune(), capMb * 1024 * 1024);
  for (const id of victims) {
    const p = getDrivePhoto(id);
    try {
      if (p) await RNFS.unlink(p.localUri.replace(/^file:\/\//, ""));
    } catch {
      // already gone
    }
    markDrivePhotoPruned(id);
  }
  return victims.length;
}
