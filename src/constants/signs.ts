/**
 * Sign Asset Configuration Constants
 */

/**
 * Maximum distance (in meters) to consider two signs as duplicates
 * when auto-linking work orders to existing sign assets.
 * 
 * Default: 25 meters (~82 feet)
 * 
 * This prevents creating duplicate sign assets when crews complete
 * multiple work orders for the same physical sign.
 */
export const SIGN_DEDUPE_RADIUS_METERS = 25;
