import type { Asset } from "../types/Asset";
import type { WorkOrder } from "../types/WorkOrder";
import type { ActivityProjection } from "./activityProjection";
import { formatWorkType } from "../constants/workOrderTypes";
import { getAssetTypeLabel } from "./assetTypes";

function trimToNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return value as Record<string, unknown>;
}

function humanizeCode(value: unknown): string {
  const text = String(value ?? "").trim();
  if (!text) return "Unknown";
  return text
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function assignmentLabelFrom(source: Record<string, unknown>, prefix: string): string | null {
  return (
    trimToNull(source[`${prefix}Name`]) ??
    trimToNull(source[`${prefix}DisplayName`]) ??
    trimToNull(source[`${prefix}Email`]) ??
    trimToNull(source[`${prefix}Uid`])
  );
}

export function formatActivityTimestamp(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "Unknown time";
  return new Date(ts).toLocaleString();
}

export function getActivityActorLabel(activity: ActivityProjection): string {
  return (
    trimToNull(activity.actorName) ??
    trimToNull(activity.actorEmail) ??
    trimToNull(activity.actorUid) ??
    "Unknown"
  );
}

export function getWorkOrderTargetSummary(workOrder: WorkOrder | null | undefined): string | null {
  if (!workOrder) return null;
  return `${formatWorkType(workOrder.type)} work order`;
}

export function getAssetTargetSummary(asset: Asset | null | undefined): string | null {
  if (!asset) return null;
  return asset.subtype ?? getAssetTypeLabel(asset.assetType);
}

export function getActivityTargetSummary(args: {
  activity: ActivityProjection;
  workOrder?: WorkOrder | null;
  asset?: Asset | null;
}): string {
  const { activity, workOrder, asset } = args;
  const metadata = toRecord(activity.metadata);

  if (activity.targetType === "work_order") {
    return (
      getWorkOrderTargetSummary(workOrder) ??
      (trimToNull(metadata.workOrderTitle) ||
        (trimToNull(metadata.workOrderType)
          ? `${formatWorkType(String(metadata.workOrderType))} work order`
          : null)) ??
      "Work order"
    );
  }

  if (activity.targetType === "asset") {
    const details = toRecord(metadata.details);
    return (
      getAssetTargetSummary(asset) ??
      trimToNull(details.subtype) ??
      trimToNull(metadata.assetSubtype) ??
      (trimToNull(details.assetType) ? getAssetTypeLabel(details.assetType) : null) ??
      (trimToNull(metadata.assetType) ? getAssetTypeLabel(metadata.assetType) : null) ??
      "Asset"
    );
  }

  return "Activity";
}

export function getActivityActionLabel(activity: ActivityProjection): string {
  const metadata = toRecord(activity.metadata);
  const details = toRecord(metadata.details);

  if (activity.sourceType === "work_order_log") {
    if (activity.actionType === "created") return "created work order";

    if (activity.actionType === "mention") {
      const mentions = Array.isArray(metadata.mentions)
        ? metadata.mentions
            .map((value) => toRecord(value))
            .map((value) =>
              trimToNull(value.displayName) ??
              trimToNull(value.email) ??
              trimToNull(value.uid),
            )
            .filter(Boolean)
        : [];
      if (mentions.length === 1) return `mentioned ${mentions[0]}`;
      if (mentions.length > 1) return `mentioned ${mentions[0]} and ${mentions.length - 1} others`;
      return "mentioned a teammate";
    }

    if (activity.actionType === "note_updated") {
      return metadata.noteState === "cleared" ? "cleared note" : "updated note";
    }

    if (activity.actionType === "status_changed") {
      return `changed status to ${humanizeCode(metadata.statusTo)}`;
    }

    if (activity.actionType === "assignment_changed") {
      const fromLabel = assignmentLabelFrom(metadata, "assignedFrom");
      const toLabel = assignmentLabelFrom(metadata, "assignedTo");

      if (!fromLabel && toLabel) return `assigned to ${toLabel}`;
      if (fromLabel && toLabel && fromLabel !== toLabel) {
        return `reassigned from ${fromLabel} to ${toLabel}`;
      }
      if (fromLabel && !toLabel) return "cleared assignment";
      if (toLabel) return `updated assignment to ${toLabel}`;
      return "updated assignment";
    }

    if (activity.actionType === "updated") {
      const labels = Array.isArray(metadata.changedFieldLabels)
        ? metadata.changedFieldLabels.map((value) => trimToNull(value)).filter(Boolean)
        : [];
      if (labels.length) return `updated ${labels.join(", ")}`;
      return "updated work order";
    }
  }

  if (activity.sourceType === "asset_event") {
    const lifecycleTag = String(details._assetLifecycleTag ?? "").trim().toUpperCase();
    if (activity.actionType === "asset_created" || lifecycleTag === "MANUAL_CREATE") {
      return "created asset";
    }
    if (lifecycleTag === "AUTO_CREATE_ADDED") return "added asset to inventory";
    if (activity.actionType === "install") return "installed asset";
    if (activity.actionType === "inspection") return "recorded inspection";
    if (activity.actionType === "repair") return "recorded repair";
    if (activity.actionType === "replace") return "recorded replacement";
    if (activity.actionType === "note") return "added asset note";
  }

  return trimToNull(activity.message) ?? "recorded activity";
}

export function getActivitySupportingText(activity: ActivityProjection): string | null {
  const metadata = toRecord(activity.metadata);
  const details = toRecord(metadata.details);

  if (activity.sourceType === "work_order_log" && activity.actionType === "status_changed") {
    const fromStatus = trimToNull(metadata.statusFrom);
    const toStatus = trimToNull(metadata.statusTo);
    if (fromStatus && toStatus) {
      return `${humanizeCode(fromStatus)} -> ${humanizeCode(toStatus)}`;
    }
  }

  if (activity.sourceType === "asset_event") {
    const note = trimToNull(metadata.notes);
    if (note) return note;

    const lifecycleTag = String(details._assetLifecycleTag ?? "").trim().toUpperCase();
    if (lifecycleTag === "AUTO_CREATE_ADDED") {
      return "Linked from work order activity";
    }
  }

  if (activity.sourceType === "work_order_log") {
    const noteExcerpt = trimToNull(metadata.noteExcerpt);
    if (noteExcerpt) return noteExcerpt;
  }

  return null;
}