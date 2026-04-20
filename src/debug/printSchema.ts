// src/debug/printSchema.ts
//
// One-shot debug helper: prints PRAGMA table_info for any table.

import { db } from "../db/db";

function readRows(r: any): any[] {
  const rows = r?.rows;
  if (Array.isArray(rows)) return rows;
  if (rows && typeof rows.item === "function") {
    const out: any[] = [];
    for (let i = 0; i < (rows.length ?? 0); i++) out.push(rows.item(i));
    return out;
  }
  return rows ? Array.from(rows) : [];
}

export function printTableSchema(table: string) {
  try {
    const result = db.executeSync(`PRAGMA table_info(${table});`, []);
    const cols = readRows(result);
    console.log(`[LocalDB] schema ${table}`, JSON.stringify(cols));
  } catch (e: any) {
    console.warn(`[LocalDB] schema ${table} failed:`, e?.message);
  }
}
