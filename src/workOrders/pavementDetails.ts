import type {
  PavementIssueCategory,
  PavementLanePosition,
  PavementRepairDetails,
  PavementRepairMethod,
  PavementSurfaceType,
} from "../types/workItem";

export type PavementPresetKey =
  | "temporary_pothole_patch"
  | "permanent_pothole_repair"
  | "failed_patch_repair"
  | "edge_repair"
  | "base_failure";

export const PAVEMENT_TYPE_ALIASES = new Set([
  "pothole",
  "pavement_repair",
  "pavement repair",
  "asphalt_patch",
  "asphalt patch",
  "roadway_surface_repair",
  "roadway surface repair",
  "asphalt", // legacy
]);

export const PAVEMENT_REPAIR_METHOD_OPTIONS: Array<{
  label: string;
  value: PavementRepairMethod;
}> = [
  { label: "Cold Mix", value: "cold_mix" },
  { label: "Hot Mix", value: "hot_mix" },
  { label: "Spray Patch", value: "spray_patch" },
  { label: "Grind & Inlay", value: "grind_inlay" },
  { label: "Mill & Fill", value: "mill_fill" },
  { label: "Skin Patch", value: "skin_patch" },
  { label: "Full-Depth Patch", value: "full_depth_patch" },
  { label: "Digout / Rebuild", value: "digout_rebuild" },
  { label: "Crack Seal", value: "crack_seal" },
  { label: "Wedge Patch", value: "wedge_patch" },
  { label: "Shoulder Backup", value: "shoulder_backup" },
  { label: "Other", value: "other" },
];

export const PAVEMENT_ISSUE_CATEGORY_OPTIONS: Array<{
  label: string;
  value: PavementIssueCategory;
}> = [
  { label: "Pothole", value: "pothole" },
  { label: "Failed Patch", value: "failed_patch" },
  { label: "Edge Break", value: "edge_break" },
  { label: "Utility Cut Failure", value: "utility_cut_failure" },
  { label: "Alligator Cracking", value: "alligator_cracking" },
  { label: "Rutting", value: "rutting" },
  { label: "Settlement", value: "settlement" },
  { label: "Frost Heave", value: "frost_heave" },
  { label: "Shoulder Drop-off", value: "shoulder_dropoff" },
  { label: "Drainage Failure", value: "drainage_failure" },
  { label: "Other", value: "other" },
];

// Backward-compatible export name used by existing imports.
export const PAVEMENT_CATEGORY_OPTIONS = PAVEMENT_ISSUE_CATEGORY_OPTIONS;

export const PAVEMENT_LANE_POSITION_OPTIONS: Array<{
  label: string;
  value: PavementLanePosition;
}> = [
  { label: "Center Lane", value: "center_lane" },
  { label: "Left Wheel Path", value: "wheel_path_left" },
  { label: "Right Wheel Path", value: "wheel_path_right" },
  { label: "Edge", value: "edge" },
  { label: "Shoulder", value: "shoulder" },
  { label: "Intersection", value: "intersection" },
  { label: "Bridge Approach", value: "bridge_approach" },
  { label: "Other", value: "other" },
];

export const PAVEMENT_SURFACE_TYPE_OPTIONS: Array<{
  label: string;
  value: PavementSurfaceType;
}> = [
  { label: "Asphalt", value: "asphalt" },
  { label: "Chip Seal", value: "chip_seal" },
  { label: "Gravel", value: "gravel" },
  { label: "Concrete", value: "concrete" },
  { label: "Other", value: "other" },
];

export const PAVEMENT_PRESETS: Array<{
  key: PavementPresetKey;
  label: string;
}> = [
  { key: "temporary_pothole_patch", label: "Temporary Pothole Patch" },
  { key: "permanent_pothole_repair", label: "Permanent Pothole Repair" },
  { key: "failed_patch_repair", label: "Failed Patch Repair" },
  { key: "edge_repair", label: "Edge Repair" },
  { key: "base_failure", label: "Base Failure" },
];

const ISSUE_CATEGORY_VALUES = new Set(PAVEMENT_ISSUE_CATEGORY_OPTIONS.map((x) => x.value));
const METHOD_VALUES = new Set(PAVEMENT_REPAIR_METHOD_OPTIONS.map((x) => x.value));
const LANE_VALUES = new Set(PAVEMENT_LANE_POSITION_OPTIONS.map((x) => x.value));
const SURFACE_VALUES = new Set(PAVEMENT_SURFACE_TYPE_OPTIONS.map((x) => x.value));

function normTypeKey(typeRaw: string | null | undefined): string {
  return String(typeRaw ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function maybeFiniteNumber(v: unknown): number | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const n = typeof v === "string" ? Number(v.trim()) : Number(v);
  if (!Number.isFinite(n)) return undefined;
  return n;
}

function maybeBoolean(v: unknown): boolean | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  if (typeof v === "boolean") return v;
  return undefined;
}

function maybeString(v: unknown): string | null | undefined {
  if (v === null) return null;
  if (v === undefined) return undefined;
  const s = String(v).trim();
  return s.length ? s : null;
}

function mapLegacyIssueCategory(v: unknown): PavementIssueCategory | undefined {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return undefined;

  if (raw === "utility_cut") return "utility_cut_failure";
  if (raw === "alligator") return "alligator_cracking";
  if (raw === "heave") return "frost_heave";

  if (ISSUE_CATEGORY_VALUES.has(raw as PavementIssueCategory)) {
    return raw as PavementIssueCategory;
  }
  return undefined;
}

function mapLegacyRepairMethod(v: unknown): PavementRepairMethod | undefined {
  const raw = String(v ?? "").trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === "chip_seal_followup") return "other";
  if (METHOD_VALUES.has(raw as PavementRepairMethod)) return raw as PavementRepairMethod;
  return undefined;
}

export function isPavementRepairType(typeRaw: string | null | undefined): boolean {
  const normalized = normTypeKey(typeRaw);
  if (!normalized) return false;
  if (PAVEMENT_TYPE_ALIASES.has(normalized)) return true;
  return PAVEMENT_TYPE_ALIASES.has(normalized.replace(/_/g, " "));
}

export function getPavementPreset(key: PavementPresetKey): Partial<PavementRepairDetails> {
  switch (key) {
    case "temporary_pothole_patch":
      return {
        issueCategory: "pothole",
        repairMethod: "cold_mix",
        temporaryRepair: true,
        followUpNeeded: true,
      };
    case "permanent_pothole_repair":
      return {
        issueCategory: "pothole",
        repairMethod: "hot_mix",
        temporaryRepair: false,
      };
    case "failed_patch_repair":
      return {
        issueCategory: "failed_patch",
        repairMethod: "full_depth_patch",
      };
    case "edge_repair":
      return {
        issueCategory: "edge_break",
        repairMethod: "wedge_patch",
      };
    case "base_failure":
      return {
        issueCategory: "alligator_cracking",
        repairMethod: "digout_rebuild",
      };
    default:
      return {};
  }
}

export function normalizePavementRepairDetails(
  details: unknown,
): PavementRepairDetails | undefined {
  if (!details || typeof details !== "object") return undefined;

  const d = details as Record<string, unknown>;
  const next: PavementRepairDetails = {};

  const issueCategory = mapLegacyIssueCategory(d.issueCategory ?? d.category);
  if (issueCategory) next.issueCategory = issueCategory;

  const repairMethod = mapLegacyRepairMethod(d.repairMethod);
  if (repairMethod) next.repairMethod = repairMethod;

  if (LANE_VALUES.has(d.lanePosition as PavementLanePosition)) {
    next.lanePosition = d.lanePosition as PavementLanePosition;
  }
  if (SURFACE_VALUES.has(d.surfaceType as PavementSurfaceType)) {
    next.surfaceType = d.surfaceType as PavementSurfaceType;
  }

  next.estimatedLengthFt = maybeFiniteNumber(d.estimatedLengthFt);
  next.estimatedWidthFt = maybeFiniteNumber(d.estimatedWidthFt);
  next.estimatedDepthIn = maybeFiniteNumber(d.estimatedDepthIn);
  next.estimatedTons = maybeFiniteNumber(d.estimatedTons);

  next.trafficControlNeeded = maybeBoolean(d.trafficControlNeeded);
  next.grinderNeeded = maybeBoolean(d.grinderNeeded ?? d.requiresGrinder);
  next.sawCutNeeded = maybeBoolean(d.sawCutNeeded ?? d.requiresSawCut);
  next.rollerNeeded = maybeBoolean(d.rollerNeeded ?? d.requiresRoller);
  next.drainageIssuePresent = maybeBoolean(d.drainageIssuePresent ?? d.waterIssuePresent);
  next.temporaryRepair = maybeBoolean(d.temporaryRepair);
  next.followUpNeeded = maybeBoolean(d.followUpNeeded);

  const legacyDrainage = String(d.drainageIssue ?? "").trim().toLowerCase();
  if (next.drainageIssuePresent == null && legacyDrainage) {
    next.drainageIssuePresent = legacyDrainage !== "none";
  }

  next.followUpAction = maybeString(d.followUpAction);
  next.materialNote = maybeString(d.materialNote);
  next.causeNote = maybeString(d.causeNote);

  if (next.repairMethod === "cold_mix" && next.temporaryRepair === undefined) {
    next.temporaryRepair = true;
  }

  if (Object.values(next).every((v) => v === undefined)) return undefined;
  return next;
}

export function validatePavementRepairDetails(
  details: PavementRepairDetails | null | undefined,
): string[] {
  if (!details) return [];
  const errors: string[] = [];

  const nonNegativeChecks: Array<[value: number | null | undefined, label: string]> = [
    [details.estimatedLengthFt, "Estimated length"],
    [details.estimatedWidthFt, "Estimated width"],
    [details.estimatedDepthIn, "Estimated depth"],
    [details.estimatedTons, "Estimated tons"],
  ];
  for (const [value, label] of nonNegativeChecks) {
    if (typeof value === "number" && value < 0) {
      errors.push(`${label} must be greater than or equal to 0.`);
    }
  }

  return errors;
}

export function normalizeWorkOrderDetailsForType(
  typeRaw: string | null | undefined,
  details: unknown,
): Record<string, any> | null {
  if (!details || typeof details !== "object") return null;

  if (isPavementRepairType(typeRaw)) {
    return normalizePavementRepairDetails(details) ?? null;
  }

  return details as Record<string, any>;
}
