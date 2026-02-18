import { open } from "@op-engineering/op-sqlite";

export const db = open({ name: "roadwork.db" });

/**
 * Helper to add a column to a table if it doesn't already exist.
 * Prevents ALTER TABLE errors on app restart when column already exists.
 */
export function addColumnIfMissing(table: string, column: string, colDef: string) {
  const info = db.executeSync(`PRAGMA table_info(${table});`);
  const rows = info?.rows ?? [];
  const rowsArr = Array.isArray(rows) ? rows : [];
  const exists = rowsArr.some((r: any) => String(r.name) === column);
  if (!exists) {
    db.executeSync(`ALTER TABLE ${table} ADD COLUMN ${column} ${colDef};`);
  }
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
