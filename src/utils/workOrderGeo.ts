/**
 * Canonical map-coordinate helpers for work orders and assets.
 *
 * These helpers intentionally accept multiple coordinate shapes because
 * legacy rows and payloads can carry either object-style {lat,lng} or
 * GeoJSON-style [lng,lat] coordinates.
 */

export type MapCoord = { lat: number; lng: number };

function toNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function isValidLat(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

function isValidLng(lng: number): boolean {
  return lng >= -180 && lng <= 180;
}

export function isValidMapCoord(value: MapCoord | null | undefined): value is MapCoord {
  if (!value) return false;
  return isValidLat(value.lat) && isValidLng(value.lng);
}

/**
 * Normalize a lat/lng pair, including range-based swap recovery.
 */
export function normalizeMapCoordPair(
  latRaw: unknown,
  lngRaw: unknown,
): MapCoord | null {
  const lat = toNum(latRaw);
  const lng = toNum(lngRaw);
  if (lat == null || lng == null) return null;

  if (isValidLat(lat) && isValidLng(lng)) {
    return { lat, lng };
  }

  // Recover swapped pairs such as { lat: -120.5, lng: 46.9 }.
  if (isValidLat(lng) && isValidLng(lat)) {
    return { lat: lng, lng: lat };
  }

  return null;
}

function midpoint(points: MapCoord[]): MapCoord | null {
  if (!points.length) return null;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  return {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
}

function pointFromObject(raw: any): MapCoord | null {
  if (!raw || typeof raw !== "object") return null;

  const direct = normalizeMapCoordPair(
    raw.lat ?? raw.latitude ?? raw.centerLat ?? raw.center_lat ?? raw.y,
    raw.lng ?? raw.lon ?? raw.longitude ?? raw.centerLng ?? raw.center_lng ?? raw.x,
  );
  if (direct) return direct;

  if (Array.isArray(raw.coordinates)) {
    return pointFromTuple(raw.coordinates);
  }

  return null;
}

function pointFromTuple(tuple: any): MapCoord | null {
  if (!Array.isArray(tuple) || tuple.length < 2) return null;

  // GeoJSON canonical tuple is [lng, lat].
  const geoJsonOrder = normalizeMapCoordPair(tuple[1], tuple[0]);
  if (geoJsonOrder) return geoJsonOrder;

  // Backward-compatible fallback if a source stored [lat, lng].
  return normalizeMapCoordPair(tuple[0], tuple[1]);
}

function normalizePoint(raw: any): MapCoord | null {
  if (Array.isArray(raw)) return pointFromTuple(raw);
  return pointFromObject(raw);
}

function parseJson(value: unknown): any {
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function unwrapLineGeometry(raw: any): any[] | null {
  if (!raw) return null;

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw !== "object") return null;

  if (raw.type === "Feature" && raw.geometry) {
    return unwrapLineGeometry(raw.geometry);
  }

  if (raw.type === "LineString" && Array.isArray(raw.coordinates)) {
    return raw.coordinates;
  }

  if (raw.type === "MultiLineString" && Array.isArray(raw.coordinates)) {
    const first = raw.coordinates.find((line: any) => Array.isArray(line) && line.length > 0);
    return Array.isArray(first) ? first : null;
  }

  if (Array.isArray(raw.coordinates)) {
    return raw.coordinates;
  }

  return null;
}

function toPointList(raw: any): MapCoord[] {
  const line = unwrapLineGeometry(raw);
  if (!line || !line.length) return [];

  const out: MapCoord[] = [];
  for (const item of line) {
    const p = normalizePoint(item);
    if (p) out.push(p);
  }
  return out;
}

function extractCulvertDetailsEndpoints(details: any): { inlet: MapCoord; outlet: MapCoord } | null {
  if (!details || typeof details !== "object") return null;

  const culvert =
    details.culvert && typeof details.culvert === "object"
      ? details.culvert
      : details;

  const inlet = normalizePoint(culvert?.inlet);
  const outlet = normalizePoint(culvert?.outlet);
  if (inlet && outlet) return { inlet, outlet };

  const line = toPointList(culvert?.line);
  if (line.length >= 2) return { inlet: line[0], outlet: line[1] };

  return null;
}

function extractBridgeCorners(details: any): Array<MapCoord> | null {
  if (!details || typeof details !== "object") return null;

  const bridge =
    details.bridge && typeof details.bridge === "object"
      ? details.bridge
      : details;

  const rawCorners = Array.isArray(bridge?.corners) ? bridge.corners : null;
  if (!rawCorners || rawCorners.length !== 4) return null;

  const parsed = rawCorners
    .map((corner: any) =>
      normalizeMapCoordPair(
        corner?.lat ?? corner?.latitude,
        corner?.lng ?? corner?.lon ?? corner?.longitude,
      ),
    )
    .filter((p: MapCoord | null): p is MapCoord => !!p);

  if (parsed.length !== 4) return null;
  return parsed;
}

export function getWorkOrderLinePoints(wo: any): MapCoord[] {
  const fromLine = toPointList(wo?.line);
  if (fromLine.length) return fromLine;

  const fromPoints = toPointList(wo?.points);
  if (fromPoints.length) return fromPoints;

  const fromLineJson = toPointList(parseJson(wo?.lineJson));
  if (fromLineJson.length) return fromLineJson;

  const fromGeo = toPointList(wo?.geo ?? wo?.geometry);
  if (fromGeo.length) return fromGeo;

  return [];
}

/**
 * Extract center coordinates from a work order object.
 */
export function getWorkOrderCenter(wo: any): MapCoord | null {
  const direct = normalizeMapCoordPair(
    wo?.lat ?? wo?.latitude ?? wo?.centerLat ?? wo?.center_lat,
    wo?.lng ?? wo?.longitude ?? wo?.centerLng ?? wo?.center_lng,
  );
  if (direct) return direct;

  const point = normalizePoint(wo?.point ?? wo?.geo);
  if (point) return point;

  const lineCenter = midpoint(getWorkOrderLinePoints(wo));
  if (lineCenter) return lineCenter;

  const minLat = toNum(wo?.minLat ?? wo?.min_lat);
  const maxLat = toNum(wo?.maxLat ?? wo?.max_lat);
  const minLng = toNum(wo?.minLng ?? wo?.min_lng);
  const maxLng = toNum(wo?.maxLng ?? wo?.max_lng);
  if (minLat != null && maxLat != null && minLng != null && maxLng != null) {
    const bboxCenter = normalizeMapCoordPair(
      (minLat + maxLat) / 2,
      (minLng + maxLng) / 2,
    );
    if (bboxCenter) return bboxCenter;
  }

  const culvertEndpoints = extractCulvertDetailsEndpoints(wo?.details);
  if (culvertEndpoints) {
    return midpoint([culvertEndpoints.inlet, culvertEndpoints.outlet]);
  }

  return null;
}

export function getCulvertAssetEndpoints(asset: any): { inlet: MapCoord; outlet: MapCoord } | null {
  if (String(asset?.assetType ?? "").toUpperCase() !== "CULVERT") return null;
  return extractCulvertDetailsEndpoints(asset?.details);
}

export function getBridgeAssetCorners(asset: any): Array<MapCoord> | null {
  if (String(asset?.assetType ?? "").toUpperCase() !== "BRIDGE") return null;
  return extractBridgeCorners(asset?.details);
}

export function getAssetCenter(asset: any): MapCoord | null {
  const direct = normalizeMapCoordPair(
    asset?.lat ?? asset?.latitude,
    asset?.lng ?? asset?.lon ?? asset?.longitude,
  );
  if (direct) return direct;

  const culvertEndpoints = getCulvertAssetEndpoints(asset);
  if (culvertEndpoints) {
    return midpoint([culvertEndpoints.inlet, culvertEndpoints.outlet]);
  }

  const bridgeCorners = getBridgeAssetCorners(asset);
  if (bridgeCorners && bridgeCorners.length === 4) {
    return midpoint(bridgeCorners);
  }

  return null;
}
