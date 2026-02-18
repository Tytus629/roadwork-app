/**
 * workOrderGeo.ts
 *
 * Canonical helper for extracting center coordinates from work orders.
 * Used by WorkItemSheet and MapScreen to ensure consistent coordinate extraction.
 */

function toNum(v: any): number | null {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
}

/**
 * Extract center coordinates from a work order object.
 * Handles multiple naming conventions and bbox fallback.
 */
export function getWorkOrderCenter(wo: any): { lat: number; lng: number } | null {
  // direct point fields (support multiple naming styles)
  const lat =
    toNum(wo?.lat) ??
    toNum(wo?.latitude) ??
    toNum(wo?.centerLat) ??
    toNum(wo?.center_lat) ??
    null;

  const lng =
    toNum(wo?.lng) ??
    toNum(wo?.longitude) ??
    toNum(wo?.centerLng) ??
    toNum(wo?.center_lng) ??
    null;

  if (lat != null && lng != null) return { lat, lng };

  // Draft work orders use point/points
  if (wo?.point) {
    const pLat = toNum(wo.point.lat);
    const pLng = toNum(wo.point.lng);
    if (pLat != null && pLng != null) return { lat: pLat, lng: pLng };
  }
  if (wo?.points && wo.points.length > 0) {
    const lats = wo.points.map((p: any) => toNum(p.lat)).filter((x: any) => x != null) as number[];
    const lngs = wo.points.map((p: any) => toNum(p.lng)).filter((x: any) => x != null) as number[];
    if (lats.length > 0 && lngs.length > 0) {
      return {
        lat: (Math.min(...lats) + Math.max(...lats)) / 2,
        lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
      };
    }
  }

  // bbox fields (camel + snake)
  const minLat = toNum(wo?.minLat) ?? toNum(wo?.min_lat);
  const maxLat = toNum(wo?.maxLat) ?? toNum(wo?.max_lat);
  const minLng = toNum(wo?.minLng) ?? toNum(wo?.min_lng);
  const maxLng = toNum(wo?.maxLng) ?? toNum(wo?.max_lng);

  if (minLat != null && maxLat != null && minLng != null && maxLng != null) {
    return { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2 };
  }

  // Line JSON fallback
  if (wo?.lineJson) {
    try {
      const coords: { lat: number; lng: number }[] = JSON.parse(wo.lineJson);
      if (coords.length > 0) {
        const lats = coords.map((p) => toNum(p.lat)).filter((x) => x != null) as number[];
        const lngs = coords.map((p) => toNum(p.lng)).filter((x) => x != null) as number[];
        if (lats.length > 0 && lngs.length > 0) {
          return {
            lat: (Math.min(...lats) + Math.max(...lats)) / 2,
            lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
          };
        }
      }
    } catch {
      // Invalid JSON, fall through
    }
  }

  return null;
}
