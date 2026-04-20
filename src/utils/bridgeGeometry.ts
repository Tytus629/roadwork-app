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
