import type { AssetType } from "../types/Asset";

export type AssetTypeKey = "sign" | "culvert" | "guardrail" | "bridge";

export const ASSET_TYPE_KEYS: ReadonlyArray<AssetTypeKey> = [
  "sign",
  "culvert",
  "guardrail",
  "bridge",
] as const;

export const ASSET_TYPE_FILTER_OPTIONS: ReadonlyArray<{
  value: AssetTypeKey;
  label: string;
}> = [
  { value: "sign", label: "Signs" },
  { value: "culvert", label: "Culverts" },
  { value: "guardrail", label: "Guardrail" },
  { value: "bridge", label: "Bridge" },
] as const;

const SINGULAR_LABELS: Record<AssetTypeKey, string> = {
  sign: "Sign",
  culvert: "Culvert",
  guardrail: "Guardrail",
  bridge: "Bridge",
};

const PLURAL_LABELS: Record<AssetTypeKey, string> = {
  sign: "Signs",
  culvert: "Culverts",
  guardrail: "Guardrail",
  bridge: "Bridges",
};

const TYPE_COLORS: Record<AssetTypeKey, string> = {
  sign: "#2563eb",
  culvert: "#334155",
  guardrail: "#6b7280",
  bridge: "#0f766e",
};

const TYPE_SHORT_LABELS: Record<AssetTypeKey, string> = {
  sign: "SIGN",
  culvert: "CULV",
  guardrail: "GR",
  bridge: "BRDG",
};

export function normalizeAssetTypeKey(raw: unknown): AssetTypeKey | null {
  const normalized = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-]+/g, " ")
    .replace(/\s+/g, " ");

  if (!normalized) return null;

  if (normalized === "sign" || normalized === "signs") return "sign";
  if (normalized === "culvert" || normalized === "culverts") return "culvert";
  if (
    normalized === "guardrail" ||
    normalized === "guardrails" ||
    normalized === "guard rail" ||
    normalized === "guard rails"
  ) {
    return "guardrail";
  }
  if (normalized === "bridge" || normalized === "bridges") return "bridge";

  if (normalized === "delineator" || normalized === "delineators") return "sign";

  return null;
}

export function toAssetModelType(type: AssetTypeKey): AssetType {
  if (type === "culvert") return "CULVERT";
  if (type === "guardrail") return "GUARDRAIL";
  if (type === "bridge") return "BRIDGE";
  return "SIGN";
}

export function getAssetTypeLabel(
  raw: unknown,
  options?: { plural?: boolean },
): string {
  const normalized = normalizeAssetTypeKey(raw);
  if (!normalized) {
    const fallback = String(raw ?? "").trim();
    return fallback || "Asset";
  }
  return options?.plural ? PLURAL_LABELS[normalized] : SINGULAR_LABELS[normalized];
}

export function isInspectableAssetType(raw: unknown): boolean {
  return normalizeAssetTypeKey(raw) != null;
}

export function assetTypeSortOrder(raw: unknown): number {
  const normalized = normalizeAssetTypeKey(raw);
  if (normalized === "sign") return 0;
  if (normalized === "culvert") return 1;
  if (normalized === "guardrail") return 2;
  if (normalized === "bridge") return 3;
  return 99;
}

export function getAssetTypeColor(raw: unknown): string {
  const normalized = normalizeAssetTypeKey(raw);
  return normalized ? TYPE_COLORS[normalized] : "#64748b";
}

export function getAssetTypeShortLabel(raw: unknown): string {
  const normalized = normalizeAssetTypeKey(raw);
  return normalized ? TYPE_SHORT_LABELS[normalized] : "ASSET";
}