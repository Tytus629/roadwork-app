import { assetEventsRepo } from "../repositories/assetEventsRepo";
import { assetsRepo } from "../repositories/assetsRepo";
import { notificationsRepo } from "../repositories/notificationsRepo";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { listLogEntries, type LogEntry } from "./logService";
import { getCurrentUserIdentitySnapshot } from "./userProfileService";
import type { Asset } from "../types/Asset";
import type { AssetEvent } from "../types/AssetEvent";
import type { WorkOrder } from "../types/WorkOrder";
import type { NotificationCategory, NotificationInboxRow } from "../types/NotificationInbox";
import { formatWorkType } from "../constants/workOrderTypes";
import { normalizeEmail, resolveIdentityDisplayName, trimToNull } from "../utils/userIdentity";
import { projectAssetEventToActivity } from "../utils/activityProjection";

const RECONCILE_SOURCE_LIMIT = 400;

type CurrentRecipient = {
  uid: string | null;
  email: string | null;
  displayName: string;
};

type NotificationCandidate = {
  category: NotificationCategory;
  sourceType: string;
  sourceId: string;
  sourceCreatedAt: number;
  targetType: NotificationInboxRow["targetType"];
  targetId: string | null;
  title: string;
  body: string | null;
  actorUid: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown>;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function actorLabel(args: {
  uid?: string | null;
  email?: string | null;
  displayName?: string | null;
}): string {
  const displayName = trimToNull(args.displayName);
  if (displayName) return displayName;
  const email = normalizeEmail(args.email);
  if (email) return email;
  const uid = trimToNull(args.uid);
  return uid ?? "Someone";
}

function isCurrentRecipientMatch(args: {
  candidateUid?: string | null;
  candidateEmail?: string | null;
  current: CurrentRecipient;
}): boolean {
  const candidateUid = trimToNull(args.candidateUid);
  if (candidateUid && args.current.uid && candidateUid === args.current.uid) return true;

  const candidateEmail = normalizeEmail(args.candidateEmail);
  return !!candidateEmail && !!args.current.email && candidateEmail === args.current.email;
}

function isActorCurrentUser(args: {
  actorUid?: string | null;
  actorEmail?: string | null;
  current: CurrentRecipient;
}): boolean {
  return isCurrentRecipientMatch({
    candidateUid: args.actorUid,
    candidateEmail: args.actorEmail,
    current: args.current,
  });
}

function workOrderLabel(workOrder: WorkOrder | null | undefined, fallbackType?: unknown): string {
  const workType = String(workOrder?.type ?? fallbackType ?? "").trim();
  return workType ? `${formatWorkType(workType)} work order` : "work order";
}

function assetLabel(asset: Asset | null | undefined): string {
  const subtype = String(asset?.subtype ?? "").trim();
  if (subtype) return subtype;
  const assetType = String(asset?.assetType ?? "").trim();
  return assetType ? assetType.toLowerCase().replace(/_/g, " ") : "asset";
}

function buildNotificationId(orgId: string, current: CurrentRecipient, sourceType: string, sourceId: string): string {
  const recipientKey = current.uid ?? current.email ?? "unknown";
  return `notif:${orgId}:${recipientKey}:${sourceType}:${sourceId}`;
}

function materializeCandidate(args: {
  orgId: string;
  current: CurrentRecipient;
  candidate: NotificationCandidate;
}): NotificationInboxRow {
  const now = Date.now();
  return {
    id: buildNotificationId(args.orgId, args.current, args.candidate.sourceType, args.candidate.sourceId),
    orgId: args.orgId,
    recipientUid: args.current.uid,
    recipientEmail: args.current.email,
    category: args.candidate.category,
    sourceType: args.candidate.sourceType,
    sourceId: args.candidate.sourceId,
    sourceCreatedAt: args.candidate.sourceCreatedAt,
    targetType: args.candidate.targetType,
    targetId: args.candidate.targetId,
    title: args.candidate.title,
    body: args.candidate.body,
    actorUid: args.candidate.actorUid,
    actorName: args.candidate.actorName,
    actorEmail: args.candidate.actorEmail,
    metadata: args.candidate.metadata,
    readAt: null,
    openedAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

function buildAssignmentNotification(args: {
  entry: LogEntry;
  workOrder: WorkOrder | null;
  current: CurrentRecipient;
}): NotificationCandidate | null {
  const payload = toRecord(args.entry.payload);
  const actorUid = trimToNull(payload.actorUid as string | null | undefined);
  const actorEmail = normalizeEmail(payload.actorEmail as string | null | undefined);
  const actorName = trimToNull(payload.actorDisplayName as string | null | undefined) ?? trimToNull(payload.actorName as string | null | undefined);

  if (isActorCurrentUser({ actorUid, actorEmail, current: args.current })) {
    return null;
  }

  const wasMine = isCurrentRecipientMatch({
    candidateUid: payload.assignedFromUid as string | null | undefined,
    candidateEmail: payload.assignedFromEmail as string | null | undefined,
    current: args.current,
  });
  const isMine = isCurrentRecipientMatch({
    candidateUid: payload.assignedToUid as string | null | undefined,
    candidateEmail: payload.assignedToEmail as string | null | undefined,
    current: args.current,
  });

  if (!wasMine && !isMine) return null;

  const targetId = trimToNull(args.entry.workOrderId);
  const label = workOrderLabel(args.workOrder, payload.workOrderType);
  const actor = actorLabel({ uid: actorUid, email: actorEmail, displayName: actorName });

  if (!wasMine && isMine) {
    return {
      category: "assignment",
      sourceType: "work_order_log",
      sourceId: args.entry.id,
      sourceCreatedAt: args.entry.createdAt,
      targetType: "work_order",
      targetId,
      title: "Assigned to you",
      body: `${actor} assigned ${label} to you.`,
      actorUid,
      actorName,
      actorEmail,
      metadata: {
        reason: "assigned_to_me",
        event: args.entry.event,
        workOrderId: targetId,
      },
    };
  }

  if (wasMine && !isMine) {
    return {
      category: "assignment_removed",
      sourceType: "work_order_log",
      sourceId: args.entry.id,
      sourceCreatedAt: args.entry.createdAt,
      targetType: "work_order",
      targetId,
      title: "Assignment removed",
      body: `${actor} removed you from ${label}.`,
      actorUid,
      actorName,
      actorEmail,
      metadata: {
        reason: "removed_from_me",
        event: args.entry.event,
        workOrderId: targetId,
      },
    };
  }

  return null;
}

function buildCreatedNotification(args: {
  entry: LogEntry;
  workOrder: WorkOrder | null;
  current: CurrentRecipient;
}): NotificationCandidate | null {
  const payload = toRecord(args.entry.payload);
  const actorUid = trimToNull(payload.actorUid as string | null | undefined);
  const actorEmail = normalizeEmail(payload.actorEmail as string | null | undefined);
  const actorName = trimToNull(payload.actorDisplayName as string | null | undefined) ?? trimToNull(payload.actorName as string | null | undefined);

  if (isActorCurrentUser({ actorUid, actorEmail, current: args.current })) {
    return null;
  }

  const assignedToMe = isCurrentRecipientMatch({
    candidateUid: args.workOrder?.assignedToUid,
    candidateEmail: args.workOrder?.assignedToEmail,
    current: args.current,
  });

  if (!assignedToMe) return null;

  const actor = actorLabel({ uid: actorUid, email: actorEmail, displayName: actorName });
  const targetId = trimToNull(args.entry.workOrderId);
  const label = workOrderLabel(args.workOrder, payload.workOrderType);

  return {
    category: "assignment",
    sourceType: "work_order_log",
    sourceId: args.entry.id,
    sourceCreatedAt: args.entry.createdAt,
    targetType: "work_order",
    targetId,
    title: "New assigned work",
    body: `${actor} created ${label} and assigned it to you.`,
    actorUid,
    actorName,
    actorEmail,
    metadata: {
      reason: "created_assigned_to_me",
      event: args.entry.event,
      workOrderId: targetId,
    },
  };
}

function buildStatusNotification(args: {
  entry: LogEntry;
  workOrder: WorkOrder | null;
  current: CurrentRecipient;
}): NotificationCandidate | null {
  const payload = toRecord(args.entry.payload);
  const actorUid = trimToNull(payload.actorUid as string | null | undefined);
  const actorEmail = normalizeEmail(payload.actorEmail as string | null | undefined);
  const actorName = trimToNull(payload.actorDisplayName as string | null | undefined) ?? trimToNull(payload.actorName as string | null | undefined);

  if (isActorCurrentUser({ actorUid, actorEmail, current: args.current })) {
    return null;
  }

  const assignedToMe = isCurrentRecipientMatch({
    candidateUid: args.workOrder?.assignedToUid,
    candidateEmail: args.workOrder?.assignedToEmail,
    current: args.current,
  });

  if (!assignedToMe) return null;

  const statusTo = String(payload.statusTo ?? "").trim();
  if (!statusTo) return null;

  const actor = actorLabel({ uid: actorUid, email: actorEmail, displayName: actorName });
  const targetId = trimToNull(args.entry.workOrderId);
  const label = workOrderLabel(args.workOrder, payload.workOrderType);

  return {
    category: "status",
    sourceType: "work_order_log",
    sourceId: args.entry.id,
    sourceCreatedAt: args.entry.createdAt,
    targetType: "work_order",
    targetId,
    title: "Status changed",
    body: `${actor} changed ${label} to ${statusTo.replace(/_/g, " ")}.`,
    actorUid,
    actorName,
    actorEmail,
    metadata: {
      reason: "status_changed_assigned_to_me",
      event: args.entry.event,
      statusFrom: payload.statusFrom ?? null,
      statusTo,
      workOrderId: targetId,
    },
  };
}

function extractMentionRecipients(payload: Record<string, unknown>): Array<{
  uid: string | null;
  email: string | null;
  displayName: string | null;
}> {
  const raw = Array.isArray(payload.mentions) ? payload.mentions : [];
  return raw.map((item) => {
    const record = toRecord(item);
    return {
      uid: trimToNull(record.uid as string | null | undefined),
      email: normalizeEmail(record.email as string | null | undefined),
      displayName: trimToNull(record.displayName as string | null | undefined),
    };
  });
}

function buildMentionNotification(args: {
  entry: LogEntry;
  workOrder: WorkOrder | null;
  current: CurrentRecipient;
}): NotificationCandidate | null {
  const payload = toRecord(args.entry.payload);
  const actorUid = trimToNull(payload.actorUid as string | null | undefined);
  const actorEmail = normalizeEmail(payload.actorEmail as string | null | undefined);
  const actorName =
    trimToNull(payload.actorDisplayName as string | null | undefined) ??
    trimToNull(payload.actorName as string | null | undefined);

  if (isActorCurrentUser({ actorUid, actorEmail, current: args.current })) {
    return null;
  }

  const mentionMatch = extractMentionRecipients(payload).find((mention) =>
    isCurrentRecipientMatch({
      candidateUid: mention.uid,
      candidateEmail: mention.email,
      current: args.current,
    }),
  );
  if (!mentionMatch) return null;

  const actor = actorLabel({ uid: actorUid, email: actorEmail, displayName: actorName ?? "A teammate" });
  const noteExcerpt = trimToNull(payload.noteExcerpt as string | null | undefined);
  const targetId = trimToNull(args.entry.workOrderId);
  const label = workOrderLabel(args.workOrder, payload.workOrderType);
  const assignedToMe = isCurrentRecipientMatch({
    candidateUid: args.workOrder?.assignedToUid,
    candidateEmail: args.workOrder?.assignedToEmail,
    current: args.current,
  });

  return {
    category: "mention",
    sourceType: "work_order_log",
    sourceId: args.entry.id,
    sourceCreatedAt: args.entry.createdAt,
    targetType: "work_order",
    targetId,
    title: assignedToMe ? "Mentioned you on assigned work" : "Mentioned you in a work order note",
    body: noteExcerpt
      ? `${actor} mentioned you in ${label}: ${noteExcerpt}`
      : `${actor} mentioned you in ${label}.`,
    actorUid,
    actorName,
    actorEmail,
    metadata: {
      reason: "mention",
      event: args.entry.event,
      noteExcerpt,
      workOrderId: targetId,
      mentionDisplayName: mentionMatch.displayName,
    },
  };
}

function buildAssetNotification(args: {
  event: AssetEvent;
  asset: Asset | null;
  workOrder: WorkOrder | null;
  current: CurrentRecipient;
}): NotificationCandidate | null {
  if (!args.workOrder) return null;
  const assignedToMe = isCurrentRecipientMatch({
    candidateUid: args.workOrder.assignedToUid,
    candidateEmail: args.workOrder.assignedToEmail,
    current: args.current,
  });
  if (!assignedToMe) return null;

  const actorUid = trimToNull(args.event.actorUid) ?? trimToNull(args.event.byUid);
  const actorEmail = normalizeEmail(args.event.actorEmail) ?? normalizeEmail(args.event.byEmail);
  const actorName = trimToNull(args.event.actorDisplayName) ?? trimToNull(args.event.byDisplayName) ?? trimToNull(args.event.actorName) ?? trimToNull(args.event.byName);

  if (isActorCurrentUser({ actorUid, actorEmail, current: args.current })) {
    return null;
  }

  const projected = projectAssetEventToActivity(args.event);
  const allowedActions = new Set(["asset_created", "repair", "replace"]);
  if (!allowedActions.has(projected.actionType)) return null;

  const actor = actorLabel({ uid: actorUid, email: actorEmail, displayName: actorName });
  const verbByAction: Record<string, string> = {
    asset_created: "created",
    repair: "updated",
    replace: "replaced",
  };
  const verb = verbByAction[projected.actionType] ?? "updated";
  const assetText = assetLabel(args.asset);

  return {
    category: "asset_activity",
    sourceType: "asset_event",
    sourceId: String(args.event.id),
    sourceCreatedAt: Number(args.event.at ?? args.event.createdAt ?? Date.now()),
    targetType: trimToNull(args.event.assetId) ? "asset" : "work_order",
    targetId: trimToNull(args.event.assetId) ?? trimToNull(args.event.workOrderId),
    title: "Asset activity on your work",
    body: `${actor} ${verb} ${assetText} linked to your ${workOrderLabel(args.workOrder)}.`,
    actorUid,
    actorName,
    actorEmail,
    metadata: {
      reason: "asset_activity_assigned_to_me",
      actionType: projected.actionType,
      assetId: args.event.assetId,
      workOrderId: args.event.workOrderId ?? null,
    },
  };
}

async function loadCurrentRecipient(): Promise<CurrentRecipient | null> {
  const identity = await getCurrentUserIdentitySnapshot();
  const uid = trimToNull(identity.uid);
  const email = normalizeEmail(identity.email);
  if (!uid && !email) return null;

  return {
    uid,
    email,
    displayName: resolveIdentityDisplayName(identity),
  };
}

export async function reconcileNotificationsForCurrentUser(args: {
  orgId: string;
  limit?: number;
}): Promise<{ recipient: CurrentRecipient | null; unreadCount: number }> {
  const orgId = String(args.orgId ?? "").trim();
  if (!orgId) return { recipient: null, unreadCount: 0 };

  const current = await loadCurrentRecipient();
  if (!current) return { recipient: null, unreadCount: 0 };

  const sourceLimit = Math.max(Number(args.limit ?? RECONCILE_SOURCE_LIMIT), RECONCILE_SOURCE_LIMIT);
  const [logEntries, assetEvents] = await Promise.all([
    Promise.resolve(listLogEntries(sourceLimit, orgId)),
    assetEventsRepo.listRecentForOrg({ orgId, limit: sourceLimit }),
  ]);

  const workOrderIds = new Set<string>();
  const assetIds = new Set<string>();

  for (const entry of logEntries) {
    const id = trimToNull(entry.workOrderId);
    if (id) workOrderIds.add(id);
  }
  for (const event of assetEvents) {
    const workOrderId = trimToNull(event.workOrderId);
    const assetId = trimToNull(event.assetId);
    if (workOrderId) workOrderIds.add(workOrderId);
    if (assetId) assetIds.add(assetId);
  }

  const workOrderMap = new Map<string, WorkOrder | null>(
    await Promise.all(
      [...workOrderIds].map(async (id) => [id, await workOrdersRepo.getById({ orgId, id })] as const),
    ),
  );
  const assetMap = new Map<string, Asset | null>(
    await Promise.all(
      [...assetIds].map(async (id) => [id, await assetsRepo.getById({ orgId, id })] as const),
    ),
  );

  const rows: NotificationInboxRow[] = [];

  for (const entry of logEntries) {
    const workOrder = workOrderMap.get(String(entry.workOrderId ?? "").trim()) ?? null;
    let candidate: NotificationCandidate | null = null;

    if (entry.event === "assignment_changed") {
      candidate = buildAssignmentNotification({ entry, workOrder, current });
    } else if (entry.event === "status_changed") {
      candidate = buildStatusNotification({ entry, workOrder, current });
    } else if (entry.event === "created") {
      candidate = buildCreatedNotification({ entry, workOrder, current });
    } else if (entry.event === "mention") {
      candidate = buildMentionNotification({ entry, workOrder, current });
    }

    if (candidate) {
      rows.push(materializeCandidate({ orgId, current, candidate }));
    }
  }

  for (const event of assetEvents) {
    const workOrderId = String(event.workOrderId ?? "").trim();
    const assetId = String(event.assetId ?? "").trim();
    const workOrder = workOrderId ? workOrderMap.get(workOrderId) ?? null : null;
    const asset = assetId ? assetMap.get(assetId) ?? null : null;
    const candidate = buildAssetNotification({ event, asset, workOrder, current });
    if (candidate) {
      rows.push(materializeCandidate({ orgId, current, candidate }));
    }
  }

  await notificationsRepo.upsertMany(rows);

  const unreadCount = await notificationsRepo.getUnreadCount({
    orgId,
    recipientUid: current.uid,
    recipientEmail: current.email,
  });

  return { recipient: current, unreadCount };
}
