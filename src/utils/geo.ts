/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GEO UTILITIES - Distance & Unit Conversion
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Re-exports haversine distance functions and adds mile conversion utilities.
 * Used for radius filtering of sign assets and other geographic features.
 */

export { haversineMeters, metersToFeet, metersToMiles } from "../tools/measure/haversine";

/**
 * Convert miles to meters for distance calculations
 */
export function milesToMeters(mi: number): number {
  return mi * 1609.344;
}
