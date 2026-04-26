import type { WorkOrderAttachment } from "../types/WorkOrder";
import type { WorkPhoto } from "../types/workItem";
import {
  addWorkOrderPhoto as addWorkOrderPhotoRow,
  listWorkOrderPhotos,
  removeWorkOrderPhoto as removeWorkOrderPhotoRow,
} from "../db/workOrderPhotosRepo";
import { getWorkOrderById } from "../db/workOrdersRepo";
import { emitDbChanged } from "../state/DbEvents";
import { assertRolePermission } from "../permissions/rolePermissions";
import { Platform } from "react-native";
import RNFS from "react-native-fs";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { doc, getDoc, getFirestore } from "@react-native-firebase/firestore";
import { getDownloadURL, getStorage, ref } from "@react-native-firebase/storage";
import { getEmulatorConnectionInfo } from "../firebase/emulators";
import {
  assertOrgScopedStoragePath,
  workOrderPhotoPath,
} from "../firebase/storagePaths";
import { workOrdersService } from "./workOrdersService";
import {
  normalizeWorkOrderAttachments,
  summarizeWorkOrderAttachmentContract,
} from "../workOrders/attachments";
import {
  getGlobalWorkOrderPhotoDevDiagnostics,
  getWorkOrderPhotoDevDiagnostics,
  updatePhotoDevDiagnostics,
} from "./workOrderPhotoDiagnosticsStore";

export { getGlobalWorkOrderPhotoDevDiagnostics, getWorkOrderPhotoDevDiagnostics };

function classifyUri(uriRaw: unknown): "local" | "remote" | "unknown" {
  const uri = String(uriRaw ?? "").trim().toLowerCase();
  if (!uri) return "unknown";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return "remote";
  if (uri.startsWith("file://") || uri.startsWith("content://") || uri.startsWith("ph://") || uri.startsWith("/")) {
    return "local";
  }
  return "unknown";
}

function toEpoch(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const maybeMillis = (value as any)?.toMillis;
    if (typeof maybeMillis === "function") {
      const ms = Number(maybeMillis.call(value));
      if (Number.isFinite(ms)) return ms;
    }
    const maybeSeconds = Number((value as any)?.seconds);
    if (Number.isFinite(maybeSeconds)) return Math.round(maybeSeconds * 1000);
  }
  return Date.now();
}

function getUriScheme(uriRaw: unknown): string {
  const uri = String(uriRaw ?? "").trim().toLowerCase();
  if (!uri) return "unknown";
  if (uri.startsWith("content://")) return "content";
  if (uri.startsWith("file://")) return "file";
  if (uri.startsWith("ph://")) return "ph";
  if (uri.startsWith("/")) return "absolute_path";
  if (uri.startsWith("http://") || uri.startsWith("https://")) return "remote";
  return "unknown";
}

function normalizeLocalPathForPutFile(uriRaw: unknown): string {
  const uri = String(uriRaw ?? "").trim();
  if (!uri) throw new Error("Photo URI is empty");

  if (uri.startsWith("file://")) {
    const filePath = uri.replace(/^file:\/\//, "");
    return Platform.OS === "ios" ? decodeURIComponent(filePath) : uri;
  }

  return uri;
}

function sanitizeForCacheName(fileNameRaw: string): string {
  const clean = String(fileNameRaw ?? "").trim().replace(/[^a-zA-Z0-9._-]/g, "_");
  return clean || `photo_${Date.now()}.jpg`;
}

async function stageContentUriForUpload(localUri: string, fileName: string): Promise<{ path: string; cleanupPath?: string }> {
  if (!localUri.startsWith("content://")) {
    return { path: normalizeLocalPathForPutFile(localUri) };
  }

  const safeName = sanitizeForCacheName(fileName);
  const stagedPath = `${RNFS.CachesDirectoryPath}/wo_${Date.now()}_${safeName}`;
  await RNFS.copyFile(localUri, stagedPath);
  return { path: stagedPath, cleanupPath: stagedPath };
}

function stringifyStorageError(errorRaw: unknown): { code: string | null; message: string; details: string } {
  const e = errorRaw as any;
  const code =
    (typeof e?.code === "string" && e.code) ||
    (typeof e?.nativeErrorCode === "string" && e.nativeErrorCode) ||
    (typeof e?.userInfo?.code === "string" && e.userInfo.code) ||
    null;
  const message =
    (typeof e?.message === "string" && e.message) ||
    (typeof e?.nativeErrorMessage === "string" && e.nativeErrorMessage) ||
    (typeof e?.userInfo?.message === "string" && e.userInfo.message) ||
    String(errorRaw);
  const details = [
    code ? `code=${code}` : null,
    message ? `message=${message}` : null,
    typeof e?.httpStatus === "number" ? `httpStatus=${e.httpStatus}` : null,
    typeof e?.userInfo?.details === "string" ? `details=${e.userInfo.details}` : null,
  ]
    .filter(Boolean)
    .join(" | ");

  return { code, message, details };
}

function isStorageUnauthorizedCode(codeRaw: unknown): boolean {
  return String(codeRaw ?? "").toLowerCase().includes("storage/unauthorized");
}

async function logDevMembershipPreflight(args: {
  traceId: string;
  orgId: string;
  workOrderId: string;
  authUid: string | null;
}): Promise<void> {
  if (!__DEV__) return;

  if (!args.authUid) {
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestMembershipDocExists: false,
      latestMembershipWarning: "Storage upload will fail: no signed-in UID.",
    });
    console.warn("[WorkOrderPhotos][membership-preflight]", {
      traceId: args.traceId,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      memberDocExists: false,
      warning: "Storage upload will fail: no signed-in UID.",
    });
    return;
  }

  try {
    const db = getFirestore(getApp());
    const snap = await getDoc(doc(db, "orgs", args.orgId, "members", args.authUid));
    const member = snap.exists() ? (snap.data() as Record<string, any>) : null;
    const memberStatus = String(member?.status ?? "").trim() || "n/a";
    const memberRole = String(member?.role ?? "").trim() || "n/a";
    const memberActive = member?.active == null ? "n/a" : String(member.active);
    const exists = snap.exists();

    updatePhotoDevDiagnostics(args.workOrderId, {
      latestMembershipDocExists: exists,
      latestMembershipStatus: memberStatus,
      latestMembershipRole: memberRole,
      latestMembershipActive: memberActive,
      latestMembershipWarning: exists
        ? null
        : "Storage upload will fail: current UID is not a member of selected org.",
    });

    console.log("[WorkOrderPhotos][membership-preflight]", {
      traceId: args.traceId,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      uid: args.authUid,
      memberDocExists: exists,
      memberStatus,
      memberRole,
      memberActive,
    });

    if (!exists) {
      console.warn("Storage upload will fail: current UID is not a member of selected org.", {
        traceId: args.traceId,
        orgId: args.orgId,
        uid: args.authUid,
      });
    }
  } catch (e: any) {
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestMembershipWarning: `membership preflight read failed: ${e?.message ?? String(e)}`,
    });
    console.warn("[WorkOrderPhotos][membership-preflight-failed]", {
      traceId: args.traceId,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      uid: args.authUid,
      error: e?.message ?? String(e),
    });
  }
}

export function reportWorkOrderPhotoRenderDiagnostic(args: {
  workOrderId: string;
  photoId?: string | null;
  uri?: string | null;
  error?: string | null;
}): void {
  if (!__DEV__) return;
  const uri = String(args.uri ?? "").trim();
  updatePhotoDevDiagnostics(args.workOrderId, {
    latestRenderWorkOrderId: args.workOrderId,
    latestRenderPhotoId: args.photoId ?? null,
    latestRenderUri: uri || null,
    latestRenderUriType: classifyUri(uri),
    latestRenderError: args.error ?? null,
  });
}

function safePhotoFileName(photo: WorkPhoto): string {
  const fromMeta = String(photo.fileName ?? "").trim();
  if (fromMeta) return fromMeta;

  const uri = String(photo.uri ?? "").trim();
  const fromUri = uri.split("?")[0].split("/").pop() ?? "";
  if (fromUri) return fromUri;

  return `${photo.id}.jpg`;
}

async function uploadPhotoAndBuildAttachment(args: {
  traceId: string;
  orgId: string;
  workOrderId: string;
  photo: WorkPhoto;
}): Promise<WorkOrderAttachment> {
  const app = getApp();
  const storage = getStorage(app);
  const auth = getAuth(app);
  const authUid = auth.currentUser?.uid ?? null;
  const authEmail = auth.currentUser?.email ?? null;
  const emulatorInfo = __DEV__ ? getEmulatorConnectionInfo() : null;
  const storageBucket = ((app as any)?.options?.storageBucket ?? (app as any)?._options?.storageBucket ?? null) as string | null;
  const firebaseAppName = ((app as any)?.name ?? "[DEFAULT]") as string;
  const isDevEmulatorModeActive = !!(__DEV__ && emulatorInfo?.enabled);

  const fileName = safePhotoFileName(args.photo);
  const generatedStoragePath = workOrderPhotoPath({
    orgId: args.orgId,
    workOrderId: args.workOrderId,
    fileName,
  });
  if (!generatedStoragePath.startsWith(`orgs/${args.orgId}/`)) {
    const invalidPathError = new Error(
      `Photo upload path is invalid for org. Expected prefix orgs/${args.orgId}/ but got ${generatedStoragePath}`,
    );
    if (__DEV__) {
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestUploadStatus: "failed",
        latestUploadStage: "path-validation-failed",
        latestUploadErrorCode: "invalid-storage-path",
        latestUploadErrorMessage: invalidPathError.message,
        latestUploadStoragePath: generatedStoragePath,
      });
    }
    throw invalidPathError;
  }
  const storagePath = assertOrgScopedStoragePath(args.orgId, generatedStoragePath);
  const localUri = String(args.photo.uri ?? "").trim();

  if (!args.orgId) throw new Error("Missing orgId for photo upload");
  if (!args.workOrderId) throw new Error("Missing workOrderId for photo upload");
  if (!fileName) throw new Error("Missing fileName for photo upload");

  let cleanupPath: string | undefined;
  let uploadPathForApi = normalizeLocalPathForPutFile(localUri);
  const uriScheme = getUriScheme(localUri);

  if (__DEV__) {
    await logDevMembershipPreflight({
      traceId: args.traceId,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      authUid,
    });

    console.log("[WorkOrderPhotos][upload-start]", {
      traceId: args.traceId,
      authUid,
      authEmail,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      photoId: args.photo.id,
      storagePath,
      localUri,
      uriScheme,
      contentType: args.photo.mimeType ?? "image/jpeg",
      storageLibrary: "@react-native-firebase/storage",
      emulatorHost: emulatorInfo?.selectedHost ?? null,
      emulatorStorageTarget: emulatorInfo?.storageTarget ?? null,
      storageBucket,
      firebaseAppName,
      isDevEmulatorModeActive,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestUploadStartedAt: Date.now(),
      latestUploadStatus: "started",
      latestUploadStage: "upload-start",
      lastPhotoTraceId: args.traceId,
      latestUploadErrorCode: null,
      latestUploadErrorMessage: null,
      latestUploadStoragePath: storagePath,
      latestUploadLocalUri: localUri || null,
      latestUploadFileName: fileName,
      latestUploadOrgId: args.orgId,
      latestUploadWorkOrderId: args.workOrderId,
      latestSelectedOrgId: args.orgId,
      latestAuthUid: authUid,
      latestAuthEmail: authEmail,
      latestDevEmulatorModeActive: isDevEmulatorModeActive,
      latestUploadUriScheme: uriScheme,
      latestStorageEmulatorHost: emulatorInfo?.selectedHost ?? null,
      latestStorageBucket: storageBucket,
      latestStorageAppName: firebaseAppName,
      latestStorageLibrary: "@react-native-firebase/storage",
      latestStorageEmulatorTarget: emulatorInfo?.storageTarget ?? null,
      latestRemoteFetchError: null,
    });
  }

  try {
    const staged = await stageContentUriForUpload(localUri, fileName);
    uploadPathForApi = staged.path;
    cleanupPath = staged.cleanupPath;

    const storageRef = ref(storage, storagePath);
    await storageRef.putFile(uploadPathForApi, {
      contentType: args.photo.mimeType ?? "image/jpeg",
    });
    const downloadURL = await getDownloadURL(storageRef);

    if (__DEV__) {
      console.log("[WorkOrderPhotos][upload-complete]", {
        traceId: args.traceId,
        orgId: args.orgId,
        workOrderId: args.workOrderId,
        photoId: args.photo.id,
        storagePath,
        uploadPathForApi,
        hasDownloadURL: !!downloadURL,
      });
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestUploadSuccessAt: Date.now(),
        latestUploadStatus: "success",
        latestUploadStage: "upload-complete",
        latestUploadNormalizedPath: uploadPathForApi,
        latestRemoteFetchError: null,
      });
    }

    const user = auth.currentUser;
    const now = Date.now();
    const attachment: WorkOrderAttachment = {
      id: args.photo.id,
      photoId: args.photo.id,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      entityType: "workOrder",
      entityId: args.workOrderId,
      storagePath,
      fileName,
      contentType: args.photo.mimeType ?? "image/jpeg",
      sizeBytes: args.photo.fileSize ?? undefined,
      width: args.photo.width ?? undefined,
      height: args.photo.height ?? undefined,
      downloadURL,
      createdAt: args.photo.createdAt,
      updatedAt: now,
      createdByUid: user?.uid ?? undefined,
      createdByName: user?.displayName ?? undefined,
      createdByEmail: user?.email ?? undefined,
    };

    if (__DEV__) {
      console.log("[WorkOrderPhotos][attachment-built]", {
        traceId: args.traceId,
        orgId: args.orgId,
        workOrderId: args.workOrderId,
        photoId: args.photo.id,
        storagePath,
      });
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestAttachmentBuildAt: Date.now(),
        latestAttachmentWriteStage: "attachment-built",
      });
    }

    return attachment;
  } catch (errorRaw: unknown) {
    const err = stringifyStorageError(errorRaw);
    if (__DEV__) {
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestUploadStatus: "failed",
        latestAttachmentWriteStatus: "failed",
        latestUploadStage: "upload-failed",
        latestAttachmentWriteStage: "upload-failed",
        lastPhotoTraceId: args.traceId,
        latestUploadErrorCode: err.code,
        latestUploadErrorMessage: err.message,
        latestUploadStoragePath: storagePath,
        latestUploadLocalUri: localUri || null,
        latestUploadFileName: fileName,
        latestUploadOrgId: args.orgId,
        latestUploadWorkOrderId: args.workOrderId,
        latestUploadNormalizedPath: uploadPathForApi,
        latestUploadUriScheme: uriScheme,
        latestStorageEmulatorHost: emulatorInfo?.selectedHost ?? null,
        latestStorageBucket: storageBucket,
        latestStorageAppName: firebaseAppName,
        latestStorageLibrary: "@react-native-firebase/storage",
        latestStorageEmulatorTarget: emulatorInfo?.storageTarget ?? null,
        latestRemoteFetchError: err.details || err.message,
      });

      console.error("[WorkOrderPhotos][upload-failed]", {
        traceId: args.traceId,
        code: err.code,
        message: err.message,
        details: err.details,
        orgId: args.orgId,
        workOrderId: args.workOrderId,
        photoId: args.photo.id,
        localUri,
        uploadPathForApi,
        storagePath,
        fileName,
        uriScheme,
        storageLibrary: "@react-native-firebase/storage",
        emulatorHost: emulatorInfo?.selectedHost ?? null,
        emulatorStorageTarget: emulatorInfo?.storageTarget ?? null,
        storageBucket,
        firebaseAppName,
        authUid,
        authEmail,
        isDevEmulatorModeActive,
      });
    }

    throw errorRaw;
  } finally {
    if (cleanupPath) {
      try {
        await RNFS.unlink(cleanupPath);
      } catch {
        // best-effort cleanup only
      }
    }
  }
}

async function appendAttachmentToWorkOrder(args: {
  traceId: string;
  orgId: string;
  workOrderId: string;
  attachment: WorkOrderAttachment;
}) {
  const workOrder = getWorkOrderById(args.workOrderId, args.orgId);
  if (!workOrder) {
    throw new Error("work order not found for attachment patch");
  }

  const before = normalizeWorkOrderAttachments((workOrder as any).attachments, {
    orgId: args.orgId,
    workOrderId: args.workOrderId,
  });
  const after = normalizeWorkOrderAttachments([...before, args.attachment], {
    orgId: args.orgId,
    workOrderId: args.workOrderId,
  });

  if (__DEV__) {
    console.log("[WorkOrderPhotos][before-patchAndEnqueue]", {
      traceId: args.traceId,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      previousAttachmentsCount: before.length,
      nextAttachmentsCount: after.length,
      nextAttachmentStoragePaths: after.map((a) => a.storagePath),
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestAttachmentWriteStatus: "started",
      latestAttachmentWriteStage: "before-patchAndEnqueue",
      lastPhotoTraceId: args.traceId,
      latestQueuedAttachmentsCount: after.length,
      latestQueuedAttachmentStoragePaths: after.map((a) => a.storagePath),
      latestAttachmentWriteErrorCode: null,
      latestAttachmentWriteErrorMessage: null,
    });
  }

  if (__DEV__ && after.length < 1) {
    throw new Error("DEV guard: nextAttachments is empty after building valid attachment");
  }

  await workOrdersService.patchAndEnqueue({
    orgId: args.orgId,
    id: args.workOrderId,
    patch: {
      attachments: after,
    },
  });

  if (__DEV__) {
    console.log("[WorkOrderPhotos][after-patchAndEnqueue]", {
      traceId: args.traceId,
      success: true,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      queuedAttachmentsCount: after.length,
      queuedOutboxId: "n/a",
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestAttachmentWriteAt: Date.now(),
      latestAttachmentWriteStatus: "success",
      latestAttachmentWriteStage: "after-patchAndEnqueue",
      latestRemoteAttachmentCount: after.length,
      latestRemoteFetchError: null,
    });
    const summary = summarizeWorkOrderAttachmentContract({
      id: args.workOrderId,
      orgId: args.orgId,
      attachments: after,
    });
    console.log("[WorkOrderPhotos][contract-summary]", summary);
  }
}

export async function getAttachmentPhotosForWorkOrder(args: {
  orgId: string;
  workOrderId: string;
  attachmentsRaw: unknown;
}): Promise<WorkPhoto[]> {
  const attachments = normalizeWorkOrderAttachments(args.attachmentsRaw, {
    orgId: args.orgId,
    workOrderId: args.workOrderId,
  });

  const app = getApp();
  const storage = getStorage(app);
  const out: WorkPhoto[] = [];

  for (const attachment of attachments) {
    let uri = String(attachment.downloadURL ?? "").trim();
    if (!uri && attachment.storagePath) {
      try {
        uri = await getDownloadURL(ref(storage, attachment.storagePath));
        if (__DEV__) {
          console.log("[WorkOrderPhotos][resolve-storage-url-success]", {
            orgId: args.orgId,
            workOrderId: args.workOrderId,
            storagePath: attachment.storagePath,
          });
        }
      } catch (e: any) {
        if (__DEV__) {
          console.warn("[WorkOrderPhotos][resolve-storage-url-failure]", {
            orgId: args.orgId,
            workOrderId: args.workOrderId,
            storagePath: attachment.storagePath,
            error: e?.message ?? String(e),
          });
        }
      }
    }

    if (!uri) continue;

    out.push({
      id: attachment.photoId ?? attachment.id ?? attachment.storagePath,
      uri,
      createdAt: toEpoch(attachment.createdAt),
      width: attachment.width ?? null,
      height: attachment.height ?? null,
      fileName: attachment.fileName ?? null,
      mimeType: attachment.contentType ?? null,
      fileSize: attachment.sizeBytes ?? null,
      source: "gallery",
    });
  }

  if (__DEV__) {
    console.log("[WorkOrderPhotos][attachment-photo-read]", {
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      attachmentsCount: attachments.length,
      resolvedCount: out.length,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestRemoteAttachmentCount: attachments.length,
      latestRemoteFetchError: null,
    });
  }

  return out;
}

export function getWorkOrderPhotos(workOrderId: string): WorkPhoto[] {
  const rows = listWorkOrderPhotos(workOrderId).map((p) => ({
    id: p.id,
    uri: p.uri,
    createdAt: p.createdAt,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    source: "gallery" as const,
  }));

  if (__DEV__) {
    updatePhotoDevDiagnostics(workOrderId, {
      latestLocalRowCount: rows.length,
    });
  }

  return rows;
}

export async function addWorkOrderPhoto(args: { workOrderId: string; photo: WorkPhoto }): Promise<string> {
  assertRolePermission("addWorkOrderPhoto");
  const photoTraceId = `photo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const uriScheme = getUriScheme(args.photo.uri);
  const woBeforeRowWrite = getWorkOrderById(args.workOrderId);
  const currentAttachmentsCount = woBeforeRowWrite?.orgId
    ? normalizeWorkOrderAttachments((woBeforeRowWrite as any).attachments, {
        orgId: woBeforeRowWrite.orgId,
        workOrderId: args.workOrderId,
      }).length
    : 0;

  if (__DEV__) {
    const auth = getAuth(getApp());
    console.log("[WorkOrderPhotos][addWorkOrderPhoto-start]", {
      traceId: photoTraceId,
      authUid: auth.currentUser?.uid ?? null,
      authEmail: auth.currentUser?.email ?? null,
      orgId: woBeforeRowWrite?.orgId ?? null,
      workOrderId: args.workOrderId,
      uriScheme,
      currentAttachmentsCount,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      lastPhotoTraceId: photoTraceId,
      latestUploadStage: "addWorkOrderPhoto-start",
      latestAttachmentWriteStage: "addWorkOrderPhoto-start",
      latestUploadLocalUri: String(args.photo.uri ?? "") || null,
      latestUploadUriScheme: uriScheme,
      latestSelectedOrgId: woBeforeRowWrite?.orgId ?? null,
      latestAuthUid: auth.currentUser?.uid ?? null,
      latestAuthEmail: auth.currentUser?.email ?? null,
    });
  }

  const id = addWorkOrderPhotoRow({
    id: args.photo.id,
    workOrderId: args.workOrderId,
    uri: args.photo.uri,
    createdAt: args.photo.createdAt,
    lat: args.photo.lat ?? null,
    lng: args.photo.lng ?? null,
  });

  const wo = getWorkOrderById(args.workOrderId);

  if (__DEV__) {
    console.log("[WorkOrderPhotos][local-photo-row-created]", {
      traceId: photoTraceId,
      workOrderId: args.workOrderId,
      localPhotoId: id,
      localUri: args.photo.uri,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestUploadStage: "local-photo-row-created",
    });
  }

  emitDbChanged();

  if (!wo?.orgId) {
    const missingOrgError = new Error("Cannot sync photo attachment: work order orgId is missing");
    if (__DEV__) {
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestUploadStatus: "failed",
        latestAttachmentWriteStatus: "failed",
        latestUploadStage: "missing-org-id",
        latestAttachmentWriteStage: "missing-org-id",
        lastPhotoTraceId: photoTraceId,
        latestUploadErrorCode: "missing-org-id",
        latestUploadErrorMessage: missingOrgError.message,
        latestRemoteFetchError: missingOrgError.message,
      });
    }
    throw missingOrgError;
  }

  try {
    const attachment = await uploadPhotoAndBuildAttachment({
      traceId: photoTraceId,
      orgId: wo.orgId,
      workOrderId: args.workOrderId,
      photo: args.photo,
    });

    await appendAttachmentToWorkOrder({
      traceId: photoTraceId,
      orgId: wo.orgId,
      workOrderId: args.workOrderId,
      attachment,
    });
  } catch (errorRaw: unknown) {
    const err = stringifyStorageError(errorRaw);
    if (__DEV__) {
      updatePhotoDevDiagnostics(args.workOrderId, {
        latestUploadStatus: "failed",
        latestAttachmentWriteStatus: "failed",
        latestUploadStage: "attachment-sync-failed",
        latestAttachmentWriteStage: "attachment-sync-failed",
        lastPhotoTraceId: photoTraceId,
        latestAttachmentWriteErrorCode: err.code,
        latestAttachmentWriteErrorMessage: err.message,
        latestRemoteFetchError: err.details || err.message,
      });
    }

    console.warn("[WorkOrderPhotos] attachment sync failed", {
      traceId: photoTraceId,
      workOrderId: args.workOrderId,
      photoId: args.photo.id,
      code: err.code,
      error: err.message,
      details: err.details,
    });
    if (isStorageUnauthorizedCode(err.code)) {
      const userFacing = new Error(
        "Photo upload failed: storage/unauthorized. Check org membership and Storage rules.",
      );
      (userFacing as any).code = err.code;
      throw userFacing;
    }
    throw errorRaw;
  }

  return id;
}

export function removeWorkOrderPhoto(photoId: string) {
  assertRolePermission("addWorkOrderPhoto");
  removeWorkOrderPhotoRow(photoId);
  emitDbChanged();
}
