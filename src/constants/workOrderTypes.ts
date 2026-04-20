/**
 * Single source of truth for work order types
 * Used across filters, create flows, and type displays
 */

import type { WorkType } from "../types/workItem";

export const WORK_ORDER_TYPE_OPTIONS: { key: WorkType; label: string }[] = [
  { key: "pavement_repair", label: "Pavement Repair" },
  { key: "sign", label: "Sign" },
  { key: "spraying", label: "Spraying" },
  { key: "brushing", label: "Brushing" },
  { key: "culvert", label: "Culvert" },
  { key: "guardrail", label: "Guardrail" },
  { key: "ditching", label: "Ditching" },
];

export const WORK_ORDER_TYPE_COLORS: Record<
  "pavement_repair" | "sign" | "spraying" | "brushing" | "culvert" | "guardrail" | "ditching",
  string
> = {
  pavement_repair: "#dc2626",
  sign: "#2563eb",
  spraying: "#7c3aed",
  brushing: "#16a34a",
  culvert: "#334155",
  guardrail: "#d97706",
  ditching: "#0f766e",
};

export const WORK_ORDER_TYPE_COLORS_COLORBLIND: Record<
  "pavement_repair" | "sign" | "spraying" | "brushing" | "culvert" | "guardrail" | "ditching",
  string
> = {
  pavement_repair: "#D55E00",
  sign: "#0072B2",
  spraying: "#CC79A7",
  brushing: "#009E73",
  culvert: "#4D4D4D",
  guardrail: "#E69F00",
  ditching: "#56B4E9",
};

export type WorkOrderTypeColorPalette = "standard" | "colorblind";

export const WORK_ORDER_TYPE_FALLBACK_COLOR = "#6b7280";

/**
 * Get user-friendly label for a work type
 */
export function normalizeWorkTypeKey(type?: string | null): WorkType | "" {
  const t = (type ?? "").trim();
  if (!t) return "";
  const normalized = t.toLowerCase().replace(/\s+/g, "_");

  // Canonicalize all pavement variants to a single display bucket.
  if (
    normalized === "pavement_repairs" ||
    normalized === "pothole" ||
    normalized === "asphalt_patch" ||
    normalized === "roadway_surface_repair" ||
    normalized === "asphalt"
  ) {
    return "pavement_repair";
  }

  // Legacy type merged into brushing.
  if (normalized === "danger_tree") return "brushing";

  if (normalized === "guard_rail" || normalized === "guard_rails") return "guardrail";

  return normalized as WorkType;
}

export function getWorkOrderTypeColor(
  type?: string | null,
  options?: { palette?: WorkOrderTypeColorPalette; colorblindMode?: boolean },
): string {
  const normalized = normalizeWorkTypeKey(type);
  const paletteMode = options?.palette ?? (options?.colorblindMode ? "colorblind" : "standard");
  const palette = paletteMode === "colorblind" ? WORK_ORDER_TYPE_COLORS_COLORBLIND : WORK_ORDER_TYPE_COLORS;
  if (normalized === "pavement_repair" || normalized === "pothole" || normalized === "asphalt_patch" || normalized === "roadway_surface_repair" || normalized === "asphalt") {
    return palette.pavement_repair;
  }
  if (normalized === "sign") return palette.sign;
  if (normalized === "spraying") return palette.spraying;
  if (normalized === "brushing") return palette.brushing;
  if (normalized === "culvert") return palette.culvert;
  if (normalized === "guardrail") return palette.guardrail;
  if (normalized === "ditching") return palette.ditching;
  return WORK_ORDER_TYPE_FALLBACK_COLOR;
}

export function getWorkTypeColor(type?: string | null, options?: { colorblindMode?: boolean }): string {
  return getWorkOrderTypeColor(type, options);
}

export function formatWorkType(type?: string | null): string {
  const normalized = normalizeWorkTypeKey(type);
  const found = WORK_ORDER_TYPE_OPTIONS.find(opt => opt.key === normalized);
  if (found) return found.label;

  const fallback = (type ?? "").trim();
  return fallback.length ? fallback : "Unknown";
}
