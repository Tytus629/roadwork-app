/**
 * serializers.ts — pure CSV / GeoJSON (RFC 7946, EPSG:4326, [lng, lat]) builders
 * with GIS-Mo / VUEWorks-style field names. See docs/integration-exports.md for
 * the mapping table and which mappings are ASSUMPTIONS pending CRAB confirmation.
 */
import type { LocationRef } from "./locationRefs";
import { EMPTY_REF } from "./locationRefs";

export type Row = Record<string, string | number | boolean | null | undefined>;

/** RFC 4180: quote fields containing , " CR or LF; double quotes. Guards spreadsheet formula injection. */
export function csvCell(v: unknown): string {
  if (v == null) return "";
  let s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(columns: string[], rows: Row[]): string {
  const lines = [columns.map(csvCell).join(",")];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(","));
  return lines.join("\r\n") + "\r\n";
}

export type Geometry =
  | { type: "Point"; coordinates: [number, number] }
  | { type: "LineString"; coordinates: [number, number][] };

export type Feature = { type: "Feature"; id: string; geometry: Geometry | null; properties: Row };
export type FeatureCollection = { type: "FeatureCollection"; name: string; features: Feature[] };

const r6 = (n: number) => Math.round(n * 1e6) / 1e6;
const validLL = (p: { lat: number; lng: number }) =>
  Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;

export function pointGeom(lat: number | null | undefined, lng: number | null | undefined): Geometry | null {
  if (lat == null || lng == null || !validLL({ lat, lng })) return null;
  return { type: "Point", coordinates: [r6(lng), r6(lat)] };
}
export function lineGeom(points: Array<{ lat: number; lng: number }> | null | undefined): Geometry | null {
  const pts = (points ?? []).filter(validLL);
  if (pts.length < 2) return pts.length === 1 ? pointGeom(pts[0].lat, pts[0].lng) : null;
  return { type: "LineString", coordinates: pts.map((p) => [r6(p.lng), r6(p.lat)] as [number, number]) };
}

export function featureCollection(name: string, items: Array<{ id: string; geometry: Geometry | null; properties: Row }>): FeatureCollection {
  return { type: "FeatureCollection", name, features: items.map((i) => ({ type: "Feature", id: i.id, geometry: i.geometry, properties: i.properties })) };
}

const iso = (ms: number | null | undefined) => (ms == null || !Number.isFinite(ms) ? null : new Date(ms).toISOString());
const refCols = (r: LocationRef | null | undefined) => {
  const x = r ?? EMPTY_REF;
  return { ROUTE_ID: x.routeId, ROAD_NAME: x.roadName, BEGIN_MP: x.beginMp, END_MP: x.endMp, LOC_REF_SOURCE: x.source };
};

// ── Drive segments ─────────────────────────────────────────────
export type SegmentIn = {
  id: string; sessionId: string; seq: number; startedAt: number; endedAt: number;
  path: Array<{ lat: number; lng: number }>; lengthM: number; sampleCount: number;
  rmsVertical: number; meanSpeedMps: number; roughnessIndex: number; roughnessClass: string;
};
export const SEGMENT_COLUMNS = [
  "FEATURE_ID", "SURVEY_ID", "SEGMENT_SEQ", "ROUTE_ID", "ROAD_NAME", "BEGIN_MP", "END_MP", "LOC_REF_SOURCE",
  "SURVEY_DATE", "SURVEY_START", "SURVEY_END", "LENGTH_FT", "AVG_SPEED_MPH", "ROUGHNESS_INDEX", "ROUGHNESS_CLASS",
  "RMS_VERT_MS2", "SAMPLE_COUNT", "BEGIN_LAT", "BEGIN_LON", "END_LAT", "END_LON", "DATA_QUALITY", "METHOD",
  "SCREEN_RATING_1_5", "DETECTED_DISTRESS", "PHOTOS_ANALYSED",
];
export type SegmentExtras = { rating?: number | null; distress?: string[]; photosAnalysed?: number };
export function segmentRow(s: SegmentIn, ref?: LocationRef | null, x: SegmentExtras = {}): Row {
  const a = s.path[0], b = s.path[s.path.length - 1];
  return {
    FEATURE_ID: s.id, SURVEY_ID: s.sessionId, SEGMENT_SEQ: s.seq, ...refCols(ref),
    SURVEY_DATE: iso(s.startedAt)?.slice(0, 10) ?? null, SURVEY_START: iso(s.startedAt), SURVEY_END: iso(s.endedAt),
    LENGTH_FT: Math.round(s.lengthM * 3.28084 * 10) / 10, AVG_SPEED_MPH: Math.round(s.meanSpeedMps * 2.23694 * 10) / 10,
    ROUGHNESS_INDEX: Math.round(s.roughnessIndex * 1000) / 1000, ROUGHNESS_CLASS: s.roughnessClass,
    RMS_VERT_MS2: Math.round(s.rmsVertical * 1000) / 1000, SAMPLE_COUNT: s.sampleCount,
    BEGIN_LAT: a ? r6(a.lat) : null, BEGIN_LON: a ? r6(a.lng) : null, END_LAT: b ? r6(b.lat) : null, END_LON: b ? r6(b.lng) : null,
    DATA_QUALITY: "UNCALIBRATED_SCREENING", METHOD: "PHONE_ACCEL_RMS",
    SCREEN_RATING_1_5: x.rating ?? null,
    DETECTED_DISTRESS: x.distress && x.distress.length ? [...new Set(x.distress)].sort().join(";") : null,
    PHOTOS_ANALYSED: x.photosAnalysed ?? 0,
  };
}

// ── Bump events ────────────────────────────────────────────────
export type EventIn = { id: string; sessionId: string; occurredAt: number; lat: number; lng: number; speedMps: number | null; peakMps2: number; severity: string; workOrderId: string | null };
export const EVENT_COLUMNS = [
  "FEATURE_ID", "SURVEY_ID", "OBS_DATE", "OBS_TIME", "ROUTE_ID", "ROAD_NAME", "BEGIN_MP", "LOC_REF_SOURCE",
  "DISTRESS_TYPE", "SEVERITY", "PEAK_G", "SPEED_MPH", "LAT", "LON", "WORK_ORDER_ID", "DATA_QUALITY",
];
export function eventRow(e: EventIn, ref?: LocationRef | null): Row {
  const rc = refCols(ref);
  return {
    FEATURE_ID: e.id, SURVEY_ID: e.sessionId, OBS_DATE: iso(e.occurredAt)?.slice(0, 10) ?? null, OBS_TIME: iso(e.occurredAt),
    ROUTE_ID: rc.ROUTE_ID, ROAD_NAME: rc.ROAD_NAME, BEGIN_MP: rc.BEGIN_MP, LOC_REF_SOURCE: rc.LOC_REF_SOURCE,
    DISTRESS_TYPE: e.severity === "bump" ? "BUMP" : "POTHOLE_SUSPECTED",
    SEVERITY: e.severity === "severe" ? "HIGH" : e.severity === "pothole" ? "MEDIUM" : "LOW",
    PEAK_G: Math.round((e.peakMps2 / 9.80665) * 100) / 100,
    SPEED_MPH: e.speedMps == null ? null : Math.round(e.speedMps * 2.23694 * 10) / 10,
    LAT: r6(e.lat), LON: r6(e.lng), WORK_ORDER_ID: e.workOrderId, DATA_QUALITY: "UNCALIBRATED_SCREENING",
  };
}

// ── Work orders ────────────────────────────────────────────────
export type WorkOrderIn = {
  id: string; type: string; status: string; priority: string; geomType: string;
  lat?: number | null; lng?: number | null; line?: Array<{ lat: number; lng: number }> | null;
  note?: string | null; createdAt: number; updatedAt: number;
  createdByDisplayName?: string | null; assignedToName?: string | null;
  assetId?: string | null; assetType?: string | null; details?: Record<string, any> | null;
};

/** ASSUMPTION: activity codes are placeholders until mapped to the county's GIS-Mo/VUEWorks activity list. */
export const ACTIVITY_CODES: Record<string, string> = {
  pothole: "PAV-POTHOLE",
  pavement_repair: "PAV-REPAIR",
  asphalt_patch: "PAV-PATCH",
  asphalt: "PAV-PATCH",
  roadway_surface_repair: "PAV-SURFACE",
  spraying: "VEG-SPRAY",
  brushing: "VEG-BRUSH",
  danger_tree: "VEG-BRUSH",
  culvert: "DRN-CULVERT",
  ditching: "DRN-DITCH",
  guardrail: "SAF-GUARDRAIL",
  sign: "SAF-SIGN",
};
export const ASSET_TYPES: Record<string, string> = {
  pothole: "ROADWAY", pavement_repair: "ROADWAY", asphalt_patch: "ROADWAY", asphalt: "ROADWAY", roadway_surface_repair: "ROADWAY",
  spraying: "ROADSIDE", brushing: "ROADSIDE", danger_tree: "ROADSIDE", culvert: "CULVERT", ditching: "DITCH",
  guardrail: "GUARDRAIL", sign: "SIGN",
};
const STATUS: Record<string, string> = { needs: "OPEN", "in progress": "IN_PROGRESS", in_progress: "IN_PROGRESS", done: "COMPLETED", completed: "COMPLETED", deferred: "DEFERRED" };

export const WORK_ORDER_COLUMNS = [
  "WORK_ORDER_ID", "ASSET_TYPE", "ASSET_ID", "ACTIVITY_CODE", "WORK_TYPE", "STATUS", "PRIORITY",
  "ROUTE_ID", "ROAD_NAME", "BEGIN_MP", "END_MP", "LOC_REF_SOURCE",
  "DATE_CREATED", "DATE_MODIFIED", "DATE_COMPLETED", "REQUESTED_BY", "ASSIGNED_TO",
  "LABOR_HOURS", "EQUIPMENT_HOURS", "MATERIAL_QTY", "MATERIAL_UNIT", "MATERIAL_DESC", "TOTAL_COST",
  "DESCRIPTION", "GEOM_TYPE", "LAT", "LON",
];

const num = (v: any) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));

export function workOrderRow(w: WorkOrderIn, ref?: LocationRef | null): Row {
  const key = String(w.type ?? "").trim().toLowerCase();
  const st = STATUS[String(w.status ?? "").trim().toLowerCase()] ?? String(w.status ?? "").toUpperCase();
  const d = w.details ?? {};
  const center = w.geomType === "point" ? { lat: w.lat, lng: w.lng } : (w.line && w.line[Math.floor(w.line.length / 2)]) || { lat: null, lng: null };
  return {
    WORK_ORDER_ID: w.id,
    ASSET_TYPE: (w.assetType ? String(w.assetType).toUpperCase() : null) ?? ASSET_TYPES[key] ?? null,
    ASSET_ID: w.assetId ?? null,
    ACTIVITY_CODE: ACTIVITY_CODES[key] ?? null,
    WORK_TYPE: w.type,
    STATUS: st,
    PRIORITY: String(w.priority ?? "").toUpperCase() || null,
    ...refCols(ref),
    DATE_CREATED: iso(w.createdAt),
    DATE_MODIFIED: iso(w.updatedAt),
    // ASSUMPTION: app has no completedAt; use updatedAt when status is completed.
    DATE_COMPLETED: st === "COMPLETED" ? iso(w.updatedAt) : null,
    REQUESTED_BY: w.createdByDisplayName ?? null,
    ASSIGNED_TO: w.assignedToName ?? null,
    // Not captured by the app today; exported only if present in details.
    LABOR_HOURS: num(d.laborHours),
    EQUIPMENT_HOURS: num(d.equipmentHours),
    MATERIAL_QTY: num(d.materialQty ?? d.tons ?? d.quantity),
    MATERIAL_UNIT: d.materialUnit ?? (d.tons != null ? "TON" : null),
    MATERIAL_DESC: d.materialNote ?? d.material ?? null,
    TOTAL_COST: num(d.totalCost ?? d.cost),
    DESCRIPTION: w.note ?? null,
    GEOM_TYPE: w.geomType,
    LAT: center?.lat != null ? r6(center.lat) : null,
    LON: center?.lng != null ? r6(center.lng) : null,
  };
}
export function workOrderGeom(w: WorkOrderIn): Geometry | null {
  return w.geomType === "line" ? lineGeom(w.line) : pointGeom(w.lat, w.lng);
}

// ── Photo damage detections (Phase 2, screening) ───────────────
export type DetectionIn = { id: string; photoId: string; sessionId: string; segmentId: string | null; cls: string; score: number; lat: number | null; lng: number | null; modelName: string; modelVersion: string; createdAt: number; boxX: number; boxY: number; boxW: number; boxH: number };
export const DETECTION_COLUMNS = [
  "FEATURE_ID", "SURVEY_ID", "SEGMENT_ID", "PHOTO_ID", "OBS_DATE", "ROUTE_ID", "ROAD_NAME", "BEGIN_MP", "LOC_REF_SOURCE",
  "DISTRESS_CODE", "DISTRESS_TYPE", "CONFIDENCE", "LAT", "LON", "BBOX_X", "BBOX_Y", "BBOX_W", "BBOX_H", "MODEL", "DATA_QUALITY",
];
const DISTRESS_NAMES: Record<string, string> = { D00: "LONGITUDINAL_CRACK", D10: "TRANSVERSE_CRACK", D20: "ALLIGATOR_CRACK", D40: "POTHOLE" };
export function detectionRow(d: DetectionIn, ref?: LocationRef | null): Row {
  const rc = refCols(ref);
  const r3 = (n: number) => Math.round(n * 1000) / 1000;
  return {
    FEATURE_ID: d.id, SURVEY_ID: d.sessionId, SEGMENT_ID: d.segmentId, PHOTO_ID: d.photoId,
    OBS_DATE: iso(d.createdAt)?.slice(0, 10) ?? null,
    ROUTE_ID: rc.ROUTE_ID, ROAD_NAME: rc.ROAD_NAME, BEGIN_MP: rc.BEGIN_MP, LOC_REF_SOURCE: rc.LOC_REF_SOURCE,
    DISTRESS_CODE: d.cls, DISTRESS_TYPE: DISTRESS_NAMES[d.cls] ?? d.cls, CONFIDENCE: r3(d.score),
    LAT: d.lat == null ? null : r6(d.lat), LON: d.lng == null ? null : r6(d.lng),
    BBOX_X: r3(d.boxX), BBOX_Y: r3(d.boxY), BBOX_W: r3(d.boxW), BBOX_H: r3(d.boxH),
    MODEL: `${d.modelName}@${d.modelVersion}`, DATA_QUALITY: "UNCALIBRATED_SCREENING",
  };
}
