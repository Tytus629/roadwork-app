/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SQLITE PERSISTENCE REPOSITORY (Work Items & Audit Logs)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Provides SQLite persistence layer for work orders and audit logs.
 * Called by commitWorkOrder() to save data to disk.
 * 
 * COMPREHENSIVE LOGGING (Added for debugging "Work Orders disappear" issue):
 * - upsertWorkItem(): Logs before & after every save
 * - getAllWorkItems(): Logs loading operations
 * - insertLog(): Logs audit trail persistence
 * - Format: [workRepo] <operation> <details>
 * 
 * GRACEFUL ERROR HANDLING:
 * - All functions catch DB errors and log warnings
 * - Never throws exceptions (prevents app crashes)
 * - If DB unavailable, operations silently fail with warnings
 * 
 * KEY FUNCTIONS:
 * - upsertWorkItem(item): Insert or update work order (UPSERT)
 * - getAllWorkItems(): Load all work orders on startup
 * - insertLog(entry): Persist audit log entry
 * - getWorkLogs(itemId): Load audit history for work order
 * - deleteWorkItem(id): Remove work order and its logs
 * 
 * DATA MAPPING:
 * - Converts TypeScript objects ↔ SQLite rows
 * - JSON.stringify for complex fields (geometry, photos, signMaintenance)
 * - Handles nullable fields properly
 * - Maps boolean needsSync ↔ SQLite integer (0/1)
 * 
 * CHANGE HISTORY:
 * - Added comprehensive logging to all operations
 * - Enhanced upsertWorkItem to log needsSync value
 * - Added startup logging to getAllWorkItems
 * - Improved error messages for diagnostics
 */
import { getDb, isDbAvailable } from "./db";
import type { WorkItem } from "../types/workItem";

export { isDbAvailable };

type WorkLogRow = {
  id: string;
  work_item_id: string;
  ts: number;
  event_type: string;
  data_json: string | null;
};

type WorkItemRow = {
  id: string;
  type: string;
  geometry_json: string;
  status: string;
  priority: string | null;
  note: string | null;
  sign_json: string | null;
  photos_json: string | null;
  created_at: number;
  updated_at: number;
  needs_sync: number | null;
  completed_at: number | null;
};

function now() {
  return Date.now();
}

/**
 * Inserts or updates a work item in SQLite.
 * UPSERT operation: INSERT if new, UPDATE if exists.
 * 
 * LOGGING:
 * - Before: Logs work order ID and needsSync flag
 * - After: Logs success confirmation
 * - Pattern enables debugging persistence issues
 * 
 * NEVER THROWS:
 * - Catches all errors and logs warnings
 * - Allows app to continue if DB unavailable
 * 
 * @param item - Complete WorkItem object to persist
 */
export async function upsertWorkItem(item: WorkItem): Promise<void> {
  // Log BEFORE operation for debugging
  console.log("[workRepo] UPSERT", item.id, "needsSync=", item.needsSync);
  try {
    const db = await getDb();

    const row = {
      id: item.id,
      type: item.type,
      geometry_json: JSON.stringify(item.geometry),
      status: item.status,
      priority: item.priority ?? null,
      note: item.notes ?? null,
      sign_json: item.signMaintenance || item.signDetails || item.signInspection 
        ? JSON.stringify({ 
            signMaintenance: item.signMaintenance, 
            signDetails: item.signDetails,
            signInspection: item.signInspection 
          }) 
        : null,
      photos_json: item.photos ? JSON.stringify(item.photos) : null,
      created_at: item.createdAt,
      updated_at: item.updatedAt ?? now(),
      needs_sync: item.needsSync ? 1 : 0, // STEP 1: Map boolean to integer
      completed_at: item.completedAt ?? null, // STEP 2: Map completedAt timestamp
    };

    await db.executeSql(
      `
      INSERT OR REPLACE INTO work_items
      (id, type, geometry_json, status, priority, note, sign_json, photos_json, created_at, updated_at, needs_sync, completed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
      [
        row.id,
        row.type,
        row.geometry_json,
        row.status,
        row.priority,
        row.note,
        row.sign_json,
        row.photos_json,
        row.created_at,
        row.updated_at,
        row.needs_sync,
        row.completed_at,
      ],
    );
    console.log("[workRepo] UPSERT OK", item.id);
  } catch (error) {
    console.warn("[workRepo] UPSERT FAILED", item.id, error);
    // Don't throw - allow app to continue without persistence
  }
}

export async function getAllWorkItems(): Promise<WorkItem[]> {
  console.log("[workRepo] Loading persisted work orders...");
  try {
    const db = await getDb();
    const [res] = await db.executeSql(
      `SELECT * FROM work_items ORDER BY updated_at DESC`,
    );
    const items: WorkItem[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i) as WorkItemRow;
      const signData = r.sign_json ? JSON.parse(r.sign_json) : undefined;
      items.push({
        id: r.id,
        type: r.type as any,
        geometry: JSON.parse(r.geometry_json),
        status: r.status as any,
        priority: (r.priority as any) ?? undefined,
        notes: r.note ?? undefined,
        signMaintenance: signData?.signMaintenance,
        signDetails: signData?.signDetails,
        signInspection: signData?.signInspection,
        photos: r.photos_json ? JSON.parse(r.photos_json) : undefined,
        needsSync: !!(r.needs_sync ?? 0), // STEP 1: Map integer to boolean
        completedAt: r.completed_at ?? undefined, // STEP 2: Map completedAt timestamp
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      });
    }
    console.log("[workRepo] Loaded", items.length, "work orders from DB");
    return items;
  } catch (error) {
    console.log("[workRepo] Load FAILED:", error);
    return [];
  }
}

export async function getWorkItem(id: string): Promise<WorkItem | null> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(`SELECT * FROM work_items WHERE id = ?`, [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows.item(0) as WorkItemRow;
    const signData = r.sign_json ? JSON.parse(r.sign_json) : undefined;
    return {
      id: r.id,
      type: r.type as any,
      geometry: JSON.parse(r.geometry_json),
      status: r.status as any,
      priority: (r.priority as any) ?? undefined,
      notes: r.note ?? undefined,
      signMaintenance: signData?.signMaintenance,
      signDetails: signData?.signDetails,
      signInspection: signData?.signInspection,
      photos: r.photos_json ? JSON.parse(r.photos_json) : undefined,
      needsSync: !!(r.needs_sync ?? 0), // STEP 1: Map integer to boolean
      completedAt: r.completed_at ?? undefined, // STEP 2: Map completedAt timestamp
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  } catch (error) {
    console.warn("[getWorkItem] Failed (running without persistence):", error);
    return null;
  }
}

export async function deleteWorkItem(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.executeSql(`DELETE FROM work_logs WHERE work_item_id = ?`, [id]);
    await db.executeSql(`DELETE FROM work_items WHERE id = ?`, [id]);
    console.log(`[deleteWorkItem] Deleted item ${id}`);
  } catch (error) {
    console.warn("[deleteWorkItem] Failed (running without persistence):", error);
    // Don't throw - allow app to continue without persistence
  }
}

export async function addWorkLog(params: {
  id: string;
  workItemId: string;
  ts?: number;
  eventType: string;
  data?: any;
}): Promise<void> {
  try {
    const db = await getDb();
    await db.executeSql(
      `
      INSERT OR REPLACE INTO work_logs (id, work_item_id, ts, event_type, data_json)
      VALUES (?, ?, ?, ?, ?)
    `,
      [
        params.id,
        params.workItemId,
        params.ts ?? now(),
        params.eventType,
        params.data ? JSON.stringify(params.data) : null,
      ],
    );
    console.log(`[addWorkLog] Added log for item ${params.workItemId}`);
  } catch (error) {
    console.warn("[addWorkLog] Failed (running without persistence):", error);
    // Don't throw - allow app to continue without persistence
  }
}

export async function getWorkLogs(workItemId: string): Promise<
  { id: string; ts: number; type: string; data?: any }[]
> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(
      `SELECT * FROM work_logs WHERE work_item_id = ? ORDER BY ts DESC`,
      [workItemId],
    );

    const logs: { id: string; ts: number; type: string; data?: any }[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i) as WorkLogRow;
      logs.push({
        id: r.id,
        ts: r.ts,
        type: r.event_type,
        data: r.data_json ? JSON.parse(r.data_json) : undefined,
      });
    }
    return logs;
  } catch (error) {
    console.warn("[getWorkLogs] Failed (running without persistence):", error);
    return [];
  }
}
