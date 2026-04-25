/**
 * Single source of truth for work order types
 * Used across filters, create flows, and type displays
 */

import type { WorkType } from "../types/workItem";

type CanonicalWorkOrderType =
  | "pavement_repair"
  | "sign"
  | "spraying"
  | "brushing"
  | "culvert"
  | "guardrail"
  | "ditching";

export const WORK_ORDER_TYPE_OPTIONS: { key: WorkType; label: string }[] = [
  { key: "pavement_repair", label: "Pavement Repair" },
  { key: "sign", label: "Sign" },
  { key: "spraying", label: "Spraying" },
  { key: "brushing", label: "Brushing" },
  { key: "culvert", label: "Culvert" },
  { key: "guardrail", label: "Guardrail" },
  { key: "ditching", label: "Ditching" },
];

const WORK_ORDER_TYPE_META: Record<
  CanonicalWorkOrderType,
  {
    label: string;
    shortLabel: string;
    standardColor: string;
    colorblindColor: string;
    lineDashPattern?: number[];
  }
> = {
  pavement_repair: {
    label: "Pavement Repair",
    shortLabel: "PAVE",
    standardColor: "#dc2626",
    colorblindColor: "#D55E00",
  },
  sign: {
    label: "Sign",
    shortLabel: "SIGN",
    standardColor: "#2563eb",
    colorblindColor: "#0072B2",
    lineDashPattern: [10, 6],
  },
  spraying: {
    label: "Spraying",
    shortLabel: "SPRY",
    standardColor: "#7c3aed",
    colorblindColor: "#CC79A7",
    lineDashPattern: [2, 7],
  },
  brushing: {
    label: "Brushing",
    shortLabel: "BRSH",
    standardColor: "#16a34a",
    colorblindColor: "#009E73",
    lineDashPattern: [12, 5],
  },
  culvert: {
    label: "Culvert",
    shortLabel: "CULV",
    standardColor: "#334155",
    colorblindColor: "#4D4D4D",
    lineDashPattern: [14, 8],
  },
  guardrail: {
    label: "Guardrail",
    shortLabel: "GRDL",
    standardColor: "#d97706",
    colorblindColor: "#E69F00",
  },
  ditching: {
    label: "Ditching",
    shortLabel: "DTCH",
    standardColor: "#0f766e",
    colorblindColor: "#56B4E9",
    lineDashPattern: [18, 7],
  },
};

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

export type WorkOrderTypeStyle = {
  key: CanonicalWorkOrderType;
  label: string;
  shortLabel: string;
  color: string;
  lineDashPattern?: number[];
  usesPattern: boolean;
  isLegacyDangerTree: boolean;
};

export const WORK_ORDER_TYPE_FALLBACK_COLOR = "#6b7280";

function canonicalDisplayKey(type?: string | null): CanonicalWorkOrderType | null {
  const normalized = normalizeWorkTypeKey(type);
  if (normalized === "pavement_repair") return "pavement_repair";
  if (normalized === "sign") return "sign";
  if (normalized === "spraying") return "spraying";
  if (normalized === "brushing") return "brushing";
  if (normalized === "culvert") return "culvert";
  if (normalized === "guardrail") return "guardrail";
  if (normalized === "ditching") return "ditching";
  return null;
}

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
  const key = canonicalDisplayKey(type);
  if (!key) return WORK_ORDER_TYPE_FALLBACK_COLOR;

  const paletteMode = options?.palette ?? (options?.colorblindMode ? "colorblind" : "standard");
  const meta = WORK_ORDER_TYPE_META[key];
  return paletteMode === "colorblind" ? meta.colorblindColor : meta.standardColor;
}

export function getWorkOrderTypeStyle(
  type?: string | null,
  options?: { palette?: WorkOrderTypeColorPalette; colorblindMode?: boolean },
): WorkOrderTypeStyle {
  const key = canonicalDisplayKey(type) ?? "pavement_repair";
  const normalizedRaw = String(type ?? "").trim().toLowerCase().replace(/\s+/g, "_");
  const meta = WORK_ORDER_TYPE_META[key];
  const color = getWorkOrderTypeColor(type, options);
  const paletteMode = options?.palette ?? (options?.colorblindMode ? "colorblind" : "standard");

  return {
    key,
    label: meta.label,
    shortLabel: meta.shortLabel,
    color,
    lineDashPattern: paletteMode === "colorblind" ? meta.lineDashPattern : undefined,
    usesPattern: paletteMode === "colorblind" && !!meta.lineDashPattern?.length,
    isLegacyDangerTree: normalizedRaw === "danger_tree",
  };
}

export function getWorkOrderTypePattern(type?: string | null, options?: { colorblindMode?: boolean }): number[] | undefined {
  return getWorkOrderTypeStyle(type, options).lineDashPattern;
}

export function getWorkOrderTypeA11yLabel(type?: string | null): string {
  const style = getWorkOrderTypeStyle(type);
  return style.isLegacyDangerTree ? `${style.label} (legacy Danger Tree)` : style.label;
}

export function getWorkOrderTypeBorderWidth(colorblindMode?: boolean): number {
  return colorblindMode ? 2 : 1;
}

export function getWorkOrderTypeChipFill(type?: string | null, options?: { colorblindMode?: boolean; selected?: boolean }): string {
  const color = getWorkOrderTypeColor(type, options);
  if (options?.selected) return color;
  return options?.colorblindMode ? `${color}14` : "#ffffff";
}

export function getWorkOrderTypeChipBorder(type?: string | null, options?: { colorblindMode?: boolean }): string {
  return getWorkOrderTypeColor(type, options);
}

export function getWorkOrderTypeChipText(type?: string | null, options?: { colorblindMode?: boolean; selected?: boolean }): string {
  if (options?.selected) return "#ffffff";
  return options?.colorblindMode ? "#0f172a" : getWorkOrderTypeColor(type, options);
}

export function getWorkOrderTypePreviewTypes(): CanonicalWorkOrderType[] {
  return ["pavement_repair", "brushing", "culvert", "sign"];
}

export function getWorkTypeColor(type?: string | null, options?: { colorblindMode?: boolean }): string {
  return getWorkOrderTypeColor(type, options);
}

export function formatWorkType(type?: string | null): string {
  const key = canonicalDisplayKey(type);
  if (key) return WORK_ORDER_TYPE_META[key].label;

  const fallback = (type ?? "").trim();
  return fallback.length ? fallback : "Unknown";
}
