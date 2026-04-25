export type BridgeCorner = {
  order: 1 | 2 | 3 | 4;
  lat: number;
  lng: number;
};

export type GeoBounds = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type BridgeFootprintMetrics = {
  bounds: GeoBounds | null;
  perimeterMeters: number | null;
  lengthMeters: number | null;
  widthMeters: number | null;
};

function toFinite(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isValidLat(lat: number): boolean {
  return lat >= -90 && lat <= 90;
}

function isValidLng(lng: number): boolean {
  return lng >= -180 && lng <= 180;
}

export function deriveBoundsFromPoints(
  points: Array<{ lat: number; lng: number }> | null | undefined,
): GeoBounds | null {
  if (!Array.isArray(points) || points.length === 0) return null;

  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const bounds = {
    minLat: Math.min(...lats),
    minLng: Math.min(...lngs),
    maxLat: Math.max(...lats),
    maxLng: Math.max(...lngs),
  };

  if (!Number.isFinite(bounds.minLat) || !Number.isFinite(bounds.minLng) || !Number.isFinite(bounds.maxLat) || !Number.isFinite(bounds.maxLng)) {
    return null;
  }

  return bounds;
}

export function deriveCenterFromBounds(bounds: GeoBounds | null | undefined): { lat: number; lng: number } | null {
  if (!bounds) return null;
  const lat = (bounds.minLat + bounds.maxLat) / 2;
  const lng = (bounds.minLng + bounds.maxLng) / 2;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export function normalizeBridgeCorners(
  rawCorners: Array<{ lat: unknown; lng: unknown }> | null | undefined,
): BridgeCorner[] | null {
  if (!Array.isArray(rawCorners) || rawCorners.length !== 4) return null;

  const corners: BridgeCorner[] = [];
  for (let i = 0; i < rawCorners.length; i += 1) {
    const c = rawCorners[i];
    const lat = toFinite(c?.lat);
    const lng = toFinite(c?.lng);
    if (lat == null || lng == null) return null;
    if (!isValidLat(lat) || !isValidLng(lng)) return null;
    corners.push({ order: (i + 1) as 1 | 2 | 3 | 4, lat, lng });
  }

  return corners;
}

export function isValidBridgeCornerSet(
  rawCorners: Array<{ lat: unknown; lng: unknown }> | null | undefined,
): boolean {
  return normalizeBridgeCorners(rawCorners) != null;
}

export function deriveBridgeCenter(corners: BridgeCorner[]): { lat: number; lng: number } {
  const bounds = deriveBoundsFromPoints(corners);
  const center = deriveCenterFromBounds(bounds);
  if (!center) {
    throw new Error("Invalid bridge corners; cannot derive center");
  }
  return center;
}

export function buildBridgeRing(
  corners: Array<{ lat: number; lng: number }> | null | undefined,
): Array<{ lat: number; lng: number }> {
  if (!Array.isArray(corners) || corners.length < 3) return [];
  const normalized = corners
    .map((corner) => {
      const lat = toFinite(corner?.lat);
      const lng = toFinite(corner?.lng);
      if (lat == null || lng == null) return null;
      if (!isValidLat(lat) || !isValidLng(lng)) return null;
      return { lat, lng };
    })
    .filter((corner): corner is { lat: number; lng: number } => !!corner);

  if (normalized.length < 3) return [];
  const first = normalized[0];
  const last = normalized[normalized.length - 1];
  if (first && last && first.lat === last.lat && first.lng === last.lng) {
    return normalized;
  }
  return [...normalized, first];
}

function distanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const aa =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

export function deriveBridgeFootprintMetrics(
  corners: BridgeCorner[] | null | undefined,
): BridgeFootprintMetrics {
  if (!Array.isArray(corners) || corners.length !== 4) {
    return {
      bounds: null,
      perimeterMeters: null,
      lengthMeters: null,
      widthMeters: null,
    };
  }

  const bounds = deriveBoundsFromPoints(corners);
  const edges = [
    distanceMeters(corners[0], corners[1]),
    distanceMeters(corners[1], corners[2]),
    distanceMeters(corners[2], corners[3]),
    distanceMeters(corners[3], corners[0]),
  ].filter(Number.isFinite);

  if (edges.length !== 4) {
    return {
      bounds,
      perimeterMeters: null,
      lengthMeters: null,
      widthMeters: null,
    };
  }

  const pairA = (edges[0] + edges[2]) / 2;
  const pairB = (edges[1] + edges[3]) / 2;
  const lengthMeters = Math.max(pairA, pairB);
  const widthMeters = Math.min(pairA, pairB);
  const perimeterMeters = edges.reduce((sum, value) => sum + value, 0);

  return {
    bounds,
    perimeterMeters,
    lengthMeters,
    widthMeters,
  };
}
