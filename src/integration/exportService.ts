/** exportService.ts — gathers local data, serializes, and opens the OS share sheet. */
import RNFS from "react-native-fs";
import Share from "react-native-share";
import { db } from "../db/db";
import { ensureDbSchemaReady } from "../db/migrations";
import { listDriveEvents, listDriveSegments } from "../repositories/roughnessRepo";
import { getLocationRefMap, resolveRef } from "./locationRefs";
import { listDetections, photosCheckedBySegment } from "../repositories/detectionsRepo";
import { segmentRating } from "../detection/rating";
import {
  EVENT_COLUMNS, SEGMENT_COLUMNS, WORK_ORDER_COLUMNS, DETECTION_COLUMNS, detectionRow,
  eventRow, featureCollection, lineGeom, pointGeom, segmentRow, toCsv, workOrderGeom, workOrderRow,
  type WorkOrderIn,
} from "./serializers";

export type ExportDataset = "drive_segments" | "bump_events" | "work_orders" | "damage_detections";
export type ExportFormat = "csv" | "geojson";

function rows(r: any): any[] {
  const x = r?.rows;
  if (!x) return [];
  if (Array.isArray(x)) return x;
  if (typeof x.item === "function") return Array.from({ length: x.length }, (_, i) => x.item(i));
  return [];
}
const parse = (s: any) => {
  try {
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
};

export function loadWorkOrdersForExport(orgId: string | null): WorkOrderIn[] {
  ensureDbSchemaReady("export");
  const r = orgId
    ? db.executeSync(`SELECT * FROM work_orders WHERE orgId = ? ORDER BY createdAt DESC;`, [orgId])
    : db.executeSync(`SELECT * FROM work_orders ORDER BY createdAt DESC;`);
  return rows(r)
    .filter((w) => !w.deleted)
    .map((w) => ({ ...w, line: parse(w.lineJson), details: parse(w.detailsJson) }));
}

export function buildExport(dataset: ExportDataset, format: ExportFormat, opts: { orgId: string | null; fromMs?: number | null }) {
  const f = { orgId: opts.orgId, fromMs: opts.fromMs ?? null };
  let columns: string[];
  let items: Array<{ id: string; geometry: any; properties: any }>;
  if (dataset === "drive_segments") {
    const refs = getLocationRefMap("drive_segment");
    columns = SEGMENT_COLUMNS;
    const dets = listDetections({ fromMs: f.fromMs });
    const checked = photosCheckedBySegment(null);
    items = listDriveSegments(f, 100000).map((s) => {
      const sd = dets.filter((d) => d.segmentId === s.id);
      const n = checked.get(s.id) ?? 0;
      return {
        id: s.id, geometry: lineGeom(s.path),
        properties: segmentRow(s, resolveRef("drive_segment", refs.get(s.id) ?? null, s.path), {
          rating: segmentRating({ roughnessClass: s.roughnessClass as any, photosChecked: n, detections: sd }),
          distress: sd.map((d) => d.cls), photosAnalysed: n,
        }),
      };
    });
  } else if (dataset === "damage_detections") {
    const refs = getLocationRefMap("drive_segment");
    columns = DETECTION_COLUMNS;
    items = listDetections({ fromMs: f.fromMs }).map((d) => ({
      id: d.id, geometry: pointGeom(d.lat, d.lng),
      properties: detectionRow(d, d.segmentId ? refs.get(d.segmentId) ?? null : null),
    }));
  } else if (dataset === "bump_events") {
    const refs = getLocationRefMap("drive_event");
    columns = EVENT_COLUMNS;
    items = listDriveEvents(f, 100000).map((e) => ({
      id: e.id, geometry: pointGeom(e.lat, e.lng), properties: eventRow(e, resolveRef("drive_event", refs.get(e.id) ?? null, [e])),
    }));
  } else {
    const refs = getLocationRefMap("work_order");
    columns = WORK_ORDER_COLUMNS;
    items = loadWorkOrdersForExport(opts.orgId)
      .filter((w) => f.fromMs == null || w.createdAt >= f.fromMs)
      .map((w) => {
        const pts = w.geomType === "line" ? w.line ?? [] : w.lat != null && w.lng != null ? [{ lat: w.lat, lng: w.lng }] : [];
        return { id: w.id, geometry: workOrderGeom(w), properties: workOrderRow(w, resolveRef("work_order", refs.get(w.id) ?? null, pts)) };
      });
  }
  const stamp = new Date().toISOString().slice(0, 10);
  const filename = `waycrew_${dataset}_${stamp}.${format}`;
  const content = format === "csv"
    ? toCsv(columns, items.map((i) => i.properties))
    : JSON.stringify(featureCollection(`waycrew_${dataset}`, items));
  return { filename, content, count: items.length, mime: format === "csv" ? "text/csv" : "application/json" };
}

export async function shareExport(dataset: ExportDataset, format: ExportFormat, opts: { orgId: string | null; fromMs?: number | null }) {
  const out = buildExport(dataset, format, opts);
  const path = `${RNFS.CachesDirectoryPath}/${out.filename}`;
  await RNFS.writeFile(path, out.content, "utf8");
  await Share.open({ title: out.filename, url: `file://${path}`, type: out.mime, failOnCancel: false });
  return out.count;
}
