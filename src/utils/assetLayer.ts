import { getSignVisualStyle } from "./signVisualStyle";

export type AssetLayerFilter = "all" | "sign" | "guardrail" | "culvert" | "delineator" | "bridge";

export const ASSET_LAYER_FILTER_OPTIONS: ReadonlyArray<{ value: AssetLayerFilter; label: string }> = [
  { value: "all", label: "All" },
  { value: "sign", label: "Signs" },
  { value: "guardrail", label: "Guardrail" },
  { value: "culvert", label: "Culverts" },
  { value: "delineator", label: "Delineators" },
  { value: "bridge", label: "Bridges" },
] as const;

type AssetLike = {
  assetType?: string | null;
  subtype?: string | null;
  details?: Record<string, unknown> | null;
};

function readString(record: Record<string, unknown>, key: string): string {
  const value = record[key];
  return typeof value === "string" ? value : "";
}

function isDelineatorAsset(asset: AssetLike): boolean {
  const rawType = String(asset.assetType ?? "").trim().toUpperCase();
  if (rawType === "DELINEATOR") return true;

  const subtype = String(asset.subtype ?? "").trim().toUpperCase();
  if (subtype.includes("DELINEATOR")) return true;

  const details = asset.details ?? null;
  if (!details || typeof details !== "object") return false;

  const detailSubtype = readString(details, "subtype").trim().toUpperCase();
  const category = readString(details, "category").trim().toUpperCase();
  const mutcd = readString(details, "mutcdCode").trim().toUpperCase();

  return (
    detailSubtype.includes("DELINEATOR") ||
    category.includes("DELINEATOR") ||
    mutcd.startsWith("OM")
  );
}

export function getAssetLayerKind(asset: AssetLike): Exclude<AssetLayerFilter, "all"> {
  const rawType = String(asset.assetType ?? "").trim().toUpperCase();

  if (isDelineatorAsset(asset)) return "delineator";
  if (rawType === "BRIDGE") return "bridge";
  if (rawType === "GUARDRAIL") return "guardrail";
  if (rawType === "CULVERT") return "culvert";
  return "sign";
}

export function matchesAssetLayerFilter(asset: AssetLike, selected: AssetLayerFilter): boolean {
  if (selected === "all") return true;
  return getAssetLayerKind(asset) === selected;
}

export function assetEmoji(asset: AssetLike): string {
  const layer = getAssetLayerKind(asset);
  if (layer === "delineator") return "\u{1F6A7}";
  if (layer === "sign") return "\u{1F6D1}";
  if (layer === "guardrail") return "\u{1F6E1}";
  if (layer === "culvert") return "\u{1F30A}";
  if (layer === "bridge") return "\u{1F309}";
  return "\u{1F4CD}";
}

export function getAssetSignVisual(asset: AssetLike) {
  return getSignVisualStyle({
    subtype: asset.subtype,
    details: asset.details ?? null,
    source: (asset as Record<string, unknown>) ?? null,
  });
}
