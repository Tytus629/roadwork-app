import { db } from "./db";
import { bboxForLine, bboxForPoint } from "./geom";
import { BBox, LatLng, WorkOrderFilter, WorkOrderRow, SignDetailsRow } from "./types";

function nowMs() {
  return Date.now();
}

function rowToWorkOrder(r: any): WorkOrderRow {
  return {
    id: String(r.id),
    type: String(r.type),
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
  };
}

export function getDistinctWorkOrderTypes(): string[] {
  const r = db.executeSync(`
    SELECT DISTINCT type
    FROM work_orders
    WHERE type IS NOT NULL AND TRIM(type) <> ''
    ORDER BY type ASC;
  `);

  const rows: any = r?.rows;
  const arr = Array.isArray(rows) ? rows : [];
  return arr.map((x: any) => String(x.type));
}

export type SortMode = "priority" | "newest" | "oldest";

function sortSql(sort: SortMode) {
  if (sort === "newest") return "ORDER BY wo.createdAt DESC";
  if (sort === "oldest") return "ORDER BY wo.createdAt ASC";

  // "priority" sort: Urgent > High > Medium > Low then newest within priority
  return `
    ORDER BY
      CASE wo.priority
        WHEN 'urgent' THEN 4
        WHEN 'high' THEN 3
        WHEN 'medium' THEN 2
        WHEN 'low' THEN 1
        ELSE 0
      END DESC,
      wo.createdAt DESC
  `;
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
    where.push(`wo.type IN (${filter.types.map(() => "?").join(",")})`);
    params.push(...filter.types);
  }
  if (filter?.status?.length) {
    where.push(`wo.status IN (${filter.status.map(() => "?").join(",")})`);
    params.push(...filter.status);
  }
  if (filter?.priority?.length) {
    where.push(`wo.priority IN (${filter.priority.map(() => "?").join(",")})`);
    params.push(...filter.priority);
  }

  // Sign-specific filters require LEFT JOIN sign_details
  if (filter?.signCategory?.length) {
    where.push(`sd.category IN (${filter.signCategory.map(() => "?").join(",")})`);
    params.push(...filter.signCategory);
  }
  if (filter?.signCondition?.length) {
    where.push(`sd.condition IN (${filter.signCondition.map(() => "?").join(",")})`);
    params.push(...filter.signCondition);
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
