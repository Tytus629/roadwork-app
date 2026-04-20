import { open } from "@op-engineering/op-sqlite";

export const db = open({ name: "roadwork.db" });

export type EnsureColumnResult = "added" | "existing" | "table-missing";

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

function tableExists(table: string): boolean {
  const r = db.executeSync(
    `SELECT name FROM sqlite_master WHERE type='table' AND name=? LIMIT 1;`,
    [table]
  );
  const rows = rowsToArray(r?.rows);
  return rows.length > 0;
}

function ensureColumnIfMissing(table: string, column: string, colDef: string): EnsureColumnResult {
  if (!tableExists(table)) {
    return "table-missing";
  }

  const info = db.executeSync(`PRAGMA table_info(${table});`);
  const rowsArr = rowsToArray(info?.rows);
  const exists = rowsArr.some((r: any) => String(r.name) === column);
  if (exists) {
    return "existing";
  }

  db.executeSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef};`);
  return "added";
}

/**
 * Helper to add a column to a table if it doesn't already exist.
 * Prevents ALTER TABLE errors on app restart when column already exists.
 */
export function addColumnIfMissing(table: string, column: string, colDef: string) {
  ensureColumnIfMissing(table, column, colDef);
}

/**
 * Idempotent safety-net migration used by org-scoped work order queries.
 * Returns whether orgId was added, already existed, or table is not present yet.
 */
export function ensureWorkOrdersOrgIdColumn(): EnsureColumnResult {
  return ensureColumnIfMissing("work_orders", "orgId", "TEXT");
}

// Helper (optional) so you can see DB is alive in logs
export function dbPing() {
  const r = db.executeSync("SELECT 1 as ok");
  const rows: any = r?.rows;

  // handle both array rows and item(i) rows
  const first =
    Array.isArray(rows) ? rows[0] :
    typeof rows?.item === "function" ? rows.item(0) :
    rows?.[0];

  return first?.ok ?? null;
}
