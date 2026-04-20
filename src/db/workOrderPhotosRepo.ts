import { db } from "./db";
import { uid } from "../utils/uid";

export type WorkOrderPhotoRow = {
  id: string;
  workOrderId: string;
  uri: string;
  createdAt: number;
  lat?: number | null;
  lng?: number | null;
};

function readRows(r: any): any[] {
  const rows = r?.rows;
  if (Array.isArray(rows)) return rows;

  if (rows && typeof rows.item === "function") {
    const out: any[] = [];
    const len = typeof rows.length === "number" ? rows.length : 0;
    for (let i = 0; i < len; i++) out.push(rows.item(i));
    return out;
  }

  return rows ? Array.from(rows) : [];
}

export function listWorkOrderPhotos(workOrderId: string): WorkOrderPhotoRow[] {
  const r = db.executeSync(
    `
    SELECT id, workOrderId, uri, createdAt, lat, lng
    FROM photos
    WHERE workOrderId = ?
    ORDER BY createdAt DESC;
    `,
    [workOrderId],
  );

  return readRows(r).map((x) => ({
    id: String(x.id),
    workOrderId: String(x.workOrderId),
    uri: String(x.uri),
    createdAt: Number(x.createdAt),
    lat: x.lat ?? null,
    lng: x.lng ?? null,
  }));
}

export function addWorkOrderPhoto(args: {
  id?: string;
  workOrderId: string;
  uri: string;
  createdAt?: number;
  lat?: number | null;
  lng?: number | null;
}): string {
  const id = args.id ?? uid();
  const createdAt = args.createdAt ?? Date.now();

  db.executeSync(
    `
    INSERT OR REPLACE INTO photos (id, workOrderId, uri, createdAt, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?);
    `,
    [id, args.workOrderId, args.uri, createdAt, args.lat ?? null, args.lng ?? null],
  );

  return id;
}

export function removeWorkOrderPhoto(photoId: string) {
  db.executeSync(`DELETE FROM photos WHERE id = ?;`, [photoId]);
}
