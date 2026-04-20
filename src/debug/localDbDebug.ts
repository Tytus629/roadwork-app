// src/debug/localDbDebug.ts
//
// Debug helper: logs local SQLite row counts for work_orders and outbox.
// Uses synchronous op-sqlite (executeSync) matching the rest of the codebase.

import { db, ensureWorkOrdersOrgIdColumn } from "../db/db";
import { requireOrgId } from "../org/requireOrg";

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

export function debugLocalCounts(orgId: string) {
  try {
    const safeOrgId = requireOrgId(orgId);
    ensureWorkOrdersOrgIdColumn();

    const woResult = db.executeSync(
      `SELECT COUNT(*) as c FROM work_orders WHERE orgId = ?`,
      [safeOrgId],
    );
    const obResult = db.executeSync(
      `SELECT COUNT(*) as c FROM outbox WHERE orgId = ?`,
      [safeOrgId],
    );
    const lastResult = db.executeSync(
      `SELECT id, orgId, type, geomType, lat, lng, status, priority, createdAt FROM work_orders WHERE orgId = ? ORDER BY createdAt DESC LIMIT 5`,
      [safeOrgId],
    );

    const woCount = Number(readRows(woResult)?.[0]?.c ?? 0);
    const obCount = Number(readRows(obResult)?.[0]?.c ?? 0);
    const last5 = readRows(lastResult);

    console.log("[LocalDB] counts", {
      orgId: safeOrgId,
      workOrders: woCount,
      outbox: obCount,
    });
    // Log each row individually so lat/lng are visible without expanding
    last5.forEach((r, i) => {
      console.log(`[LocalDB] row[${i}]`, {
        id: r.id,
        orgId: r.orgId,
        type: r.type,
        geomType: r.geomType,
        lat: r.lat,
        lng: r.lng,
        status: r.status,
        priority: r.priority,
      });
    });
  } catch (e: any) {
    console.warn("[LocalDB] debug query failed:", e?.message);
  }
}
