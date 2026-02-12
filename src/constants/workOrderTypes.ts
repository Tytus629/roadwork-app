/**
 * Single source of truth for work order types
 * Used across filters, create flows, and type displays
 */

import type { WorkType } from "../types/workItem";

export const WORK_ORDER_TYPE_OPTIONS: { key: WorkType; label: string }[] = [
  { key: "pothole", label: "Pothole" },
  { key: "sign", label: "Sign" },
  { key: "spraying", label: "Spraying" },
  { key: "brushing", label: "Brushing" },
  { key: "culvert", label: "Culvert" },
  { key: "guardrail", label: "Guardrail" },
  { key: "danger_tree", label: "Danger Tree" },
  { key: "ditching", label: "Ditching" },
  { key: "asphalt", label: "Asphalt" },
];

/**
 * Get user-friendly label for a work type
 */
export function formatWorkType(type: WorkType): string {
  const found = WORK_ORDER_TYPE_OPTIONS.find(opt => opt.key === type);
  return found?.label ?? type;
}
