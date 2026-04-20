// ============================================================
// MUTCD-based sign categories + common presets
// ============================================================

export type SignCategory =
  | "Regulatory"
  | "Warning"
  | "Guide"
  | "Construction"
  | "School"
  | "Railroad"
  | "Other";

export type SignType = {
  id: string;
  label: string;
  category: SignCategory;
  mutcdCode?: string;
};

export const SIGN_TYPES: SignType[] = [
  // ---------------- Regulatory ----------------
  { id: "stop", label: "STOP", category: "Regulatory", mutcdCode: "R1-1" },
  { id: "yield", label: "YIELD", category: "Regulatory", mutcdCode: "R1-2" },
  { id: "speed_limit_25", label: "Speed Limit 25", category: "Regulatory", mutcdCode: "R2-1" },
  { id: "speed_limit_35", label: "Speed Limit 35", category: "Regulatory", mutcdCode: "R2-1" },
  { id: "speed_limit_45", label: "Speed Limit 45", category: "Regulatory", mutcdCode: "R2-1" },
  { id: "speed_limit_55", label: "Speed Limit 55", category: "Regulatory", mutcdCode: "R2-1" },
  { id: "no_parking", label: "No Parking", category: "Regulatory", mutcdCode: "R8-3" },
  { id: "one_way", label: "One Way", category: "Regulatory", mutcdCode: "R6-1" },
  { id: "do_not_enter", label: "Do Not Enter", category: "Regulatory", mutcdCode: "R5-1" },
  { id: "no_turn_on_red", label: "No Turn on Red", category: "Regulatory" },
  { id: "no_u_turn", label: "No U-Turn", category: "Regulatory", mutcdCode: "R3-4" },
  { id: "keep_right", label: "Keep Right", category: "Regulatory", mutcdCode: "R4-7" },
  { id: "keep_left", label: "Keep Left", category: "Regulatory", mutcdCode: "R4-8" },

  // ---------------- Warning ----------------
  { id: "curve_ahead", label: "Curve Ahead", category: "Warning", mutcdCode: "W1-2" },
  { id: "right_turn", label: "Right Turn", category: "Warning", mutcdCode: "W1-1" },
  { id: "sharp_turn", label: "Sharp Turn", category: "Warning", mutcdCode: "W1-1" },
  { id: "hairpin_curve_left", label: "Hairpin Curve Left", category: "Warning", mutcdCode: "W1-11L" },
  { id: "hairpin_curve_right", label: "Hairpin Curve Right", category: "Warning", mutcdCode: "W1-11R" },
  { id: "winding_road", label: "Winding Road", category: "Warning", mutcdCode: "W1-3" },
  { id: "intersection_ahead", label: "Intersection Ahead", category: "Warning", mutcdCode: "W2-1" },
  { id: "cross_traffic", label: "Cross Traffic", category: "Warning", mutcdCode: "W2-5" },
  { id: "deer_crossing", label: "Deer Crossing", category: "Warning", mutcdCode: "W11-3" },
  { id: "elk_crossing", label: "Elk Crossing", category: "Warning", mutcdCode: "W11-3-ELK" },
  { id: "fire_station_crossing", label: "Fire Station Crossing", category: "Warning", mutcdCode: "W11-FIRE" },
  { id: "slippery_when_wet", label: "Slippery When Wet", category: "Warning", mutcdCode: "W8-5" },
  { id: "steep_hill", label: "Steep Hill", category: "Warning", mutcdCode: "W7-1" },
  { id: "pedestrian_crossing", label: "Pedestrian Crossing", category: "Warning", mutcdCode: "W11-2" },
  { id: "merge", label: "Merge", category: "Warning", mutcdCode: "W4-1" },
  { id: "lane_ends", label: "Lane Ends", category: "Warning", mutcdCode: "W4-2" },
  { id: "divided_highway", label: "Divided Highway", category: "Warning", mutcdCode: "W6-1" },

  // ---------------- Guide ----------------
  { id: "street_name", label: "Street Name", category: "Guide", mutcdCode: "D3-1" },
  { id: "mile_marker", label: "Mile Marker", category: "Guide", mutcdCode: "D10-1" },
  { id: "route_marker", label: "Route Marker", category: "Guide" },
  { id: "route_shield", label: "Route Shield", category: "Guide" },
  { id: "exit_sign", label: "Exit Sign", category: "Guide", mutcdCode: "E1-5" },
  { id: "destination_distance", label: "Destination / Distance", category: "Guide" },
  { id: "hospital", label: "Hospital", category: "Guide", mutcdCode: "D9-1" },
  { id: "amenities", label: "Gas/Food/Lodging", category: "Guide" },

  // ---------------- Construction ----------------
  { id: "work_zone_ahead", label: "Road Work Ahead", category: "Construction", mutcdCode: "W20-1" },
  { id: "detour", label: "Detour", category: "Construction", mutcdCode: "M4-8" },
  { id: "flagger_ahead", label: "Flagger Ahead", category: "Construction", mutcdCode: "W20-7" },
  { id: "lane_shift", label: "Lane Shift", category: "Construction" },
  { id: "uneven_lanes", label: "Uneven Lanes", category: "Construction", mutcdCode: "W8-11" },

  // ---------------- School ----------------
  { id: "school_zone", label: "School Zone", category: "School", mutcdCode: "S1-1" },
  { id: "school_crossing", label: "School Crossing", category: "School", mutcdCode: "S1-1" },
  { id: "school_speed_limit", label: "School Speed Limit", category: "School", mutcdCode: "S5-1" },
  { id: "children_at_play", label: "Children at Play", category: "School" },

  // ---------------- Railroad ----------------
  { id: "railroad_crossing", label: "Railroad Crossing", category: "Railroad", mutcdCode: "R15-1" },

  // ---------------- Other ----------------
  { id: "other", label: "Other / Unknown", category: "Other" },
];

// Legacy export for backward compatibility
export const STANDARD_ROAD_SIGNS = SIGN_TYPES.map(st => ({
  label: st.mutcdCode ? `${st.label} (${st.mutcdCode})` : st.label,
  value: st.id,
}));

export type StandardRoadSignKey = string;
