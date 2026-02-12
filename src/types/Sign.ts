/**
 * Sign Asset and Inspection Types
 * 
 * Supports offline-first sign asset management with periodic inspections.
 * Tracks retroreflectivity compliance using various MUTCD-approved methods.
 */

export type SignType =
  | "stop"
  | "yield"
  | "speed_limit"
  | "warning"
  | "street_name"
  | "no_parking"
  | "do_not_enter"
  | "other";

export type SignColorGroup =
  | "white"
  | "yellow"
  | "red"
  | "green"
  | "orange"
  | "blue"
  | "brown";

export type RetroMethod =
  | "visual_nighttime"          // MUTCD-approved visual nighttime inspection
  | "measured_retroreflectivity"// retroreflectometer
  | "expected_sign_life"        // age-based program
  | "other";

export type InspectionResult = "ok" | "marginal" | "replace";

export type MeasuredRetro = {
  // Store what you actually measured (if using a retroreflectometer).
  // Many agencies measure per color (background + legend) and compare to MUTCD table.
  units?: "cd/lx/m2"; // standard unit for RA values
  backgroundColor?: SignColorGroup | null;
  legendColor?: SignColorGroup | null;
  backgroundRA?: number | null;
  legendRA?: number | null;
  meetsMinimum?: boolean | null; // inspector decision or computed later
};

export type SignInspection = {
  id: string;
  signId: string;
  ts: number;
  inspector?: string | null;

  // Where/when inspection happened (optional – sign asset also has location)
  note?: string | null;

  // "inspection sheet" style fields
  legible: boolean;
  damaged: boolean;
  missing: boolean;
  knockedDown: boolean;
  obstructed: boolean;
  faded: boolean;
  dirty: boolean;

  // optional physical/support checks
  postLeaning?: boolean;
  heightOk?: boolean;

  // Retroreflectivity evaluation
  retroMethod: RetroMethod;
  retroResult: InspectionResult; // ok/marginal/replace
  measuredRetro?: MeasuredRetro | null;

  // Actions
  actionReplace: boolean;
  actionRemove: boolean;
  actionAdjustHeight: boolean;

  photos?: { id: string; localPath: string; createdAt: number }[];

  // Sync
  needsSync?: boolean;
};

export type SignAsset = {
  id: string;

  signType: SignType;
  mutcdCode?: string | null;     // e.g., "R1-1" (optional)
  message?: string | null;       // for custom/street name/etc.

  // Location (Point only for sign assets)
  lat: number;
  lng: number;
  bearingDeg?: number | null;    // optional

  installedAt?: number | null;
  sheetingType?: string | null;  // optional (Type III/IV/XI etc.)
  colorGroup?: SignColorGroup | null;

  lastInspectionAt?: number | null;
  lastResult?: InspectionResult | null;
  nextDueAt?: number | null;     // periodic inspections

  // housekeeping
  createdAt: number;
  updatedAt: number;
  needsSync?: boolean;
};
