import { db } from "../db/db";
import { requireOrgId } from "../org/requireOrg";
import type { NotificationInboxRow } from "../types/NotificationInbox";
import { normalizeEmail, trimToNull } from "../utils/userIdentity";

type NotificationRecipient = {
  uid?: string | null;
  email?: string | null;
};

function rowsToArray(rows: any): any[] {
  if (!rows) return [];
  if (Array.isArray(rows)) return rows;
  if (typeof rows.item === "function" && typeof rows.length === "number") {
    const out: any[] = [];
    for (let i = 0; i < rows.length; i++) out.push(rows.item(i));
    return out;
  }
  return [];
}

function toMetadata(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function mapRow(row: any): NotificationInboxRow {
  let metadata: Record<string, unknown> | null = null;
  try {
    metadata = toMetadata(JSON.parse(row.metadataJson ?? "null"));
  } catch {
    metadata = null;
  }

  const targetTypeRaw = String(row.targetType ?? "").trim().toLowerCase();
  const targetType =
    targetTypeRaw === "work_order" || targetTypeRaw === "asset"
      ? targetTypeRaw
      : "unknown";

  return {
    id: String(row.id),
    orgId: String(row.orgId),
    recipientUid: trimToNull(row.recipientUid),
    recipientEmail: normalizeEmail(row.recipientEmail),
    category: String(row.category) as NotificationInboxRow["category"],
    sourceType: String(row.sourceType),
    sourceId: String(row.sourceId),
    sourceCreatedAt: Number(row.sourceCreatedAt) || 0,
    targetType,
    targetId: trimToNull(row.targetId),
    title: String(row.title ?? "Notification"),
    body: trimToNull(row.body),
    actorUid: trimToNull(row.actorUid),
    actorName: trimToNull(row.actorName),
    actorEmail: normalizeEmail(row.actorEmail),
    metadata,
    readAt: row.readAt == null ? null : Number(row.readAt),
    openedAt: row.openedAt == null ? null : Number(row.openedAt),
    createdAt: Number(row.createdAt) || 0,
    updatedAt: Number(row.updatedAt) || 0,
  };
}

function recipientClause(recipient: NotificationRecipient): {
  clause: string;
  params: Array<string>;
} {
  const uid = trimToNull(recipient.uid);
  const email = normalizeEmail(recipient.email);

  if (uid && email) {
    return {
      clause: "(recipientUid = ? OR recipientEmail = ?)",
      params: [uid, email],
    };
  }
  if (uid) {
    return {
      clause: "recipientUid = ?",
      params: [uid],
    };
  }
  if (email) {
    return {
      clause: "recipientEmail = ?",
      params: [email],
    };
  }

  return {
    clause: "1 = 0",
    params: [],
  };
}

export const notificationsRepo = {
  async listForRecipient(args: {
    orgId: string;
    recipientUid?: string | null;
    recipientEmail?: string | null;
    limit?: number;
  }): Promise<NotificationInboxRow[]> {
    const safeOrgId = requireOrgId(args.orgId);
    const recipient = recipientClause({ uid: args.recipientUid, email: args.recipientEmail });
    const limit = Math.max(1, Number(args.limit ?? 120));
    const result = db.executeSync(
      `
      SELECT *
      FROM notification_inbox
      WHERE orgId = ?
        AND ${recipient.clause}
      ORDER BY CASE WHEN readAt IS NULL THEN 0 ELSE 1 END ASC, sourceCreatedAt DESC
      LIMIT ?
      `,
      [safeOrgId, ...recipient.params, limit],
    );
    return rowsToArray(result?.rows).map(mapRow);
  },

  async getUnreadCount(args: {
    orgId: string;
    recipientUid?: string | null;
    recipientEmail?: string | null;
  }): Promise<number> {
    const safeOrgId = requireOrgId(args.orgId);
    const recipient = recipientClause({ uid: args.recipientUid, email: args.recipientEmail });
    const result = db.executeSync(
      `
      SELECT COUNT(*) AS count
      FROM notification_inbox
      WHERE orgId = ?
        AND ${recipient.clause}
        AND readAt IS NULL
      `,
      [safeOrgId, ...recipient.params],
    );
    const rows = rowsToArray(result?.rows);
    return Number(rows[0]?.count ?? 0);
  },

  async upsertMany(rows: NotificationInboxRow[]): Promise<void> {
    for (const row of rows) {
      db.executeSync(
        `
        INSERT INTO notification_inbox (
          id, orgId, recipientUid, recipientEmail, category,
          sourceType, sourceId, sourceCreatedAt,
          targetType, targetId,
          title, body,
          actorUid, actorName, actorEmail,
          metadataJson,
          readAt, openedAt,
          createdAt, updatedAt
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          category = excluded.category,
          sourceType = excluded.sourceType,
          sourceId = excluded.sourceId,
          sourceCreatedAt = excluded.sourceCreatedAt,
          targetType = excluded.targetType,
          targetId = excluded.targetId,
          title = excluded.title,
          body = excluded.body,
          actorUid = excluded.actorUid,
          actorName = excluded.actorName,
          actorEmail = excluded.actorEmail,
          metadataJson = excluded.metadataJson,
          updatedAt = excluded.updatedAt
        `,
        [
          row.id,
          row.orgId,
          row.recipientUid,
          row.recipientEmail,
          row.category,
          row.sourceType,
          row.sourceId,
          row.sourceCreatedAt,
          row.targetType,
          row.targetId,
          row.title,
          row.body,
          row.actorUid,
          row.actorName,
          row.actorEmail,
          JSON.stringify(row.metadata ?? null),
          row.readAt,
          row.openedAt,
          row.createdAt,
          row.updatedAt,
        ],
      );
    }
  },

  async markRead(args: { ids: string[] }): Promise<void> {
    const ids = [...new Set((args.ids ?? []).map((id) => String(id ?? "").trim()).filter(Boolean))];
    if (!ids.length) return;
    const now = Date.now();
    const placeholders = ids.map(() => "?").join(", ");
    db.executeSync(
      `UPDATE notification_inbox SET readAt = COALESCE(readAt, ?), updatedAt = ? WHERE id IN (${placeholders})`,
      [now, now, ...ids],
    );
  },

  async markOpened(args: { id: string }): Promise<void> {
    const id = String(args.id ?? "").trim();
    if (!id) return;
    const now = Date.now();
    db.executeSync(
      `
      UPDATE notification_inbox
      SET readAt = COALESCE(readAt, ?),
          openedAt = ?,
          updatedAt = ?
      WHERE id = ?
      `,
      [now, now, now, id],
    );
  },

  async markAllReadForRecipient(args: {
    orgId: string;
    recipientUid?: string | null;
    recipientEmail?: string | null;
  }): Promise<void> {
    const safeOrgId = requireOrgId(args.orgId);
    const recipient = recipientClause({ uid: args.recipientUid, email: args.recipientEmail });
    const now = Date.now();
    db.executeSync(
      `
      UPDATE notification_inbox
      SET readAt = COALESCE(readAt, ?), updatedAt = ?
      WHERE orgId = ?
        AND ${recipient.clause}
        AND readAt IS NULL
      `,
      [now, now, safeOrgId, ...recipient.params],
    );
  },
};
