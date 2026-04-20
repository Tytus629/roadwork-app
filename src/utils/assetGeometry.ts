import {
  getBridgeAssetCorners,
  getCulvertAssetEndpoints,
  isValidMapCoord,
  normalizeMapCoordPair,
} from "./workOrderGeo";

export type AssetSeedSource = "point" | "line-center" | "bbox-center" | "corners-center";
export type AssetSeedFailureReason =
  | "missing_geometry"
  | "invalid_point"
  | "invalid_line"
  | "invalid_bounds";

export type AssetGeometryPresence = {
  hasPoint: boolean;
  hasLine: boolean;
  hasBbox: boolean;
  hasCorners: boolean;
};

type SeedOk = {
  ok: true;
  lat: number;
  lng: number;
  source: AssetSeedSource;
  linePoints?: Array<{ lat: number; lng: number }>;
  presence: AssetGeometryPresence;
};

type SeedFail = {
  ok: false;
  reason: AssetSeedFailureReason;
  presence: AssetGeometryPresence;
};

export type AssetSeedResult = SeedOk | SeedFail;

function isNonZeroCoord(point: { lat: number; lng: number } | null | undefined): point is { lat: number; lng: number } {
  if (!point || !isValidMapCoord(point)) return false;
  return !(point.lat === 0 && point.lng === 0);
}

function toPoint(raw: any): { lat: number; lng: number } | null {
  if (Array.isArray(raw) && raw.length >= 2) {
    const geo = normalizeMapCoordPair(raw[1], raw[0]);
    if (isNonZeroCoord(geo)) return geo;
    const legacy = normalizeMapCoordPair(raw[0], raw[1]);
    return isNonZeroCoord(legacy) ? legacy : null;
  }

  if (!raw || typeof raw !== "object") return null;
  const parsed = normalizeMapCoordPair(
    raw.lat ?? raw.latitude ?? raw.centerLat ?? raw.center_lat ?? raw.y,
    raw.lng ?? raw.lon ?? raw.longitude ?? raw.centerLng ?? raw.center_lng ?? raw.x,
  );
  return isNonZeroCoord(parsed) ? parsed : null;
}

function dedupePoints(points: Array<{ lat: number; lng: number }>): Array<{ lat: number; lng: number }> {
  const seen = new Set<string>();
  const out: Array<{ lat: number; lng: number }> = [];
  for (const point of points) {
    const key = `${point.lat.toFixed(7)}:${point.lng.toFixed(7)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(point);
  }
  return out;
}

function centerFromBounds(points: Array<{ lat: number; lng: number }>): { lat: number; lng: number } | null {
  if (!Array.isArray(points) || points.length === 0) return null;
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const center = normalizeMapCoordPair(
    (Math.min(...lats) + Math.max(...lats)) / 2,
    (Math.min(...lngs) + Math.max(...lngs)) / 2,
  );
  return isNonZeroCoord(center) ? center : null;
}

function parseLinePoints(raw: any): Array<{ lat: number; lng: number }> {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return dedupePoints(raw.map((item) => toPoint(item)).filter((point): point is { lat: number; lng: number } => !!point));
  }

  if (typeof raw !== "object") return [];

  if (raw.type === "Feature" && raw.geometry) {
    return parseLinePoints(raw.geometry);
  }

  if (raw.type === "LineString") {
    return parseLinePoints(raw.coordinates);
  }

  if (raw.type === "MultiLineString" && Array.isArray(raw.coordinates)) {
    const all: Array<{ lat: number; lng: number }> = [];
    for (const line of raw.coordinates) {
      all.push(...parseLinePoints(line));
    }
    return dedupePoints(all);
  }

  if (Array.isArray(raw.points)) return parseLinePoints(raw.points);
  if (Array.isArray(raw.line)) return parseLinePoints(raw.line);
  if (Array.isArray(raw.coordinates)) return parseLinePoints(raw.coordinates);

  return [];
}

function parseCornerLikePoints(raw: any): Array<{ lat: number; lng: number }> {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return parseLinePoints(raw);
  }

  if (typeof raw !== "object") return [];

  if (raw.type === "Feature" && raw.geometry) return parseCornerLikePoints(raw.geometry);

  if (raw.type === "Polygon" && Array.isArray(raw.coordinates)) {
    const outerRing = Array.isArray(raw.coordinates[0]) ? raw.coordinates[0] : [];
    return parseLinePoints(outerRing);
  }

  if (raw.type === "MultiPolygon" && Array.isArray(raw.coordinates)) {
    const all: Array<{ lat: number; lng: number }> = [];
    for (const polygon of raw.coordinates) {
      const outerRing = Array.isArray(polygon?.[0]) ? polygon[0] : [];
      all.push(...parseLinePoints(outerRing));
    }
    return dedupePoints(all);
  }

  if (Array.isArray(raw.corners)) {
    return parseLinePoints(raw.corners);
  }

  if (Array.isArray(raw.bridgeCorners)) {
    return parseLinePoints(raw.bridgeCorners);
  }

  if (Array.isArray(raw.vertices)) {
    return parseLinePoints(raw.vertices);
  }

  return [];
}

function extractBboxCenter(raw: any): { lat: number; lng: number } | null {
  if (!raw || typeof raw !== "object") return null;
  const minLat = Number(raw.minLat ?? raw.min_lat ?? raw.south ?? raw.yMin);
  const maxLat = Number(raw.maxLat ?? raw.max_lat ?? raw.north ?? raw.yMax);
  const minLng = Number(raw.minLng ?? raw.min_lng ?? raw.west ?? raw.xMin);
  const maxLng = Number(raw.maxLng ?? raw.max_lng ?? raw.east ?? raw.xMax);
  if (![minLat, maxLat, minLng, maxLng].every(Number.isFinite)) return null;
  const center = normalizeMapCoordPair((minLat + maxLat) / 2, (minLng + maxLng) / 2);
  return isNonZeroCoord(center) ? center : null;
}

function buildPresence(args: {
  point: { lat: number; lng: number } | null;
  linePoints: Array<{ lat: number; lng: number }>;
  bboxCenter: { lat: number; lng: number } | null;
  cornerPoints: Array<{ lat: number; lng: number }>;
}): AssetGeometryPresence {
  return {
    hasPoint: !!args.point,
    hasLine: args.linePoints.length >= 2,
    hasBbox: !!args.bboxCenter,
    hasCorners: args.cornerPoints.length >= 3,
  };
}

export function deriveAssetWorkOrderSeedLocation(asset: any): AssetSeedResult {
  const directPoint =
    toPoint({ lat: asset?.lat, lng: asset?.lng }) ??
    toPoint({ lat: asset?.latitude, lng: asset?.longitude }) ??
    toPoint(asset?.location);

  const culvertEndpoints = getCulvertAssetEndpoints(asset);
  const culvertLine = culvertEndpoints
    ? dedupePoints([culvertEndpoints.inlet, culvertEndpoints.outlet].filter((point): point is { lat: number; lng: number } => isNonZeroCoord(point)))
    : [];

  const linePoints = dedupePoints([
    ...culvertLine,
    ...parseLinePoints(asset?.line),
    ...parseLinePoints(asset?.points),
    ...parseLinePoints(asset?.details?.line),
    ...parseLinePoints(asset?.details?.culvert?.line),
    ...parseLinePoints(asset?.details?.geometry),
    ...parseLinePoints(asset?.geometry),
  ]);

  const bridgeCorners = getBridgeAssetCorners(asset) ?? [];
  const cornerPoints = dedupePoints([
    ...bridgeCorners,
    ...parseCornerLikePoints(asset?.details?.corners),
    ...parseCornerLikePoints(asset?.details?.bridge),
    ...parseCornerLikePoints(asset?.details?.bridgeGeometry),
    ...parseCornerLikePoints(asset?.details?.geometry),
    ...parseCornerLikePoints(asset?.geometry),
  ]);

  const bboxCenter =
    extractBboxCenter(asset?.bbox) ??
    extractBboxCenter(asset?.details?.bbox) ??
    extractBboxCenter(asset?.details?.geometry?.bbox) ??
    extractBboxCenter(asset?.details?.culvert?.bbox) ??
    extractBboxCenter(asset?.details?.bridge?.bbox);

  const presence = buildPresence({ point: directPoint, linePoints, bboxCenter, cornerPoints });

  if (directPoint) {
    return { ok: true, lat: directPoint.lat, lng: directPoint.lng, source: "point", linePoints: linePoints.length >= 2 ? linePoints : undefined, presence };
  }

  if (linePoints.length >= 2) {
    const center = centerFromBounds(linePoints);
    if (center) {
      return {
        ok: true,
        lat: center.lat,
        lng: center.lng,
        source: "line-center",
        linePoints,
        presence,
      };
    }
    return { ok: false, reason: "invalid_line", presence };
  }

  if (cornerPoints.length >= 3) {
    const center = centerFromBounds(cornerPoints);
    if (center) {
      return {
        ok: true,
        lat: center.lat,
        lng: center.lng,
        source: "corners-center",
        presence,
      };
    }
    return { ok: false, reason: "invalid_bounds", presence };
  }

  if (bboxCenter) {
    return {
      ok: true,
      lat: bboxCenter.lat,
      lng: bboxCenter.lng,
      source: "bbox-center",
      presence,
    };
  }

  return {
    ok: false,
    reason:
      !presence.hasPoint && !presence.hasLine && !presence.hasBbox && !presence.hasCorners
        ? "missing_geometry"
        : "invalid_point",
    presence,
  };
}

export function deriveCreateFromAssetPayloadSeedLocation(payload: {
  latitude: number;
  longitude: number;
  linePoints?: Array<{ lat: number; lng: number }>;
}): AssetSeedResult {
  const point = normalizeMapCoordPair(payload.latitude, payload.longitude);
  const directPoint = isNonZeroCoord(point) ? point : null;
  const linePoints = dedupePoints(
    (Array.isArray(payload.linePoints) ? payload.linePoints : [])
      .map((linePoint) => normalizeMapCoordPair(linePoint?.lat, linePoint?.lng))
      .filter((linePoint): linePoint is { lat: number; lng: number } => isNonZeroCoord(linePoint)),
  );
  const presence = buildPresence({ point: directPoint, linePoints, bboxCenter: null, cornerPoints: [] });

  if (directPoint) {
    return {
      ok: true,
      lat: directPoint.lat,
      lng: directPoint.lng,
      source: "point",
      linePoints: linePoints.length >= 2 ? linePoints : undefined,
      presence,
    };
  }

  if (linePoints.length >= 2) {
    const center = centerFromBounds(linePoints);
    if (center) {
      return {
        ok: true,
        lat: center.lat,
        lng: center.lng,
        source: "line-center",
        linePoints,
        presence,
      };
    }
    return { ok: false, reason: "invalid_line", presence };
  }

  return {
    ok: false,
    reason: !presence.hasPoint && !presence.hasLine ? "missing_geometry" : "invalid_point",
    presence,
  };
}
