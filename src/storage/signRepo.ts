import { getDb, isDbAvailable } from "./db";
import type { SignAsset, SignInspection } from "../types/Sign";

export { isDbAvailable };

/**
 * Resilient Sign Asset Repository
 * 
 * All functions are wrapped in try/catch and return safe defaults on failure.
 * App continues to function even if SQLite is unavailable.
 */

type SignRow = {
  id: string;
  sign_json: string;
  updated_at: number;
};

type InspectionRow = {
  id: string;
  sign_id: string;
  inspection_json: string;
  ts: number;
};

/**
 * Persist a sign asset to the database.
 */
export async function upsertSign(sign: SignAsset): Promise<void> {
  try {
    const db = await getDb();

    await db.executeSql(
      `
      INSERT OR REPLACE INTO signs
      (id, sign_json, updated_at)
      VALUES (?, ?, ?)
    `,
      [sign.id, JSON.stringify(sign), sign.updatedAt],
    );
    console.log(`[upsertSign] Saved sign ${sign.id}`);
  } catch (error) {
    console.warn("[upsertSign] Failed (running without persistence):", error);
  }
}

/**
 * Load all sign assets from the database.
 */
export async function getAllSigns(): Promise<SignAsset[]> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(
      `SELECT * FROM signs ORDER BY updated_at DESC`,
    );
    const signs: SignAsset[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i) as SignRow;
      signs.push(JSON.parse(r.sign_json));
    }
    console.log(`[getAllSigns] Loaded ${signs.length} signs`);
    return signs;
  } catch (error) {
    console.warn("[getAllSigns] Failed (returning empty array):", error);
    return [];
  }
}

/**
 * Get a single sign by ID.
 */
export async function getSign(id: string): Promise<SignAsset | null> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(`SELECT * FROM signs WHERE id = ?`, [id]);
    if (res.rows.length === 0) return null;
    const r = res.rows.item(0) as SignRow;
    return JSON.parse(r.sign_json);
  } catch (error) {
    console.warn("[getSign] Failed:", error);
    return null;
  }
}

/**
 * Delete a sign asset (and its inspections).
 */
export async function deleteSign(id: string): Promise<void> {
  try {
    const db = await getDb();
    await db.executeSql(`DELETE FROM sign_inspections WHERE sign_id = ?`, [id]);
    await db.executeSql(`DELETE FROM signs WHERE id = ?`, [id]);
    console.log(`[deleteSign] Deleted sign ${id}`);
  } catch (error) {
    console.warn("[deleteSign] Failed:", error);
  }
}

/**
 * Persist an inspection to the database.
 */
export async function addInspection(inspection: SignInspection): Promise<void> {
  try {
    const db = await getDb();

    await db.executeSql(
      `
      INSERT OR REPLACE INTO sign_inspections
      (id, sign_id, inspection_json, ts)
      VALUES (?, ?, ?, ?)
    `,
      [inspection.id, inspection.signId, JSON.stringify(inspection), inspection.ts],
    );
    console.log(`[addInspection] Saved inspection ${inspection.id}`);
  } catch (error) {
    console.warn("[addInspection] Failed (running without persistence):", error);
  }
}

/**
 * Load all inspections for a specific sign.
 */
export async function getInspectionsForSign(signId: string): Promise<SignInspection[]> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(
      `SELECT * FROM sign_inspections WHERE sign_id = ? ORDER BY ts DESC`,
      [signId],
    );
    const inspections: SignInspection[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i) as InspectionRow;
      inspections.push(JSON.parse(r.inspection_json));
    }
    console.log(`[getInspectionsForSign] Loaded ${inspections.length} inspections for sign ${signId}`);
    return inspections;
  } catch (error) {
    console.warn("[getInspectionsForSign] Failed (returning empty array):", error);
    return [];
  }
}

/**
 * Get all inspections across all signs (for audit/analytics).
 */
export async function getAllInspections(): Promise<SignInspection[]> {
  try {
    const db = await getDb();
    const [res] = await db.executeSql(
      `SELECT * FROM sign_inspections ORDER BY ts DESC`,
    );
    const inspections: SignInspection[] = [];
    for (let i = 0; i < res.rows.length; i++) {
      const r = res.rows.item(i) as InspectionRow;
      inspections.push(JSON.parse(r.inspection_json));
    }
    console.log(`[getAllInspections] Loaded ${inspections.length} total inspections`);
    return inspections;
  } catch (error) {
    console.warn("[getAllInspections] Failed (returning empty array):", error);
    return [];
  }
}
