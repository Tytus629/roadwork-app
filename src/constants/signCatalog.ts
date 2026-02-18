// src/constants/signCatalog.ts
export type SignCategory =
  | "Regulatory"
  | "Warning"
  | "Guide"
  | "School"
  | "Work Zone (TTC)"
  | "Railroad"
  | "Bike/Ped";

export type SignCatalogItem = {
  category: SignCategory;
  code: string;     // MUTCD code (e.g., R1-1)
  name: string;     // Plain name (e.g., STOP)
  keywords?: string[];
};

// NOTE:
// This is a "starter core" catalog of the most common signs you'll actually log in the field.
// It's based on MUTCD sign series structure (R/W/D etc.) and common codes.
// Expand as you want (we can auto-generate bigger lists next).
// MUTCD 11th Ed (Dec 2023) is the governing standard.
// https://mutcd.fhwa.dot.gov/pdfs/11th_Edition/mutcd11thedition.pdf

export const SIGN_CATALOG: SignCatalogItem[] = [
  // -------------------------
  // REGULATORY (R-series)
  // -------------------------
  { category: "Regulatory", code: "R1-1", name: "STOP", keywords: ["stop sign"] },
  { category: "Regulatory", code: "R1-2", name: "YIELD", keywords: ["yield sign"] },
  { category: "Regulatory", code: "R1-3P", name: "ALL WAY (Plaque)", keywords: ["all way", "4-way"] },

  { category: "Regulatory", code: "R2-1", name: "SPEED LIMIT", keywords: ["speed", "mph"] },

  { category: "Regulatory", code: "R3-1", name: "NO RIGHT TURN" },
  { category: "Regulatory", code: "R3-2", name: "NO LEFT TURN" },
  { category: "Regulatory", code: "R3-5", name: "NO U-TURN" },
  { category: "Regulatory", code: "R3-7", name: "NO TURN ON RED" },
  { category: "Regulatory", code: "R3-8", name: "LEFT TURN YIELD ON GREEN" },

  { category: "Regulatory", code: "R4-1", name: "DO NOT PASS" },
  { category: "Regulatory", code: "R4-2", name: "PASS WITH CARE" },
  { category: "Regulatory", code: "R4-7", name: "KEEP RIGHT" },
  { category: "Regulatory", code: "R4-8", name: "KEEP LEFT" },

  { category: "Regulatory", code: "R5-1", name: "DO NOT ENTER" },
  { category: "Regulatory", code: "R5-2", name: "WRONG WAY" },

  { category: "Regulatory", code: "R6-1", name: "ONE WAY" },
  { category: "Regulatory", code: "R6-2", name: "DIVIDED HIGHWAY BEGINS" },
  { category: "Regulatory", code: "R6-3", name: "DIVIDED HIGHWAY ENDS" },

  // Parking / stopping (common)
  { category: "Regulatory", code: "R7-1", name: "NO PARKING" },
  { category: "Regulatory", code: "R7-2", name: "NO PARKING ANY TIME" },
  { category: "Regulatory", code: "R7-3", name: "NO PARKING HERE TO CORNER" },

  // -------------------------
  // WARNING (W-series)
  // -------------------------
  { category: "Warning", code: "W1-1", name: "TURN (Arrow)" },
  { category: "Warning", code: "W1-2", name: "CURVE (Arrow)" },
  { category: "Warning", code: "W1-3", name: "REVERSE TURN" },
  { category: "Warning", code: "W1-4", name: "REVERSE CURVE" },
  { category: "Warning", code: "W1-5", name: "WINDING ROAD" },
  { category: "Warning", code: "W1-6", name: "ONE DIRECTION LARGE ARROW" },
  { category: "Warning", code: "W1-7", name: "TWO DIRECTION LARGE ARROW" },
  { category: "Warning", code: "W1-8", name: "CHEVRON ALIGNMENT" },
  { category: "Warning", code: "W1-10", name: "TURN/ADVISORY SPEED (Plaque use)" },
  { category: "Warning", code: "W1-11", name: "HAIRPIN CURVE" },

  { category: "Warning", code: "W2-1", name: "CROSSROAD" },
  { category: "Warning", code: "W2-2", name: "SIDE ROAD" },
  { category: "Warning", code: "W2-3", name: "T-INTERSECTION" },
  { category: "Warning", code: "W2-4", name: "CROSS TRAFFIC DOES NOT STOP" },
  { category: "Warning", code: "W2-5", name: "MERGE" },
  { category: "Warning", code: "W2-6", name: "NARROW BRIDGE" },
  { category: "Warning", code: "W2-7", name: "ROAD NARROWS" },
  { category: "Warning", code: "W2-8", name: "SINGLE LANE ROAD AHEAD" },

  { category: "Warning", code: "W3-1", name: "STOP AHEAD" },
  { category: "Warning", code: "W3-2", name: "YIELD AHEAD" },
  { category: "Warning", code: "W3-3", name: "SIGNAL AHEAD" },
  { category: "Warning", code: "W3-4", name: "BEGIN DIVIDED HIGHWAY" },
  { category: "Warning", code: "W3-5", name: "END DIVIDED HIGHWAY" },

  { category: "Warning", code: "W4-1", name: "MERGE" },
  { category: "Warning", code: "W4-2", name: "LANE ENDS" },
  { category: "Warning", code: "W4-3", name: "RIGHT LANE ENDS" },
  { category: "Warning", code: "W4-4", name: "LEFT LANE ENDS" },

  { category: "Warning", code: "W5-1", name: "ROAD NARROWS" },
  { category: "Warning", code: "W5-2", name: "NARROW BRIDGE" },

  { category: "Warning", code: "W7-1", name: "HILL" },
  { category: "Warning", code: "W7-2", name: "TRUCKS USE LOW GEAR" },

  { category: "Warning", code: "W8-1", name: "PAVEMENT ENDS" },
  { category: "Warning", code: "W8-5", name: "SLIPPERY WHEN WET" },
  { category: "Warning", code: "W8-9", name: "DIP" },
  { category: "Warning", code: "W8-18", name: "NO CENTER LINE" },

  { category: "Warning", code: "W11-2", name: "PEDESTRIAN CROSSING" },
  { category: "Warning", code: "W11-15", name: "TRAIL CROSSING" },
  { category: "Warning", code: "W11-1", name: "BICYCLE CROSSING" },
  { category: "Warning", code: "W11-3", name: "DEER CROSSING" },

  // -------------------------
  // SCHOOL (S-series / school warning signs)
  // -------------------------
  { category: "School", code: "S1-1", name: "SCHOOL" },
  { category: "School", code: "S1-2", name: "SCHOOL CROSSING" },
  { category: "School", code: "S2-1", name: "SCHOOL SPEED LIMIT (When Flashing / Times)" },

  // -------------------------
  // WORK ZONE / TTC (orange series commonly used)
  // -------------------------
  { category: "Work Zone (TTC)", code: "W20-1", name: "ROAD WORK AHEAD" },
  { category: "Work Zone (TTC)", code: "W20-2", name: "ROAD WORK NEXT ____ MILES" },
  { category: "Work Zone (TTC)", code: "W20-4", name: "ONE LANE ROAD AHEAD" },
  { category: "Work Zone (TTC)", code: "W20-7", name: "FLAGGER AHEAD" },
  { category: "Work Zone (TTC)", code: "W20-5", name: "RIGHT LANE CLOSED AHEAD" },
  { category: "Work Zone (TTC)", code: "W20-6", name: "LEFT LANE CLOSED AHEAD" },

  // -------------------------
  // RAILROAD (R15/W10 family commonly encountered)
  // -------------------------
  { category: "Railroad", code: "W10-1", name: "RAILROAD CROSSING AHEAD" },
  { category: "Railroad", code: "R15-1", name: "CROSSBUCK (Railroad Crossing)" },

  // -------------------------
  // BIKE / PED (common)
  // -------------------------
  { category: "Bike/Ped", code: "R9-3", name: "NO BICYCLES" },
  { category: "Bike/Ped", code: "R9-5", name: "BIKES YIELD TO PEDS" },
  { category: "Bike/Ped", code: "R9-6", name: "PEDESTRIANS YIELD TO BIKES" },
];
