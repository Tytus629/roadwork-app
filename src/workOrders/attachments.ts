import type { WorkOrder, WorkOrderAttachment } from "../types/WorkOrder";

function toNonEmptyString(value: unknown): string | null {
  const next = String(value ?? "").trim();
  return next ? next : null;
}

function toEpoch(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value && typeof value === "object") {
    const maybeMillis = (value as any)?.toMillis;
    if (typeof maybeMillis === "function") {
      const ms = Number(maybeMillis.call(value));
      if (Number.isFinite(ms)) return ms;
    }
    const seconds = Number((value as any)?.seconds);
    if (Number.isFinite(seconds)) return Math.round(seconds * 1000);
  }
  return Date.now();
}

function canonicalKey(a: Partial<WorkOrderAttachment>): string | null {
  return toNonEmptyString(a.id) ?? toNonEmptyString(a.photoId) ?? toNonEmptyString(a.storagePath);
}

function toAttachment(
  input: unknown,
  fallback: { orgId: string; workOrderId: string },
): WorkOrderAttachment | null {
  if (!input || typeof input !== "object") return null;

  const x = input as Record<string, any>;
  const orgId = toNonEmptyString(x.orgId) ?? fallback.orgId;
  const workOrderId = toNonEmptyString(x.workOrderId) ?? toNonEmptyString(x.entityId) ?? fallback.workOrderId;
  const storagePath = toNonEmptyString(x.storagePath);

  if (!orgId || !workOrderId || !storagePath) return null;

  const createdAt = toEpoch(x.createdAt);
  const updatedAt = toEpoch(x.updatedAt ?? x.createdAt);

  return {
    id: toNonEmptyString(x.id) ?? undefined,
    photoId: toNonEmptyString(x.photoId ?? x.id) ?? undefined,
    orgId,
    workOrderId,
    entityType: "workOrder",
    entityId: workOrderId,
    storagePath,
    fileName: toNonEmptyString(x.fileName) ?? undefined,
    contentType: toNonEmptyString(x.contentType ?? x.mimeType) ?? undefined,
    sizeBytes: typeof x.sizeBytes === "number" ? x.sizeBytes : typeof x.fileSize === "number" ? x.fileSize : undefined,
    width: typeof x.width === "number" ? x.width : undefined,
    height: typeof x.height === "number" ? x.height : undefined,
    downloadURL: toNonEmptyString(x.downloadURL ?? x.downloadUrl) ?? undefined,
    createdAt,
    updatedAt,
    createdByUid: toNonEmptyString(x.createdByUid) ?? undefined,
    createdByName: toNonEmptyString(x.createdByName ?? x.createdByDisplayName) ?? undefined,
    createdByEmail: toNonEmptyString(x.createdByEmail) ?? undefined,
    deleted: x.deleted === true || x.deleted === 1,
  };
}

export function normalizeWorkOrderAttachments(
  attachmentsRaw: unknown,
  fallback: { orgId: string; workOrderId: string },
): WorkOrderAttachment[] {
  if (!Array.isArray(attachmentsRaw)) return [];

  const byKey = new Map<string, WorkOrderAttachment>();
  for (const raw of attachmentsRaw) {
    const next = toAttachment(raw, fallback);
    if (!next || next.deleted) continue;
    const key = canonicalKey(next);
    if (!key) continue;
    byKey.set(key, next);
  }

  return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function mergeWorkOrderAttachments(
  currentRaw: unknown,
  incomingRaw: unknown,
  fallback: { orgId: string; workOrderId: string },
): WorkOrderAttachment[] {
  const current = normalizeWorkOrderAttachments(currentRaw, fallback);
  const incoming = normalizeWorkOrderAttachments(incomingRaw, fallback);
  const byKey = new Map<string, WorkOrderAttachment>();

  for (const item of current) {
    const key = canonicalKey(item);
    if (key) byKey.set(key, item);
  }

  for (const item of incoming) {
    const key = canonicalKey(item);
    if (!key) continue;
    byKey.set(key, item);
  }

  return Array.from(byKey.values()).sort((a, b) => b.createdAt - a.createdAt);
}

export function summarizeWorkOrderAttachmentContract(workOrder: Pick<WorkOrder, "id" | "orgId" | "attachments">): {
  workOrderId: string;
  attachmentsCount: number;
  storagePaths: string[];
  missingRequired: string[];
  invalidEntityBindingCount: number;
} {
  const normalized = normalizeWorkOrderAttachments(workOrder.attachments, {
    orgId: workOrder.orgId,
    workOrderId: workOrder.id,
  });

  const missingRequired: string[] = [];
  let invalidEntityBindingCount = 0;

  for (const item of normalized) {
    if (!item.orgId) missingRequired.push(`attachment ${item.id ?? item.storagePath}: orgId`);
    if (!item.workOrderId) missingRequired.push(`attachment ${item.id ?? item.storagePath}: workOrderId`);
    if (!item.storagePath) missingRequired.push(`attachment ${item.id ?? "unknown"}: storagePath`);
    if (item.entityType !== "workOrder" || item.entityId !== workOrder.id) {
      invalidEntityBindingCount += 1;
    }
  }

  return {
    workOrderId: workOrder.id,
    attachmentsCount: normalized.length,
    storagePaths: normalized.map((a) => a.storagePath),
    missingRequired,
    invalidEntityBindingCount,
  };
}
