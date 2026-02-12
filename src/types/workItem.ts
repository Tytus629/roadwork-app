export type WorkType =
  | "pothole"
  | "spraying"
  | "brushing"
  | "asphalt"
  | "culvert"
  | "ditching"
  | "danger_tree"
  | "guardrail"
  | "sign";

export type WorkStatus = "needs" | "in_progress" | "completed" | "deferred";
export type Priority = "no priority" | "low" | "medium" | "high" | "urgent";

export type GeoPoint = { lat: number; lng: number };

export type Geometry =
  | { kind: "point"; coordinates: GeoPoint }
  | { kind: "line"; coordinates: GeoPoint[] }
  | { kind: "polygon"; coordinates: GeoPoint[] };

export type PhotoSource = "camera" | "gallery";

export type WorkPhoto = {
  id: string;
  uri: string;            // local file uri
  width?: number | null;
  height?: number | null;
  fileName?: string | null;
  mimeType?: string | null;
  fileSize?: number | null;

  createdAt: number;
  source: PhotoSource;

  // GPS tagging (captured at time of add)
  lat?: number | null;
  lng?: number | null;
  accuracyM?: number | null;
};

// STEP C: Sign Maintenance Types
export type SignType =
  | "stop"
  | "yield"
  | "speed_limit"
  | "warning"
  | "street_name"
  | "no_parking"
  | "other";

export type SignCondition =
  | "good"
  | "faded"
  | "damaged"
  | "missing"
  | "knocked_down";

export type SignMaintenance = {
  signType?: SignType | null;
  condition?: SignCondition | null;
  reflectivityIssue?: boolean;
  obstructed?: boolean;
  replacementNeeded?: boolean;
};

// STEP: Sign Type Picker - New comprehensive categories
export type SignCategory =
  | "Regulatory"
  | "Warning"
  | "Guide"
  | "TemporaryTrafficControl"
  | "School"
  | "Railroad"
  | "Other";

export type SignDetailsNew = {
  category: SignCategory;
  code?: string | null;     // ex: "R1-1" (optional)
  name: string;             // ex: "STOP"
  value?: string | null;    // ex: "35" for Speed Limit
  notes?: string | null;
};

// Sign inspection data (from SignInspectionForm)
export type SignInspectionData = {
  legible: boolean;
  damaged: boolean;
  missing: boolean;
  knockedDown: boolean;
  obstructed: boolean;
  faded: boolean;
  dirty: boolean;
  postLeaning?: boolean;
  heightOk?: boolean;
  retroMethod: string;
  retroResult: string;
  measuredRetro?: any | null;
  actionReplace: boolean;
  actionRemove: boolean;
  actionAdjustHeight: boolean;
  note?: string;
  inspector?: string;
};

// Simplified sign inspection (1-10 scales)
export type PostMaterial = "wood" | "metal" | "other";

export type SignInspectionLite = {
  reflectivity: number;    // 1-10
  delamination: number;    // 1-10
  appearance: number;      // 1-10
  postCondition: number;   // 1-10
  postMaterial: PostMaterial;
  notes?: string | null;
};

export type WorkItem = {
  id: string;
  type: WorkType;
  status: WorkStatus;
  priority: Priority;

  title?: string;
  notes?: string;

  geometry: Geometry;

  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  createdBy?: string;
  assignedTo?: string | null;
  lastActionAt?: number;

  // ✅ attachments
  photos?: WorkPhoto[];

  // Sign Asset linking (for deduplication)
  signAssetId?: string;
  
  // Convenience location fields (extracted from geometry)
  lat?: number;
  lng?: number;

  // Sign maintenance fields (STEP C)
  signMaintenance?: SignMaintenance;
  
  // Sign inspection data (complex)
  signInspection?: SignInspectionData;
  
  // Sign inspection data (simplified 1-10 scales)
  signInspectionLite?: SignInspectionLite;
  
  // Sign inspection toggle state (persisted)
  inspectionEnabled?: boolean;

  // STEP 1: Dirty flag for future sync
  needsSync?: boolean;

  // Placeholder for future expansion
  signMeta?: {
    signCode?: string;               // e.g. STOP, W1-1
    retroReflectiveRating?: number;  // 0-100 or 1-5 later
    postType?: "wood" | "telespar" | "u_channel" | "other";
    needsReplacement?: boolean;
  };

  // Type-specific maintenance details (only one used per type)
  potholeDetails?: PotholeDetails;
  signDetails?: SignDetails;
  sprayingDetails?: SprayingDetails;
  brushingDetails?: BrushingDetails;
  culvertDetails?: CulvertDetails;
  guardrailDetails?: GuardrailDetails;
  dangerTreeDetails?: DangerTreeDetails;
  ditchingDetails?: DitchingDetails;
  asphaltDetails?: AsphaltDetails;
};

// ═══════════════════════════════════════════════════════════════════════════
// TYPE-SPECIFIC MAINTENANCE DETAILS
// ═══════════════════════════════════════════════════════════════════════════

export type PotholeDetails = {
  severity?: "low" | "medium" | "high";
  hazard?: boolean;              // cone/flag needed
  waterPresent?: boolean;
  edgeBreak?: boolean;
  needsPatch?: boolean;
  tempFillDone?: boolean;        // set when completed (optional)
  repairMethod?: "cold_patch" | "hot_mix" | "grind_inlay" | "other";
};

export type SignDetails = {
  signType?: string | null;      // use a code or label, start flexible
  mutcdCode?: string | null;     // optional (R1-1 etc.)
  condition?: "good" | "faded" | "damaged" | "missing" | "knocked_down";
  reflectivityIssue?: boolean;
  obstructed?: boolean;
  replacementNeeded?: boolean;
  postLeaning?: boolean;
  heightOk?: boolean;
  // New comprehensive sign type picker fields
  category?: SignCategory | null;
  code?: string | null;          // ex: "R1-1"
  name?: string | null;          // ex: "STOP"
  value?: string | null;         // ex: "35" for Speed Limit
  notes?: string | null;
  // STEP C: Enhanced fields for fast field entry
  signTypeId?: string | null;    // Links to SIGN_TYPES array
  action?: "Replace" | "Repair" | "Clean" | "Install" | null;
};

export type SprayingDetails = {
  target?: "weeds" | "brush" | "invasive" | "other";
  areaType?: "shoulder" | "ditch" | "median" | "around_signs" | "other";
  nearWater?: boolean;
  posted?: boolean;              // signs/notice posted
};

export type BrushingDetails = {
  scope?: "spot" | "segment";
  areaType?: "shoulder" | "ditch" | "around_signs" | "guardrail_line" | "other";
  sightDistanceIssue?: boolean;
  debrisLeft?: boolean;
};

export type CulvertDetails = {
  issue?: "plugged" | "damaged" | "washed_out" | "collapse" | "other";
  standingWater?: boolean;
  inletBlocked?: boolean;
  outletBlocked?: boolean;
  needsJetting?: boolean;
};

export type GuardrailDetails = {
  component?: "w_beam" | "thrie_beam" | "posts" | "blocks" | "end_treatment" | "other";
  endTreatmentType?: "impact_head" | "ram_head" | "unknown";
  damageLevel?: "minor" | "moderate" | "severe";
  brokenPosts?: boolean;
  brokenBlocks?: boolean;
  railBent?: boolean;
  endTreatmentDamaged?: boolean;
  needsReplacement?: boolean;
};

export type DangerTreeDetails = {
  issue?: "in_road" | "leaning" | "downed" | "hanging_limb" | "blocking_view" | "other";
  blockingLane?: boolean;
  needsTrafficControl?: boolean;
  removed?: boolean;             // set when completed (optional)
};

export type DitchingDetails = {
  issue?: "silted" | "erosion" | "standing_water" | "washout" | "other";
  equipmentNeeded?: "hand" | "mini_ex" | "excavator" | "grader" | "other";
};

export type AsphaltDetails = {
  workType?: "patch" | "overlay" | "pave" | "pothole_repair" | "other";
  mix?: "g_mix" | "s_mix" | "b_mix" | "warm_mix" | "cold_patch" | "unknown";
  depthIn?: number | null;       // optional: target depth
  areaFt2?: number | null;       // optional: estimated area
};
