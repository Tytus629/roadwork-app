export type PhotoDevDiagnostics = {
  lastOpenedWorkOrderId?: string;
  lastPhotoTraceId?: string | null;

  latestUploadStartedAt?: number;
  latestUploadSuccessAt?: number;
  latestUploadStatus?: "idle" | "started" | "success" | "failed";
  latestUploadStage?: string | null;
  latestUploadErrorCode?: string | null;
  latestUploadErrorMessage?: string | null;
  latestUploadStoragePath?: string | null;
  latestUploadLocalUri?: string | null;
  latestUploadFileName?: string | null;
  latestUploadOrgId?: string | null;
  latestUploadWorkOrderId?: string | null;
  latestUploadAssetId?: string | null;
  latestSelectedOrgId?: string | null;
  latestAuthUid?: string | null;
  latestAuthEmail?: string | null;
  latestDevEmulatorModeActive?: boolean | null;
  latestUploadNormalizedPath?: string | null;
  latestUploadUriScheme?: string | null;
  latestStorageEmulatorHost?: string | null;
  latestStorageBucket?: string | null;
  latestStorageAppName?: string | null;
  latestStorageLibrary?: string | null;
  latestStorageEmulatorTarget?: string | null;
  latestMembershipDocExists?: boolean | null;
  latestMembershipStatus?: string | null;
  latestMembershipRole?: string | null;
  latestMembershipActive?: string | null;
  latestMembershipWarning?: string | null;

  latestAttachmentBuildAt?: number;
  latestAttachmentWriteAt?: number;
  latestAttachmentWriteStatus?: "idle" | "started" | "success" | "failed";
  latestAttachmentWriteStage?: string | null;
  latestAttachmentWriteErrorCode?: string | null;
  latestAttachmentWriteErrorMessage?: string | null;

  latestQueuedAttachmentsCount?: number | null;
  latestQueuedAttachmentStoragePaths?: string[] | null;
  latestSentAttachmentsCount?: number | null;
  latestSentAttachmentStoragePaths?: string[] | null;
  latestBackendUpsertResult?: string | null;

  latestRemoteAttachmentCount?: number;
  latestLocalRowCount?: number;
  latestRemoteFetchError?: string | null;
  latestRenderUri?: string | null;
  latestRenderUriType?: "local" | "remote" | "unknown";
  latestRenderWorkOrderId?: string | null;
  latestRenderPhotoId?: string | null;
  latestRenderError?: string | null;
};

const devPhotoDiagnosticsByWorkOrder = new Map<string, PhotoDevDiagnostics>();
let globalPhotoDevDiagnostics: PhotoDevDiagnostics = {
  latestUploadStatus: "idle",
  latestAttachmentWriteStatus: "idle",
  latestStorageLibrary: "@react-native-firebase/storage",
};

export function updatePhotoDevDiagnostics(workOrderId: string, patch: Partial<PhotoDevDiagnostics>) {
  if (!__DEV__) return;
  const prev = devPhotoDiagnosticsByWorkOrder.get(workOrderId) ?? {};
  const next = {
    ...prev,
    ...patch,
  };
  devPhotoDiagnosticsByWorkOrder.set(workOrderId, next);
  globalPhotoDevDiagnostics = {
    ...globalPhotoDevDiagnostics,
    ...patch,
    lastOpenedWorkOrderId: workOrderId,
  };
}

export function getWorkOrderPhotoDevDiagnostics(workOrderId: string): PhotoDevDiagnostics | null {
  if (!__DEV__) return null;
  return devPhotoDiagnosticsByWorkOrder.get(workOrderId) ?? null;
}

export function getGlobalWorkOrderPhotoDevDiagnostics(): PhotoDevDiagnostics | null {
  if (!__DEV__) return null;
  return globalPhotoDevDiagnostics;
}
