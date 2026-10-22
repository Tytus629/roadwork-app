/**
 * locationRefs.ts — optional linear-referencing fields (route ID, road name,
 * begin/end milepost) for work orders, drive segments/events and inspections.
 *
 * Stored in a SIDE TABLE `location_refs` (migration 14) rather than new columns
 * on existing tables, because work_orders is written with INSERT OR REPLACE
 * (local saves + remote sync) which would silently wipe unknown columns.
 * Purely additive; existing rows are never touched. Local only (not synced yet).
 *
 * Auto-milepost hook: call setMilepostResolver() with a function that looks up
 * a county road log (e.g. CRAB road log / county GIS centerline with MP calibration).
 * Manual values always win over resolver output.
 */
import { db } from "../db/db";
import { ensureDbSchemaReady } from "../db/migrations";

export type LocationEntityType = "work_order" | "drive_segment" | "drive_event" | "inspection";
export type LocationRef = {
  routeId: string | null;
  roadName: string | null;
  beginMp: number | null;
  endMp: number | null;
  source: "manual" | "resolver" | null;
};
export const EMPTY_REF: LocationRef = { routeId: null, roadName: null, beginMp: null, endMp: null, source: null };

export type MilepostResolver = (geom: {
  entityType: LocationEntityType;
  points: Array<{ lat: number; lng: number }>;
}) => Partial<LocationRef> | null;

let resolver: MilepostResolver | null = null;
export function setMilepostResolver(fn: MilepostResolver | null) {
  resolver = fn;
}

/** Pure merge: manual fields win, resolver fills blanks. */
export function mergeRef(manual: LocationRef | null, resolved: Partial<LocationRef> | null): LocationRef {
  const m = manual ?? EMPTY_REF;
  const r = resolved ?? {};
  const pick = <K extends keyof LocationRef>(k: K) => (m[k] != null && m[k] !== "" ? m[k] : (r[k] as LocationRef[K]) ?? null);
  const out: LocationRef = { routeId: pick("routeId"), roadName: pick("roadName"), beginMp: pick("beginMp"), endMp: pick("endMp"), source: null };
  const anyManual = !!manual && (manual.routeId || manual.roadName || manual.beginMp != null || manual.endMp != null);
  const anyResolved = !!resolved && Object.values(resolved).some((v) => v != null);
  out.source = anyManual ? "manual" : anyResolved ? "resolver" : null;
  return out;
}

export function resolveRef(entityType: LocationEntityType, manual: LocationRef | null, points: Array<{ lat: number; lng: number }>) {
  let r: Partial<LocationRef> | null = null;
  try {
    r = resolver && points.length ? resolver({ entityType, points }) : null;
  } catch (e) {
    console.warn("[locationRefs] resolver failed", e);
  }
  return mergeRef(manual, r);
}

/** Parse user milepost input ("12.34", "MP 12.3", ""). */
export function parseMilepost(s: string | null | undefined): number | null {
  const m = String(s ?? "").replace(/^\s*mp\s*/i, "").trim();
  if (!m) return null;
  const n = Number(m);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 1000) / 1000 : null;
}

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}

export function getLocationRef(entityType: LocationEntityType, entityId: string): LocationRef | null {
  ensureDbSchemaReady("locationRefs");
  const r = rows(db.executeSync(`SELECT * FROM location_refs WHERE entityType = ? AND entityId = ? LIMIT 1;`, [entityType, entityId]))[0];
  return r ? { routeId: r.routeId ?? null, roadName: r.roadName ?? null, beginMp: r.beginMp ?? null, endMp: r.endMp ?? null, source: r.source ?? "manual" } : null;
}

export function getLocationRefMap(entityType: LocationEntityType): Map<string, LocationRef> {
  ensureDbSchemaReady("locationRefs");
  const m = new Map<string, LocationRef>();
  for (const r of rows(db.executeSync(`SELECT * FROM location_refs WHERE entityType = ?;`, [entityType]))) {
    m.set(String(r.entityId), { routeId: r.routeId ?? null, roadName: r.roadName ?? null, beginMp: r.beginMp ?? null, endMp: r.endMp ?? null, source: r.source ?? "manual" });
  }
  return m;
}

export function saveLocationRef(entityType: LocationEntityType, entityId: string, ref: Omit<LocationRef, "source">) {
  ensureDbSchemaReady("locationRefs");
  db.executeSync(
    `INSERT INTO location_refs(entityType, entityId, routeId, roadName, beginMp, endMp, source, updatedAt)
     VALUES (?,?,?,?,?,?, 'manual', ?)
     ON CONFLICT(entityType, entityId) DO UPDATE SET routeId=excluded.routeId, roadName=excluded.roadName,
       beginMp=excluded.beginMp, endMp=excluded.endMp, source='manual', updatedAt=excluded.updatedAt;`,
    [entityType, entityId, ref.routeId || null, ref.roadName || null, ref.beginMp, ref.endMp, Date.now()]
  );
}

/** Apply route/road to every segment + event of a drive (mileposts stay per-segment). */
export function saveDriveSessionRoute(sessionId: string, routeId: string | null, roadName: string | null) {
  ensureDbSchemaReady("locationRefs");
  const segs = rows(db.executeSync(`SELECT id FROM drive_segments WHERE sessionId = ?;`, [sessionId]));
  const evs = rows(db.executeSync(`SELECT id FROM drive_events WHERE sessionId = ?;`, [sessionId]));
  const segMap = getLocationRefMap("drive_segment");
  const evMap = getLocationRefMap("drive_event");
  for (const s of segs) {
    const cur = segMap.get(s.id);
    saveLocationRef("drive_segment", s.id, { routeId, roadName, beginMp: cur?.beginMp ?? null, endMp: cur?.endMp ?? null });
  }
  for (const e of evs) {
    const cur = evMap.get(e.id);
    saveLocationRef("drive_event", e.id, { routeId, roadName, beginMp: cur?.beginMp ?? null, endMp: null });
  }
}
