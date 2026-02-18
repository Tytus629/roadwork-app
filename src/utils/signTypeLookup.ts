/**
 * ========================================
 * signTypeLookup.ts
 * ========================================
 * 
 * PURPOSE:
 * - Fast lookup utilities for sign type metadata by ID
 * - Converts technical sign IDs (e.g., "stop") to human-friendly labels (e.g., "STOP")
 * - Provides category and MUTCD code lookups
 * 
 * WHY THIS MODULE?
 * - Performance: Pre-builds lookup map once (O(1) lookups instead of O(n) array searches)
 * - DRY: Centralizes sign type display logic (don't duplicate .find() everywhere)
 * - Type Safety: Returns null for invalid IDs instead of throwing errors
 * 
 * USAGE:
 * - getSignTypeById("stop") => { id: "stop", label: "STOP", category: "Regulatory" }
 * - getSignLabelById("stop") => "STOP"
 * - getSignCategoryById("stop") => "Regulatory"
 * 
 * DATA SOURCE:
 * - SIGN_TYPES array from constants/signTypes.ts (MUTCD-based sign catalog)
 * 
 * INTEGRATION POINTS:
 * - WorkItemSheet: Shows label in "Current: STOP (stop)" format
 * - SignsMapScreen: Shows label in list item titles
 * - SignsDueScreen: Shows label in list item titles
 * - Any screen displaying signTypeId to users
 */

import { SIGN_TYPES } from "../constants/signTypes";

type SignType = {
  id: string;
  label: string;
  category: string;
};

/**
 * Pre-build lookup map for O(1) access.
 * Built once on module load, reused for all lookups.
 */
const byId: Record<string, SignType> = (SIGN_TYPES as any[]).reduce((acc, s) => {
  const id = String(s.id ?? "");
  if (!id) return acc;
  acc[id] = {
    id,
    label: String(s.label ?? id),
    category: String(s.category ?? "Unknown"),
  };
  return acc;
}, {} as Record<string, SignType>);

/**
 * Get full sign type metadata by ID.
 * @param id - Sign type ID (e.g., "stop", "yield")
 * @returns SignType object or null if not found
 */
export function getSignTypeById(id: string | null | undefined): SignType | null {
  if (!id) return null;
  return byId[id] ?? null;
}

/**
 * Get human-friendly label for a sign type.
 * @param id - Sign type ID
 * @returns Label (e.g., "STOP") or null if not found
 */
export function getSignLabelById(id: string | null | undefined): string | null {
  const st = getSignTypeById(id);
  return st ? st.label : null;
}

/**
 * Get category for a sign type.
 * @param id - Sign type ID
 * @returns Category (e.g., "Regulatory") or null if not found
 */
export function getSignCategoryById(id: string | null | undefined): string | null {
  const st = getSignTypeById(id);
  return st ? st.category : null;
}
