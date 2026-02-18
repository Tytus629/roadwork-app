/**
 * workOrdersRepo.ts
 * 
 * PURPOSE:
 * Direct database access layer for work orders and sign details.
 * All SQLite queries for work orders go through this file.
 * 
 * KEY RESPONSIBILITIES:
 * - CRUD operations for work_orders table
 * - CRUD operations for sign_details table
 * - Spatial queries (bbox filtering for map display)
 * - Filtering (type, status, priority)
 * - Normalization utilities (title case, lowercase matching)
 * 
 * DATABASE SCHEMA:
 * work_orders:
 *   - id (TEXT PK)
 *   - type (TEXT: "Sign", "Pothole", etc.)
 *   - createdAt, updatedAt (INTEGER epoch ms)
 *   - status (TEXT: "Needs", "In Progress", "Done", "Deferred")
 *   - priority (TEXT: "Low", "Medium", "High", "Urgent")
 *   - note (TEXT nullable)
 *   - geomType (TEXT: "point" or "line")
 *   - lat, lng (REAL nullable, for point geometry)
 *   - lineJson (TEXT nullable, JSON array of {lat, lng} for line geometry)
 *   - minLat, minLng, maxLat, maxLng (REAL, bounding box for spatial queries)
 * 
 * sign_details:
 *   - workOrderId (TEXT FK → work_orders.id)
 *   - signTypeId (TEXT: references SIGN_TYPES in constants/signTypes.ts)
 *   - category (TEXT: "Regulatory", "Warning", etc.)
 *   - condition (TEXT: "Good", "Faded", "Damaged", "Missing")
 *   - action (TEXT: "Replace", "Repair", "Clean", "Install")
 *   - reflectivityIssue (INTEGER: 0 or 1, boolean)
 * 
 * NORMALIZATION PATTERN:
 * - User input can vary: "   Needs  ", "needs", "NEEDS"
 * - normKey(): Lowercase, trim, collapse spaces → for comparisons
 * - normLabel(): Title case, trim → for display
 * - This allows flexible filtering without strict case matching
 * 
 * SPATIAL QUERIES:
 * - Bounding box (bbox) stored for each work order (minLat/minLng/maxLat/maxLng)
 * - Map queries: WHERE minLat <= ? AND maxLat >= ? AND minLng <= ? AND maxLng >= ?
 * - Only fetches work orders in visible map region (performance optimization)
 * - See geom.ts for bbox calculation utilities
 */

import { db } from "./db";
import { bboxForLine, bboxForPoint } from "./geom";
import { BBox, LatLng, WorkOrderFilter, WorkOrderRow, SignDetailsRow } from "./types";

/** Sign inspection validity period in days. Change this to adjust overdue_default threshold. */
export const SIGN_INSPECTION_VALID_DAYS = 365 * 2; // 2 years

function nowMs() {
  return Date.now();
}

/**
 * Cross-platform row extraction from SQLite result
 * Handles differences between React Native, Expo, and Node SQLite libraries
 */
function readRows(r: any): any[] {
  const rows = r?.rows;
  if (Array.isArray(rows)) return rows;

  if (rows && typeof rows.item === "function") {
    const out: any[] = [];
    const len = typeof rows.length === "number" ? rows.length : 0;
    for (let i = 0; i < len; i++) out.push(rows.item(i));
    return out;
  }

  return rows ? Array.from(rows) : [];
}

function normKey(v: any): string {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normLabel(v: any): string {
  return String(v ?? "").trim().replace(/\s+/g, " ");
}

function rowToWorkOrder(r: any): WorkOrderRow {
  const rawType = String(r?.type ?? "").trim();
  const safeType = rawType.length ? rawType : "unknown";

  return {
    id: String(r.id),
    type: safeType,
    createdAt: Number(r.createdAt),
    updatedAt: Number(r.updatedAt),
    status: r.status,
    priority: r.priority,
    note: r.note ?? null,

    geomType: r.geomType,
    lat: r.lat ?? null,
    lng: r.lng ?? null,
    lineJson: r.lineJson ?? null,

    minLat: Number(r.minLat),
    minLng: Number(r.minLng),
    maxLat: Number(r.maxLat),
    maxLng: Number(r.maxLng),
  };
}

export function upsertWorkOrderPoint(args: {
  id: string;
  type: string;
  status: string;
  priority: string;
  note?: string | null;
  point: LatLng;
  createdAt?: number;
}) {
  const t = nowMs();
  const createdAt = args.createdAt ?? t;
  const b = bboxForPoint(args.point);

  db.executeSync(
    `
    INSERT INTO work_orders(
      id, type, createdAt, updatedAt, status, priority, note,
      geomType, lat, lng, lineJson,
      minLat, minLng, maxLat, maxLng
    ) VALUES (?,?,?,?,?,?,?,?,?,?,NULL,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type,
      updatedAt=excluded.updatedAt,
      status=excluded.status,
      priority=excluded.priority,
      note=excluded.note,
      geomType=excluded.geomType,
      lat=excluded.lat,
      lng=excluded.lng,
      lineJson=NULL,
      minLat=excluded.minLat,
      minLng=excluded.minLng,
      maxLat=excluded.maxLat,
      maxLng=excluded.maxLng;
    `,
    [
      args.id,
      args.type,
      createdAt,
      t,
      args.status,
      args.priority,
      args.note ?? null,
      "point",
      args.point.lat,
      args.point.lng,
      b.minLat,
      b.minLng,
      b.maxLat,
      b.maxLng,
    ]
  );
}

export function upsertWorkOrderLine(args: {
  id: string;
  type: string;
  status: string;
  priority: string;
  note?: string | null;
  points: LatLng[];
  createdAt?: number;
}) {
  const t = nowMs();
  const createdAt = args.createdAt ?? t;
  const b = bboxForLine(args.points);
  const lineJson = JSON.stringify(args.points);

  db.executeSync(
    `
    INSERT INTO work_orders(
      id, type, createdAt, updatedAt, status, priority, note,
      geomType, lat, lng, lineJson,
      minLat, minLng, maxLat, maxLng
    ) VALUES (?,?,?,?,?,?,?, 'line', NULL, NULL, ?, ?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET
      type=excluded.type,
      updatedAt=excluded.updatedAt,
      status=excluded.status,
      priority=excluded.priority,
      note=excluded.note,
      geomType='line',
      lat=NULL,
      lng=NULL,
      lineJson=excluded.lineJson,
      minLat=excluded.minLat,
      minLng=excluded.minLng,
      maxLat=excluded.maxLat,
      maxLng=excluded.maxLng;
    `,
    [
      args.id,
      args.type,
      createdAt,
      t,
      args.status,
      args.priority,
      args.note ?? null,
      lineJson,
      b.minLat,
      b.minLng,
      b.maxLat,
      b.maxLng,
    ]
  );
}

export function upsertSignDetails(d: SignDetailsRow) {
  db.executeSync(
    `
    INSERT INTO sign_details(
      workOrderId, signTypeId, category, condition, action, reflectivityIssue
    ) VALUES (?,?,?,?,?,?)
    ON CONFLICT(workOrderId) DO UPDATE SET
      signTypeId=excluded.signTypeId,
      category=excluded.category,
      condition=excluded.condition,
      action=excluded.action,
      reflectivityIssue=excluded.reflectivityIssue;
    `,
    [
      d.workOrderId,
      d.signTypeId ?? null,
      d.category ?? null,
      d.condition ?? null,
      d.action ?? null,
      d.reflectivityIssue ?? null,
    ]
  );
}

/**
 * Partial update for sign_details - only updates fields that are provided.
 * Used for inspection sheet fields and individual field updates.
 */
export function upsertSignDetailsPatch(
  workOrderId: string,
  patch: Partial<{
    signTypeId: string | null;
    category: string | null;
    condition: string | null;
    action: string | null;
    reflectivityIssue: number | null;
    inspectionVisible: number;
    reflectivityScore: number | null;
    delaminationScore: number | null;
    appearanceScore: number | null;
    postMaterial: "Wood" | "Steel" | null;
    postConditionScore: number | null;
  }>
) {
  // Ensure row exists first
  db.executeSync(
    `INSERT OR IGNORE INTO sign_details (workOrderId) VALUES (?);`,
    [workOrderId]
  );

  const sets: string[] = [];
  const params: any[] = [];

  for (const [k, v] of Object.entries(patch)) {
    sets.push(`${k} = ?`);
    params.push(v);
  }

  if (!sets.length) return;

  db.executeSync(
    `UPDATE sign_details SET ${sets.join(", ")} WHERE workOrderId = ?;`,
    [...params, workOrderId]
  );
}

export function deleteWorkOrder(id: string) {
  db.executeSync(`DELETE FROM work_orders WHERE id = ?;`, [id]);
}

export function getWorkOrderById(id: string): WorkOrderRow | null {
  const r = db.executeSync(`SELECT * FROM work_orders WHERE id = ? LIMIT 1;`, [id]);
  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  if (arr.length === 0) return null;
  return rowToWorkOrder(arr[0]);
}

export function getSignDetailsByWorkOrderId(workOrderId: string): SignDetailsRow | null {
  const r = db.executeSync(`SELECT * FROM sign_details WHERE workOrderId = ? LIMIT 1;`, [workOrderId]);
  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  if (arr.length === 0) return null;
  const row = arr[0];
  return {
    workOrderId: String(row.workOrderId),
    signTypeId: row.signTypeId ?? null,
    category: row.category ?? null,
    condition: row.condition ?? null,
    action: row.action ?? null,
    reflectivityIssue: row.reflectivityIssue ?? null,
    
    // Inspection sheet fields
    inspectionVisible: row.inspectionVisible ?? 0,
    reflectivityScore: row.reflectivityScore ?? null,
    delaminationScore: row.delaminationScore ?? null,
    appearanceScore: row.appearanceScore ?? null,
    postMaterial: row.postMaterial ?? null,
    postConditionScore: row.postConditionScore ?? null,
    inspectionLastSavedAt: row.inspectionLastSavedAt ?? null,
  };
}

/**
 * Find signs that haven't been inspected since a given cutoff time.
 * Useful for "overdue" filtering and reports.
 * @param cutoffMs - epoch ms timestamp. Signs inspected before this are returned.
 * @param limit - max results (default 2000)
 */
export function listSignsNotInspectedSince(cutoffMs: number, limit = 2000): WorkOrderRow[] {
  const r = db.executeSync(
    `
    SELECT
      wo.*,
      sd.inspectionLastSavedAt as sd_inspectionLastSavedAt
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE
      wo.type = 'Sign'
      AND (
        sd.inspectionLastSavedAt IS NULL
        OR sd.inspectionLastSavedAt < ?
      )
    ORDER BY
      COALESCE(sd.inspectionLastSavedAt, 0) ASC
    LIMIT ?;
    `,
    [cutoffMs, limit]
  );

  const rows = readRows(r);
  return rows.map(rowToWorkOrder);
}

export function getDistinctWorkOrderTypes(): string[] {
  const r = db.executeSync(
    `
    SELECT DISTINCT type
    FROM work_orders
    WHERE type IS NOT NULL AND TRIM(type) <> ''
    ORDER BY type ASC;
    `
  );

  const rows = readRows(r);

  const seen = new Set<string>();
  const out: string[] = [];

  for (const row of rows) {
    const label = normLabel((row as any)?.type);
    const key = normKey((row as any)?.type);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

export function debugDumpTypes(): string[] {
  const types = getDistinctWorkOrderTypes();
  console.log("[workOrdersRepo] DISTINCT types:", types);
  const sample = db.executeSync(`SELECT id, type, status, priority FROM work_orders LIMIT 10;`);
  console.log("[workOrdersRepo] SAMPLE work_orders:", readRows(sample));
  return types;
}

export type SignWorkOrder = {
  wo: WorkOrderRow;
  sd: SignDetailsRow | null;
};

export type SortMode = "priority" | "newest" | "oldest";
export type AgeSort = "newest" | "oldest";

function sortSql(sort: SortMode) {
  if (sort === "newest") return "ORDER BY wo.createdAt DESC";
  if (sort === "oldest") return "ORDER BY wo.createdAt ASC";

  // "priority" sort: Urgent > High > Medium > Low then newest within priority
  return `
    ORDER BY
      CASE wo.priority
        WHEN 'Urgent' THEN 4
        WHEN 'High' THEN 3
        WHEN 'Medium' THEN 2
        WHEN 'Low' THEN 1
        ELSE 0
      END DESC,
      wo.createdAt DESC
  `;
}

function buildWhereSimple(filter: WorkOrderFilter) {
  const where: string[] = [];
  const params: any[] = [];

  if (filter.types?.length) {
    where.push(`LOWER(TRIM(wo.type)) IN (${filter.types.map(() => "?").join(",")})`);
    params.push(...filter.types.map((t) => normKey(t)));
  }
  if (filter.status?.length) {
    where.push(`wo.status IN (${filter.status.map(() => "?").join(",")})`);
    params.push(...filter.status);
  }
  if (filter.priority?.length) {
    where.push(`wo.priority IN (${filter.priority.map(() => "?").join(",")})`);
    params.push(...filter.priority);
  }

  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { sql, params };
}

export function listWorkOrdersFiltered(
  filter: WorkOrderFilter,
  ageSort: AgeSort,
  limit = 2000
): WorkOrderRow[] {
  const { sql, params } = buildWhereSimple(filter);

  const orderBy = ageSort === "oldest" ? "ORDER BY wo.createdAt ASC" : "ORDER BY wo.createdAt DESC";

  const r = db.executeSync(
    `
    SELECT wo.*
    FROM work_orders wo
    ${sql}
    ${orderBy}
    LIMIT ?;
    `,
    [...params, limit]
  );

  return readRows(r).map(rowToWorkOrder);
}

export function listSignsNear(
  args: { lat: number; lng: number; miles: number },
  limit = 2000
): SignWorkOrder[] {
  const dLat = args.miles / 69;
  const dLng = args.miles / (69 * Math.cos((args.lat * Math.PI) / 180));

  const minLat = args.lat - dLat;
  const maxLat = args.lat + dLat;
  const minLng = args.lng - dLng;
  const maxLng = args.lng + dLng;

  const r = db.executeSync(
    `
    SELECT
      wo.*,
      sd.workOrderId as sd_workOrderId,
      sd.signTypeId as sd_signTypeId,
      sd.category as sd_category,
      sd.condition as sd_condition,
      sd.action as sd_action,
      sd.reflectivityIssue as sd_reflectivityIssue
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE
      LOWER(wo.type) = 'sign'
      AND wo.maxLat >= ? AND wo.minLat <= ?
      AND wo.maxLng >= ? AND wo.minLng <= ?
      AND wo.status IN ('Needs','In Progress','Deferred')
    ORDER BY wo.updatedAt DESC
    LIMIT ?;
    `,
    [minLat, maxLat, minLng, maxLng, limit]
  );

  const rows = readRows(r);
  return rows.map((x) => {
    const wo = rowToWorkOrder(x);
    const hasSd = x.sd_workOrderId != null;
    const sd = hasSd
      ? ({
          workOrderId: String(x.sd_workOrderId),
          signTypeId: x.sd_signTypeId ?? null,
          category: x.sd_category ?? null,
          condition: x.sd_condition ?? null,
          action: x.sd_action ?? null,
          reflectivityIssue: x.sd_reflectivityIssue ?? null,
        } as SignDetailsRow)
      : null;
    return { wo, sd };
  });
}

export function listSignsDue(limit = 2000): SignWorkOrder[] {
  const r = db.executeSync(
    `
    SELECT
      wo.*,
      sd.workOrderId as sd_workOrderId,
      sd.signTypeId as sd_signTypeId,
      sd.category as sd_category,
      sd.condition as sd_condition,
      sd.action as sd_action,
      sd.reflectivityIssue as sd_reflectivityIssue
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE
      LOWER(wo.type) = 'sign'
      AND wo.status IN ('Needs','In Progress','Deferred')
      AND (
        LOWER(sd.condition) IN ('damaged','missing')
        OR sd.reflectivityIssue = 1
        OR LOWER(sd.action) IN ('replace','repair','install')
      )
    ORDER BY
      CASE wo.priority
        WHEN 'Urgent' THEN 4
        WHEN 'High' THEN 3
        WHEN 'Medium' THEN 2
        WHEN 'Low' THEN 1
        ELSE 0
      END DESC,
      wo.updatedAt DESC
    LIMIT ?;
    `,
    [limit]
  );

  const rows = readRows(r);
  return rows.map((x) => {
    const wo = rowToWorkOrder(x);
    const hasSd = x.sd_workOrderId != null;
    const sd = hasSd
      ? ({
          workOrderId: String(x.sd_workOrderId),
          signTypeId: x.sd_signTypeId ?? null,
          category: x.sd_category ?? null,
          condition: x.sd_condition ?? null,
          action: x.sd_action ?? null,
          reflectivityIssue: x.sd_reflectivityIssue ?? null,
        } as SignDetailsRow)
      : null;
    return { wo, sd };
  });
}

// =============== DUE MODE FILTERING ===============

export type DueMode =
  | "due_only"
  | "overdue_default" // 2 years
  | "overdue_30d"
  | "overdue_1y"
  | "overdue_5y";

function isOverdueMode(mode: DueMode): boolean {
  return mode !== "due_only";
}

function msDays(n: number) {
  return n * 24 * 60 * 60 * 1000;
}

function cutoffFor(mode: DueMode): number | null {
  const now = Date.now();

  if (mode === "overdue_30d") return now - msDays(30);
  if (mode === "overdue_1y") return now - msDays(365);
  if (mode === "overdue_5y") return now - msDays(365 * 5);

  // DEFAULT overdue = uses SIGN_INSPECTION_VALID_DAYS constant
  if (mode === "overdue_default") return now - msDays(SIGN_INSPECTION_VALID_DAYS);

  return null;
}

/**
 * List signs based on due mode:
 * - due_only: Signs with condition/action issues or poor inspection scores
 * - overdue_*: Signs not inspected within the time period
 */
export function listSignsDueByMode(mode: DueMode, limit = 2000): SignWorkOrder[] {
  const cutoff = cutoffFor(mode);
  const params: any[] = [];

  // Due reasons clause
  const dueClause = `
    (
      sd.condition IN ('Damaged','Missing')
      OR sd.reflectivityIssue = 1
      OR sd.action IN ('Replace','Repair','Install')
      OR (sd.reflectivityScore IS NOT NULL AND sd.reflectivityScore <= 4)
      OR (sd.delaminationScore IS NOT NULL AND sd.delaminationScore <= 4)
      OR (sd.appearanceScore IS NOT NULL AND sd.appearanceScore <= 4)
      OR (sd.postConditionScore IS NOT NULL AND sd.postConditionScore <= 4)
    )
  `;

  // Overdue = never inspected OR last inspected before cutoff
  const overdueClause = `(sd.inspectionLastSavedAt IS NULL OR sd.inspectionLastSavedAt < ?)`;

  let whereMode = "1=1";

  if (mode === "due_only") {
    whereMode = dueClause;
  } else {
    // any overdue_* mode
    whereMode = overdueClause;
    params.push(cutoff);
  }

  // For overdue modes, include Done so you can audit history
  // For due-only modes, keep it active-ish
  const overdue = isOverdueMode(mode);
  const statusClause = overdue
    ? `wo.status IN ('Needs','In Progress','Deferred','Done')`
    : `wo.status IN ('Needs','In Progress','Deferred')`;

  const r = db.executeSync(
    `
    SELECT
      wo.*,
      sd.workOrderId as sd_workOrderId,
      sd.signTypeId as sd_signTypeId,
      sd.category as sd_category,
      sd.condition as sd_condition,
      sd.action as sd_action,
      sd.reflectivityIssue as sd_reflectivityIssue,
      sd.reflectivityScore as sd_reflectivityScore,
      sd.delaminationScore as sd_delaminationScore,
      sd.appearanceScore as sd_appearanceScore,
      sd.postMaterial as sd_postMaterial,
      sd.postConditionScore as sd_postConditionScore,
      sd.inspectionLastSavedAt as sd_inspectionLastSavedAt
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE
      LOWER(TRIM(wo.type)) = 'sign'
      AND ${statusClause}
      AND ${whereMode}
    ORDER BY
      CASE wo.priority
        WHEN 'Urgent' THEN 4
        WHEN 'High' THEN 3
        WHEN 'Medium' THEN 2
        WHEN 'Low' THEN 1
        ELSE 0
      END DESC,
      wo.updatedAt DESC
    LIMIT ?;
    `,
    [...params, limit]
  );

  const rows = readRows(r);
  return rows.map((x) => {
    const wo = rowToWorkOrder(x);
    const hasSd = x.sd_workOrderId != null;
    const sd = hasSd
      ? ({
          workOrderId: String(x.sd_workOrderId),
          signTypeId: x.sd_signTypeId ?? null,
          category: x.sd_category ?? null,
          condition: x.sd_condition ?? null,
          action: x.sd_action ?? null,
          reflectivityIssue: x.sd_reflectivityIssue ?? null,
          reflectivityScore: x.sd_reflectivityScore ?? null,
          delaminationScore: x.sd_delaminationScore ?? null,
          appearanceScore: x.sd_appearanceScore ?? null,
          postMaterial: x.sd_postMaterial ?? null,
          postConditionScore: x.sd_postConditionScore ?? null,
          inspectionLastSavedAt: x.sd_inspectionLastSavedAt ?? null,
        } as SignDetailsRow)
      : null;
    return { wo, sd };
  });
}

export function listActiveWorkOrders(
  filter?: WorkOrderFilter,
  sort: SortMode = "priority",
  limit = 500
): WorkOrderRow[] {
  const { sql, params } = buildWhere(filter);

  const r = db.executeSync(
    `
    SELECT wo.*
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    ${sql}
    ${sortSql(sort)}
    LIMIT ?;
    `,
    [...params, limit]
  );

  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map(rowToWorkOrder);
}
export function updateWorkOrderFields(args: {
  id: string;
  status?: string;
  priority?: string;
  note?: string | null;
}) {
  const sets: string[] = [];
  const params: any[] = [];

  if (args.status !== undefined) {
    sets.push("status = ?");
    params.push(args.status);
  }
  if (args.priority !== undefined) {
    sets.push("priority = ?");
    params.push(args.priority);
  }
  if (args.note !== undefined) {
    sets.push("note = ?");
    params.push(args.note);
  }

  // always update updatedAt
  sets.push("updatedAt = ?");
  params.push(Date.now());

  if (!sets.length) return;

  db.executeSync(
    `
    UPDATE work_orders
    SET ${sets.join(", ")}
    WHERE id = ?;
    `,
    [...params, args.id]
  );
}
function buildWhere(filter?: WorkOrderFilter) {
  const where: string[] = [];
  const params: any[] = [];

  if (filter?.types?.length) {
    where.push(`LOWER(TRIM(wo.type)) IN (${filter.types.map(() => "?").join(",")})`);
    params.push(...filter.types.map((t) => normKey(t)));
  }
  if (filter?.status?.length) {
    const normalized = filter.status.map(s => (s ?? "").toLowerCase());
    where.push(`LOWER(wo.status) IN (${normalized.map(() => "?").join(",")})`);
    params.push(...normalized);
  }
  if (filter?.priority?.length) {
    const normalized = filter.priority.map(p => (p ?? "").toLowerCase());
    where.push(`LOWER(wo.priority) IN (${normalized.map(() => "?").join(",")})`);
    params.push(...normalized);
  }

  // Sign-specific filters require LEFT JOIN sign_details
  if (filter?.signCategory?.length) {
    const normalized = filter.signCategory.map(c => (c ?? "").toLowerCase());
    where.push(`LOWER(sd.category) IN (${normalized.map(() => "?").join(",")})`);
    params.push(...normalized);
  }
  if (filter?.signCondition?.length) {
    const normalized = filter.signCondition.map(c => (c ?? "").toLowerCase());
    where.push(`LOWER(sd.condition) IN (${normalized.map(() => "?").join(",")})`);
    params.push(...normalized);
  }

  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  return { sql, params };
}

// List query (for list screen / general)
export function listWorkOrders(filter?: WorkOrderFilter, limit = 500): WorkOrderRow[] {
  const { sql, params } = buildWhere(filter);

  const r = db.executeSync(
    `
    SELECT wo.*
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    ${sql}
    ORDER BY wo.updatedAt DESC
    LIMIT ?;
    `,
    [...params, limit]
  );

  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map(rowToWorkOrder);
}

/**
 * Debug function to inspect sign overdue data in SQLite.
 * Call this to verify what's actually in the database.
 */
export function debugSignOverdueSnapshot() {
  const a = db.executeSync(`
    SELECT COUNT(*) as n
    FROM work_orders
    WHERE LOWER(TRIM(type))='sign';
  `);

  const b = db.executeSync(`
    SELECT COUNT(*) as n
    FROM work_orders
    WHERE LOWER(TRIM(type))='sign'
      AND status IN ('Needs','In Progress','Deferred','Done');
  `);

  const c = db.executeSync(`
    SELECT COUNT(*) as n
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE LOWER(TRIM(wo.type))='sign'
      AND (sd.inspectionLastSavedAt IS NULL);
  `);

  const sample = db.executeSync(`
    SELECT wo.id, wo.type, wo.status, sd.inspectionLastSavedAt
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    WHERE LOWER(TRIM(wo.type))='sign'
    ORDER BY COALESCE(sd.inspectionLastSavedAt, 0) ASC
    LIMIT 10;
  `);

  console.log("[debugSignOverdue] sign count:", a?.rows ?? a);
  console.log("[debugSignOverdue] sign+status count:", b?.rows ?? b);
  console.log("[debugSignOverdue] never-inspected count:", c?.rows ?? c);
  console.log("[debugSignOverdue] sample:", sample?.rows ?? sample);
}

// Map query (bbox overlap + filters)
export function listWorkOrdersInBBox(b: BBox, filter?: WorkOrderFilter, limit = 2000): WorkOrderRow[] {
  const { sql, params } = buildWhere(filter);

  // bbox overlap condition:
  // wo.maxLat >= b.minLat AND wo.minLat <= b.maxLat AND wo.maxLng >= b.minLng AND wo.minLng <= b.maxLng
  const bboxClause = `
    wo.maxLat >= ? AND wo.minLat <= ? AND wo.maxLng >= ? AND wo.minLng <= ?
  `;
  const bboxParams = [b.minLat, b.maxLat, b.minLng, b.maxLng];

  const wherePrefix = sql ? sql.replace(/^WHERE\s+/i, "WHERE ") : "WHERE ";
  const combinedWhere = sql
    ? `${wherePrefix} AND ${bboxClause}`
    : `WHERE ${bboxClause}`;

  const r = db.executeSync(
    `
    SELECT wo.*
    FROM work_orders wo
    LEFT JOIN sign_details sd ON sd.workOrderId = wo.id
    ${combinedWhere}
    ORDER BY wo.updatedAt DESC
    LIMIT ?;
    `,
    [...params, ...bboxParams, limit]
  );

  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map(rowToWorkOrder);
}
