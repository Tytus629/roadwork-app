import { requireOrgId } from "../org/requireOrg";

export type OrgOwnedEntityType =
  | "workOrders"
  | "assets"
  | "signs"
  | "inspections"
  | "exports"
  | "attachments";

export type OrgScopedUploadMeta = {
  orgId: string;
  entityType: OrgOwnedEntityType;
  entityId: string;
  storagePath: string;
};

function cleanSegment(value: string, fieldName: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error(`Missing ${fieldName}`);
  // Prevent accidental nested segments and malformed paths.
  return raw.replace(/^\/+|\/+$/g, "").replace(/\s+/g, "_");
}

function cleanFileName(fileName: string): string {
  const raw = cleanSegment(fileName, "fileName");
  return raw.replace(/[^a-zA-Z0-9._-]/g, "_");
}

function orgRoot(orgIdRaw: string): string {
  const orgId = cleanSegment(requireOrgId(orgIdRaw), "orgId");
  return `orgs/${orgId}`;
}

export function workOrderPhotoPath(args: {
  orgId: string;
  workOrderId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/workOrders/${cleanSegment(args.workOrderId, "workOrderId")}/${cleanFileName(args.fileName)}`;
}

export function assetPhotoPath(args: {
  orgId: string;
  assetId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/assets/${cleanSegment(args.assetId, "assetId")}/photos/${cleanFileName(args.fileName)}`;
}

export function signPhotoPath(args: {
  orgId: string;
  signId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/signs/${cleanSegment(args.signId, "signId")}/photos/${cleanFileName(args.fileName)}`;
}

export function inspectionAttachmentPath(args: {
  orgId: string;
  inspectionId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/inspections/${cleanSegment(args.inspectionId, "inspectionId")}/attachments/${cleanFileName(args.fileName)}`;
}

export function exportFilePath(args: {
  orgId: string;
  exportId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/exports/${cleanSegment(args.exportId, "exportId")}/${cleanFileName(args.fileName)}`;
}

export function attachmentPath(args: {
  orgId: string;
  entityType: string;
  entityId: string;
  fileName: string;
}): string {
  return `${orgRoot(args.orgId)}/attachments/${cleanSegment(args.entityType, "entityType")}/${cleanSegment(args.entityId, "entityId")}/${cleanFileName(args.fileName)}`;
}

export function isOrgScopedStoragePath(orgIdRaw: string, storagePathRaw: string): boolean {
  const orgPrefix = `${orgRoot(orgIdRaw)}/`;
  const storagePath = cleanSegment(storagePathRaw, "storagePath");
  return storagePath.startsWith(orgPrefix);
}

export function assertOrgScopedStoragePath(orgIdRaw: string, storagePathRaw: string): string {
  const storagePath = cleanSegment(storagePathRaw, "storagePath");
  if (!isOrgScopedStoragePath(orgIdRaw, storagePath)) {
    throw new Error(
      `Org-owned uploads must use org-scoped paths. Expected prefix ${orgRoot(orgIdRaw)}/ but got ${storagePath}`,
    );
  }
  return storagePath;
}

/**
 * Runtime safety guard for upload-like payloads sent through outbox/callables.
 * If a payload includes storage paths, enforce org scoping.
 */
export function assertOrgScopedPathsInPayload(orgIdRaw: string, payload: unknown): void {
  if (!payload || typeof payload !== "object") return;
  const p = payload as Record<string, unknown>;

  if (typeof p.storagePath === "string") {
    assertOrgScopedStoragePath(orgIdRaw, p.storagePath);
  }

  if (Array.isArray(p.storagePaths)) {
    for (const path of p.storagePaths) {
      if (typeof path === "string") assertOrgScopedStoragePath(orgIdRaw, path);
    }
  }

  if (Array.isArray(p.photoRefs)) {
    for (const ref of p.photoRefs) {
      if (!ref || typeof ref !== "object") continue;
      const x = ref as Record<string, unknown>;
      if (typeof x.storagePath === "string") {
        assertOrgScopedStoragePath(orgIdRaw, x.storagePath);
      }
      if (typeof x.entityId !== "string" || !x.entityId.trim()) {
        throw new Error("Upload metadata must include entityId.");
      }
    }
  }

  if (Array.isArray(p.attachments)) {
    for (const attachment of p.attachments) {
      if (!attachment || typeof attachment !== "object") continue;
      const x = attachment as Record<string, unknown>;
      if (typeof x.storagePath === "string") {
        assertOrgScopedStoragePath(orgIdRaw, x.storagePath);
      }
    }
  }
}

export function createOrgScopedUploadMeta(args: {
  orgId: string;
  entityType: OrgOwnedEntityType;
  entityId: string;
  storagePath: string;
}): OrgScopedUploadMeta {
  const orgId = requireOrgId(args.orgId);
  const entityType = args.entityType;
  const entityId = cleanSegment(args.entityId, "entityId");
  const storagePath = assertOrgScopedStoragePath(orgId, args.storagePath);

  return {
    orgId,
    entityType,
    entityId,
    storagePath,
  };
}
