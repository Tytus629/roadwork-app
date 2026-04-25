import type { AssetEvent } from "../types/AssetEvent";
import type { LogEntry } from "../services/logService";
import { formatPersonDisplayName, normalizeEmail } from "./userIdentity";

export type ActivityProjectionSourceType = "asset_event" | "work_order_log";

export type ActivityProjectionTargetType = "asset" | "work_order" | "unknown";

export type ActivityProjection = {
  id: string;
  sourceType: ActivityProjectionSourceType;
  actionType: string;
  actorUid: string | null;
  actorName: string | null;
  actorEmail: string | null;
  targetType: ActivityProjectionTargetType;
  targetId: string | null;
  message: string;
  messageTemplate: string | null;
  createdAt: number;
  metadata: Record<string, unknown> | null;
};

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}

function firstNonBlank(source: Record<string, unknown>, keys: string[]): string | null {
  for (const key of keys) {
    const raw = source[key];
    const trimmed = String(raw ?? "").trim();
    if (trimmed) return trimmed;
  }
  return null;
}

function normalizeActionType(raw: string): string {
  return String(raw)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "") || "unknown";
}

function assetEventLifecycleAction(event: AssetEvent): string | null {
  if (event.kind !== "NOTE") return null;
  const details = toRecord(event.details);
  const lifecycleTag = String(details._assetLifecycleTag ?? "").trim().toUpperCase();
  if (lifecycleTag === "MANUAL_CREATE") return "asset_created";
  if (lifecycleTag === "AUTO_CREATE_ADDED") return "asset_created";
  return null;
}

function buildAssetEventMessage(event: AssetEvent): string {
  const labelByKind: Record<string, string> = {
    INSTALL: "Asset installed",
    INSPECTION: "Asset inspection",
    REPAIR: "Asset repair",
    REPLACE: "Asset replaced",
    NOTE: "Asset note",
  };

  const base = labelByKind[event.kind] ?? "Asset event";
  const note = String(event.notes ?? "").trim();
  return note ? `${base}: ${note}` : base;
}

function buildActorName(source: Record<string, unknown>): string | null {
  const display = formatPersonDisplayName(source, {
    nameKeys: ["actorName", "byName", "name"],
    displayNameKeys: ["actorDisplayName", "byDisplayName", "displayName"],
    emailKeys: ["actorEmail", "byEmail", "email"],
    uidKeys: ["actorUid", "byUid", "uid"],
    unknownLabel: "",
  }).trim();

  return display || null;
}

function buildActorEmail(source: Record<string, unknown>): string | null {
  const email = firstNonBlank(source, ["actorEmail", "byEmail", "email"]);
  return normalizeEmail(email);
}

export function projectAssetEventToActivity(event: AssetEvent): ActivityProjection {
  const source = toRecord(event);
  const createdAt = Number(event.at ?? event.createdAt ?? Date.now());
  const actionType = assetEventLifecycleAction(event) ?? normalizeActionType(event.kind);

  return {
    id: String(event.id),
    sourceType: "asset_event",
    actionType,
    actorUid: firstNonBlank(source, ["actorUid", "byUid", "uid"]),
    actorName: buildActorName(source),
    actorEmail: buildActorEmail(source),
    targetType: "asset",
    targetId: String(event.assetId ?? "").trim() || null,
    message: buildAssetEventMessage(event),
    messageTemplate: `asset_event.${actionType}`,
    createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    metadata: {
      kind: event.kind,
      workOrderId: event.workOrderId ?? null,
      photoCount: Array.isArray(event.photoIds) ? event.photoIds.length : 0,
      details: event.details ?? null,
      notes: event.notes ?? null,
    },
  };
}

export function projectLogEntryToActivity(entry: LogEntry): ActivityProjection {
  const payload = toRecord(entry.payload);
  const source = {
    ...payload,
    ...toRecord(entry),
  };
  const actionType = normalizeActionType(entry.event);
  const message = String(entry.message ?? "").trim() || String(entry.event ?? "").trim() || "Log event";
  const targetTypeRaw = String(entry.targetType ?? payload.targetType ?? "").trim().toLowerCase();
  const targetType: ActivityProjectionTargetType =
    targetTypeRaw === "asset"
      ? "asset"
      : targetTypeRaw === "work_order"
        ? "work_order"
        : "work_order";

  return {
    id: String(entry.id),
    sourceType: "work_order_log",
    actionType,
    actorUid: firstNonBlank(source, ["actorUid", "byUid", "uid"]),
    actorName: buildActorName(source),
    actorEmail: buildActorEmail(source),
    targetType,
    targetId: String(entry.workOrderId ?? "").trim() || null,
    message,
    messageTemplate: `work_order_log.${actionType}`,
    createdAt: Number(entry.createdAt) || Date.now(),
    metadata: {
      ...payload,
      event: entry.event,
      orgId: entry.orgId ?? null,
    },
  };
}

export function projectActivities(args: {
  assetEvents?: AssetEvent[];
  logEntries?: LogEntry[];
}): ActivityProjection[] {
  const fromAssetEvents = (args.assetEvents ?? []).map(projectAssetEventToActivity);
  const fromLogs = (args.logEntries ?? []).map(projectLogEntryToActivity);

  return [...fromAssetEvents, ...fromLogs].sort((a, b) => b.createdAt - a.createdAt);
}
