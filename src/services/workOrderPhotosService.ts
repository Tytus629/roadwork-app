import type { WorkPhoto } from "../types/workItem";
import {
  addWorkOrderPhoto as addWorkOrderPhotoRow,
  listWorkOrderPhotos,
  removeWorkOrderPhoto as removeWorkOrderPhotoRow,
} from "../db/workOrderPhotosRepo";
import { getWorkOrderById } from "../db/workOrdersRepo";
import { emitDbChanged } from "../state/DbEvents";
import { assertRolePermission } from "../permissions/rolePermissions";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import {
  collection,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
} from "@react-native-firebase/firestore";
import { getDownloadURL, getStorage, ref } from "@react-native-firebase/storage";
import { workOrderPhotoPath } from "../firebase/storagePaths";

type PhotoDevDiagnostics = {
  latestUploadSuccessAt?: number;
  latestMetadataWriteSuccessAt?: number;
  latestRemoteFetchAt?: number;
  latestRemoteFetchCount?: number;
  latestRemoteFetchError?: string | null;
};

const devPhotoDiagnosticsByWorkOrder = new Map<string, PhotoDevDiagnostics>();

function updatePhotoDevDiagnostics(workOrderId: string, patch: Partial<PhotoDevDiagnostics>) {
  if (!__DEV__) return;
  const prev = devPhotoDiagnosticsByWorkOrder.get(workOrderId) ?? {};
  devPhotoDiagnosticsByWorkOrder.set(workOrderId, {
    ...prev,
    ...patch,
  });
}

export function getWorkOrderPhotoDevDiagnostics(workOrderId: string): PhotoDevDiagnostics | null {
  if (!__DEV__) return null;
  return devPhotoDiagnosticsByWorkOrder.get(workOrderId) ?? null;
}

function safePhotoFileName(photo: WorkPhoto): string {
  const fromMeta = String(photo.fileName ?? "").trim();
  if (fromMeta) return fromMeta;

  const uri = String(photo.uri ?? "").trim();
  const fromUri = uri.split("?")[0].split("/").pop() ?? "";
  if (fromUri) return fromUri;

  return `${photo.id}.jpg`;
}

async function uploadAndWriteRemotePhoto(args: {
  orgId: string;
  workOrderId: string;
  photo: WorkPhoto;
}): Promise<void> {
  const app = getApp();
  const storage = getStorage(app);
  const firestore = getFirestore(app);
  const auth = getAuth(app);

  const fileName = safePhotoFileName(args.photo);
  const storagePath = workOrderPhotoPath({
    orgId: args.orgId,
    workOrderId: args.workOrderId,
    fileName,
  });

  const storageRef = ref(storage, storagePath);
  await storageRef.putFile(args.photo.uri, {
    contentType: args.photo.mimeType ?? "image/jpeg",
  });

  if (__DEV__) {
    console.log("[WorkOrderPhotos][upload-success]", {
      workOrderId: args.workOrderId,
      orgId: args.orgId,
      storagePath,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestUploadSuccessAt: Date.now(),
      latestRemoteFetchError: null,
    });
  }

  const downloadUrl = await getDownloadURL(storageRef);
  const photoDocRef = doc(
    collection(
      doc(collection(firestore, "orgs"), args.orgId),
      "workOrders",
      args.workOrderId,
      "photos",
    ),
    args.photo.id,
  );

  await setDoc(
    photoDocRef,
    {
      id: args.photo.id,
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      createdByUid: auth.currentUser?.uid ?? null,
      storagePath,
      downloadUrl,
      contentType: args.photo.mimeType ?? "image/jpeg",
      fileName,
      fileSize: args.photo.fileSize ?? null,
      width: args.photo.width ?? null,
      height: args.photo.height ?? null,
      lat: args.photo.lat ?? null,
      lng: args.photo.lng ?? null,
      createdAt: args.photo.createdAt,
      createdAtServer: serverTimestamp(),
      updatedAtServer: serverTimestamp(),
    },
    { merge: true },
  );

  if (__DEV__) {
    console.log("[WorkOrderPhotos][metadata-write-success]", {
      workOrderId: args.workOrderId,
      orgId: args.orgId,
      photoId: args.photo.id,
      storagePath,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestMetadataWriteSuccessAt: Date.now(),
      latestRemoteFetchError: null,
    });
  }
}

export async function getRemoteWorkOrderPhotos(args: {
  orgId: string;
  workOrderId: string;
}): Promise<WorkPhoto[]> {
  const app = getApp();
  const firestore = getFirestore(app);

  const photoColl = collection(
    doc(collection(firestore, "orgs"), args.orgId),
    "workOrders",
    args.workOrderId,
    "photos",
  );

  const snap = await getDocs(query(photoColl, orderBy("createdAt", "desc")));
  const out: WorkPhoto[] = [];

  for (const d of snap.docs) {
    const x = d.data() as Record<string, any>;
    const uri = String(x.downloadUrl ?? "").trim();
    if (!uri) continue;

    out.push({
      id: String(x.id ?? d.id),
      uri,
      createdAt: Number(x.createdAt ?? Date.now()),
      width: x.width ?? null,
      height: x.height ?? null,
      fileName: x.fileName ?? null,
      mimeType: x.contentType ?? null,
      fileSize: x.fileSize ?? null,
      lat: x.lat ?? null,
      lng: x.lng ?? null,
      source: "gallery",
    });
  }

  if (__DEV__) {
    console.log("[WorkOrderPhotos][remote-fetch-count]", {
      orgId: args.orgId,
      workOrderId: args.workOrderId,
      count: out.length,
    });
    updatePhotoDevDiagnostics(args.workOrderId, {
      latestRemoteFetchAt: Date.now(),
      latestRemoteFetchCount: out.length,
      latestRemoteFetchError: null,
    });
  }

  return out;
}

export function getWorkOrderPhotos(workOrderId: string): WorkPhoto[] {
  return listWorkOrderPhotos(workOrderId).map((p) => ({
    id: p.id,
    uri: p.uri,
    createdAt: p.createdAt,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    source: "gallery",
  }));
}

export function addWorkOrderPhoto(args: { workOrderId: string; photo: WorkPhoto }): string {
  assertRolePermission("addWorkOrderPhoto");

  const id = addWorkOrderPhotoRow({
    id: args.photo.id,
    workOrderId: args.workOrderId,
    uri: args.photo.uri,
    createdAt: args.photo.createdAt,
    lat: args.photo.lat ?? null,
    lng: args.photo.lng ?? null,
  });

  const wo = getWorkOrderById(args.workOrderId);
  if (wo?.orgId) {
    void uploadAndWriteRemotePhoto({
      orgId: wo.orgId,
      workOrderId: args.workOrderId,
      photo: args.photo,
    }).catch((e) => {
      if (__DEV__) {
        updatePhotoDevDiagnostics(args.workOrderId, {
          latestRemoteFetchError: e?.message ?? String(e),
        });
      }
      console.warn("[WorkOrderPhotos] cloud sync failed", {
        workOrderId: args.workOrderId,
        photoId: args.photo.id,
        error: e?.message ?? String(e),
      });
    });
  }

  emitDbChanged();
  return id;
}

export function removeWorkOrderPhoto(photoId: string) {
  assertRolePermission("addWorkOrderPhoto");
  removeWorkOrderPhotoRow(photoId);
  emitDbChanged();
}
