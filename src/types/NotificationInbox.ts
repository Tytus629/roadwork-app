export type NotificationCategory =
  | "assignment"
  | "assignment_removed"
  | "status"
  | "asset_activity"
  | "mention";

export type NotificationTargetType = "work_order" | "asset" | "unknown";

export type NotificationInboxRow = {
  id: string;
  orgId: string;
  recipientUid: string | null;
  recipientEmail: string | null;
  category: NotificationCategory;
  sourceType: string;
  sourceId: string;
  sourceCreatedAt: number;
  targetType: NotificationTargetType;
  targetId: string | null;
  title: string;
  body: string | null;
  actorUid: string | null;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  readAt: number | null;
  openedAt: number | null;
  createdAt: number;
  updatedAt: number;
};
