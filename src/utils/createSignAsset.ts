import type { SignAsset, SignType } from "../types/Sign";
import { uid } from "./uid";

/**
 * Factory function to create a new SignAsset with sensible defaults.
 * 
 * @param signType - Type of sign (stop, yield, warning, etc.)
 * @param lat - Latitude coordinate
 * @param lng - Longitude coordinate
 * @param options - Optional fields to override defaults
 * @returns A new SignAsset ready to be persisted
 */
export function createSignAsset(
  signType: SignType,
  lat: number,
  lng: number,
  options?: {
    mutcdCode?: string;
    message?: string;
    bearingDeg?: number;
    installedAt?: number;
    sheetingType?: string;
    colorGroup?: string;
  }
): Omit<SignAsset, "id" | "createdAt" | "updatedAt" | "needsSync"> {
  const now = Date.now();
  const defaultNextDueAt = now + 180 * 24 * 60 * 60 * 1000; // 180 days from now

  return {
    signType,
    lat,
    lng,
    mutcdCode: options?.mutcdCode || null,
    message: options?.message || null,
    bearingDeg: options?.bearingDeg || null,
    installedAt: options?.installedAt || null,
    sheetingType: options?.sheetingType || null,
    colorGroup: options?.colorGroup as any || null,
    lastInspectionAt: null,
    lastResult: null,
    nextDueAt: defaultNextDueAt, // Schedule first inspection in 180 days
  };
}
