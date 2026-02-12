import { open } from "@op-engineering/op-sqlite";

export const db = open({ name: "roadwork.db" });

// Helper (optional) so you can see DB is alive in logs
export function dbPing() {
  const r = db.execute("SELECT 1 as ok");
  const rows: any = r?.rows;

  // handle both array rows and item(i) rows
  const first =
    Array.isArray(rows) ? rows[0] :
    typeof rows?.item === "function" ? rows.item(0) :
    rows?.[0];

  return first?.ok ?? null;
}
