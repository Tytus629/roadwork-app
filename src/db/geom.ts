import { BBox, LatLng } from "./types";

export function bboxForPoint(p: LatLng): BBox {
  return { minLat: p.lat, minLng: p.lng, maxLat: p.lat, maxLng: p.lng };
}

export function bboxForLine(points: LatLng[]): BBox {
  let minLat = Number.POSITIVE_INFINITY;
  let minLng = Number.POSITIVE_INFINITY;
  let maxLat = Number.NEGATIVE_INFINITY;
  let maxLng = Number.NEGATIVE_INFINITY;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  if (!isFinite(minLat) || !isFinite(minLng) || !isFinite(maxLat) || !isFinite(maxLng)) {
    // fallback so we never write invalid bbox
    return { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 };
  }

  return { minLat, minLng, maxLat, maxLng };
}

// Expand bbox a tiny bit so pins don't pop in/out at edges
export function padBBox(b: BBox, padDegrees = 0.002): BBox {
  return {
    minLat: b.minLat - padDegrees,
    minLng: b.minLng - padDegrees,
    maxLat: b.maxLat + padDegrees,
    maxLng: b.maxLng + padDegrees,
  };
}
