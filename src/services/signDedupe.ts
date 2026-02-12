/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGN ASSET DEDUPLICATION SERVICE
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Prevents duplicate sign assets by finding existing signs nearby when
 * completing work orders.
 * 
 * Matching Rules:
 * - Distance <= 25 meters (configurable)
 * - Same sign code OR same sign name (case-insensitive)
 * - Only considers active signs
 * - Returns closest match if multiple found
 */

import { haversineMeters } from "../utils/geo";
import { SIGN_DEDUPE_RADIUS_METERS } from "../constants/signs";
import type { SignAsset } from "../types/Sign";
import type { SignDetails } from "../types/workItem";

/**
 * Normalize string for comparison (lowercase, trimmed)
 */
function norm(s: string | null | undefined): string {
  return (s ?? "").trim().toLowerCase();
}

/**
 * Find an existing sign asset that matches the given criteria
 * 
 * @param assets - Array of all sign assets to search
 * @param loc - Location to search near
 * @param details - Sign details to match
 * @param radiusM - Search radius in meters (default: 25)
 * @returns Closest matching sign asset or null if none found
 */
export function findNearbyMatchingSignAsset(
  assets: SignAsset[],
  loc: { lat: number; lng: number },
  details: SignDetails | null | undefined,
  radiusM: number = SIGN_DEDUPE_RADIUS_METERS
): SignAsset | null {
  if (!details) return null;

  const wantCode = norm(details.code);
  const wantName = norm(details.name);

  // No identifiable info to match on
  if (!wantCode && !wantName) return null;

  let best: { asset: SignAsset; distance: number } | null = null;

  for (const asset of assets) {
    // Only match active signs
    if (!asset) continue;

    // Calculate distance
    const distance = haversineMeters(loc, { lat: asset.lat, lng: asset.lng });
    
    // Too far away
    if (distance > radiusM) continue;

    // Check if sign type matches
    const assetCode = norm(asset.mutcdCode);
    const assetName = norm(asset.message);

    const sameType =
      (wantCode && assetCode && wantCode === assetCode) ||
      (wantName && assetName && wantName === assetName);

    if (!sameType) continue;

    // Keep closest match
    if (!best || distance < best.distance) {
      best = { asset, distance };
    }
  }

  return best?.asset ?? null;
}
