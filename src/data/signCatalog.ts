/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGN CATALOG - MUTCD Sign Database
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Comprehensive catalog of common traffic signs based on the Manual on Uniform
 * Traffic Control Devices (MUTCD) standards.
 * 
 * Categories:
 * - Regulatory: Control traffic (STOP, YIELD, Speed Limit, etc.)
 * - Warning: Alert drivers to hazards (Curve, Intersection, etc.)
 * - Guide: Provide direction and service information
 * - Temporary Traffic Control: Construction/maintenance zones
 * - School: School zone signs
 * - Railroad: Railroad crossing signs
 * - Other: Custom or non-standard signs
 */

import type { SignCategory } from "../types/workItem";

export type SignCatalogItem = {
  category: SignCategory;
  code: string;            // MUTCD code (e.g., "R1-1") or custom identifier
  name: string;            // Display name (e.g., "STOP")
  needsValue?: boolean;    // True if sign requires a value (speed limit, clearance, etc.)
};

export const SIGN_CATALOG: SignCatalogItem[] = [
  // ═══════════════════════════════════════════════════════════════════════════
  // REGULATORY SIGNS (R-Series)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Stop & Yield
  { category: "Regulatory", code: "R1-1", name: "STOP" },
  { category: "Regulatory", code: "R1-2", name: "YIELD" },
  { category: "Regulatory", code: "R1-3", name: "ALL WAY" },
  { category: "Regulatory", code: "R1-4", name: "4-WAY" },
  
  // Speed Limit
  { category: "Regulatory", code: "R2-1", name: "SPEED LIMIT", needsValue: true },
  { category: "Regulatory", code: "R2-2", name: "TRUCK SPEED LIMIT", needsValue: true },
  { category: "Regulatory", code: "R2-3", name: "NIGHT SPEED LIMIT", needsValue: true },
  { category: "Regulatory", code: "R2-4", name: "MINIMUM SPEED", needsValue: true },
  
  // Turn Restrictions
  { category: "Regulatory", code: "R3-1", name: "NO RIGHT TURN" },
  { category: "Regulatory", code: "R3-2", name: "NO LEFT TURN" },
  { category: "Regulatory", code: "R3-3", name: "NO TURNS" },
  { category: "Regulatory", code: "R3-4", name: "NO U-TURN" },
  { category: "Regulatory", code: "R3-5L", name: "LEFT TURN ONLY" },
  { category: "Regulatory", code: "R3-5R", name: "RIGHT TURN ONLY" },
  { category: "Regulatory", code: "R3-7", name: "LEFT LANE MUST TURN LEFT" },
  { category: "Regulatory", code: "R3-8", name: "CENTER LANE MUST TURN LEFT" },
  
  // Movement Regulations
  { category: "Regulatory", code: "R4-1", name: "DO NOT PASS" },
  { category: "Regulatory", code: "R4-2", name: "PASS WITH CARE" },
  { category: "Regulatory", code: "R4-3", name: "SLOWER TRAFFIC KEEP RIGHT" },
  { category: "Regulatory", code: "R4-7", name: "KEEP RIGHT" },
  { category: "Regulatory", code: "R4-7a", name: "KEEP RIGHT (SYMBOL)" },
  { category: "Regulatory", code: "R4-8", name: "KEEP LEFT" },
  { category: "Regulatory", code: "R4-8a", name: "KEEP LEFT (SYMBOL)" },
  
  // Exclusion Signs
  { category: "Regulatory", code: "R5-1", name: "DO NOT ENTER" },
  { category: "Regulatory", code: "R5-1a", name: "WRONG WAY" },
  { category: "Regulatory", code: "R5-2", name: "NO TRUCKS" },
  { category: "Regulatory", code: "R5-3", name: "NO BICYCLES" },
  { category: "Regulatory", code: "R5-6", name: "NO PEDESTRIANS" },
  { category: "Regulatory", code: "R5-10", name: "NO PEDESTRIANS CROSSING" },
  { category: "Regulatory", code: "R5-11", name: "NO HITCHHIKING" },
  
  // One Way
  { category: "Regulatory", code: "R6-1", name: "ONE WAY" },
  { category: "Regulatory", code: "R6-2", name: "ONE WAY (LEFT ARROW)" },
  { category: "Regulatory", code: "R6-3", name: "ONE WAY (RIGHT ARROW)" },
  
  // Parking Regulations
  { category: "Regulatory", code: "R7-1", name: "NO PARKING" },
  { category: "Regulatory", code: "R7-2", name: "NO PARKING (SYMBOL)" },
  { category: "Regulatory", code: "R7-3", name: "NO STOPPING" },
  { category: "Regulatory", code: "R7-4", name: "NO STANDING" },
  { category: "Regulatory", code: "R7-8", name: "NO PARKING ANY TIME" },
  { category: "Regulatory", code: "R7-21", name: "HANDICAPPED PARKING" },
  { category: "Regulatory", code: "R7-107", name: "TOW-AWAY ZONE" },
  
  // Traffic Signals
  { category: "Regulatory", code: "R10-10", name: "NO TURN ON RED" },
  { category: "Regulatory", code: "R10-11", name: "LEFT TURN YIELD ON GREEN" },
  { category: "Regulatory", code: "R10-12", name: "STOP HERE ON RED" },
  
  // HOV/Carpool
  { category: "Regulatory", code: "R3-9", name: "HOV LANE AHEAD" },
  { category: "Regulatory", code: "R3-10", name: "CARPOOL LANE AHEAD" },
  
  // Miscellaneous Regulatory
  { category: "Regulatory", code: "R11-2", name: "ROAD CLOSED" },
  { category: "Regulatory", code: "R11-4", name: "BRIDGE CLOSED" },
  { category: "Regulatory", code: "R12-1", name: "WEIGHT LIMIT", needsValue: true },
  { category: "Regulatory", code: "R12-2", name: "AXLE WEIGHT LIMIT", needsValue: true },
  { category: "Regulatory", code: "R12-5", name: "BRIDGE WEIGHT LIMIT", needsValue: true },
  { category: "Regulatory", code: "R15-1", name: "RAILROAD CROSSING" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // WARNING SIGNS (W-Series)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Curves & Turns
  { category: "Warning", code: "W1-1", name: "CURVE (RIGHT)" },
  { category: "Warning", code: "W1-1L", name: "CURVE (LEFT)" },
  { category: "Warning", code: "W1-2", name: "TURN (RIGHT)" },
  { category: "Warning", code: "W1-2L", name: "TURN (LEFT)" },
  { category: "Warning", code: "W1-3", name: "REVERSE CURVE (RIGHT)" },
  { category: "Warning", code: "W1-3L", name: "REVERSE CURVE (LEFT)" },
  { category: "Warning", code: "W1-4", name: "REVERSE TURN (RIGHT)" },
  { category: "Warning", code: "W1-4L", name: "REVERSE TURN (LEFT)" },
  { category: "Warning", code: "W1-5", name: "WINDING ROAD (RIGHT)" },
  { category: "Warning", code: "W1-5L", name: "WINDING ROAD (LEFT)" },
  { category: "Warning", code: "W1-6", name: "LARGE ARROW (ONE DIRECTION)" },
  { category: "Warning", code: "W1-7", name: "LARGE ARROW (TWO DIRECTION)" },
  { category: "Warning", code: "W1-8", name: "CHEVRON ALIGNMENT" },
  { category: "Warning", code: "W1-10", name: "COMBINATION HORIZONTAL ALIGNMENT" },
  { category: "Warning", code: "W1-11", name: "HAIRPIN CURVE" },
  
  // Intersections
  { category: "Warning", code: "W2-1", name: "CROSS ROAD" },
  { category: "Warning", code: "W2-2", name: "SIDE ROAD (RIGHT)" },
  { category: "Warning", code: "W2-2L", name: "SIDE ROAD (LEFT)" },
  { category: "Warning", code: "W2-3", name: "SIDE ROAD (PERPENDICULAR)" },
  { category: "Warning", code: "W2-4", name: "T-INTERSECTION" },
  { category: "Warning", code: "W2-5", name: "Y-INTERSECTION" },
  { category: "Warning", code: "W2-6", name: "CIRCULAR INTERSECTION" },
  { category: "Warning", code: "W2-7", name: "OFFSET SIDE ROADS" },
  
  // Advance Warning
  { category: "Warning", code: "W3-1", name: "STOP AHEAD" },
  { category: "Warning", code: "W3-2", name: "YIELD AHEAD" },
  { category: "Warning", code: "W3-3", name: "SIGNAL AHEAD" },
  { category: "Warning", code: "W3-4", name: "BE PREPARED TO STOP" },
  { category: "Warning", code: "W3-5", name: "REDUCED SPEED LIMIT AHEAD" },
  
  // Merges & Lane Changes
  { category: "Warning", code: "W4-1", name: "MERGE (RIGHT)" },
  { category: "Warning", code: "W4-1L", name: "MERGE (LEFT)" },
  { category: "Warning", code: "W4-2", name: "LANE ENDS (RIGHT)" },
  { category: "Warning", code: "W4-2L", name: "LANE ENDS (LEFT)" },
  { category: "Warning", code: "W4-3", name: "ADDED LANE" },
  { category: "Warning", code: "W4-5", name: "ENTERING ROADWAY MERGE" },
  { category: "Warning", code: "W9-1", name: "LANE ENDS MERGE LEFT" },
  { category: "Warning", code: "W9-2", name: "LANE ENDS MERGE RIGHT" },
  
  // Narrow Roads
  { category: "Warning", code: "W5-1", name: "ROAD NARROWS" },
  { category: "Warning", code: "W5-2", name: "NARROW BRIDGE" },
  { category: "Warning", code: "W5-3", name: "ONE LANE BRIDGE" },
  { category: "Warning", code: "W5-4", name: "DIVIDED HIGHWAY ENDS" },
  
  // Divided Highway
  { category: "Warning", code: "W6-1", name: "DIVIDED HIGHWAY BEGINS" },
  { category: "Warning", code: "W6-2", name: "DIVIDED HIGHWAY ENDS" },
  { category: "Warning", code: "W6-3", name: "TWO-WAY TRAFFIC" },
  
  // Hill Signs
  { category: "Warning", code: "W7-1", name: "HILL (DOWNGRADE)" },
  { category: "Warning", code: "W7-1a", name: "HILL WITH GRADE PERCENTAGE", needsValue: true },
  { category: "Warning", code: "W7-2", name: "STEEP HILL" },
  { category: "Warning", code: "W7-3", name: "RUNAWAY TRUCK RAMP" },
  { category: "Warning", code: "W7-5", name: "HILL BLOCKS VIEW" },
  
  // Pavement Conditions
  { category: "Warning", code: "W8-1", name: "BUMP" },
  { category: "Warning", code: "W8-2", name: "DIP" },
  { category: "Warning", code: "W8-3", name: "PAVEMENT ENDS" },
  { category: "Warning", code: "W8-4", name: "SOFT SHOULDER" },
  { category: "Warning", code: "W8-5", name: "SLIPPERY WHEN WET" },
  { category: "Warning", code: "W8-6", name: "TRUCK CROSSING" },
  { category: "Warning", code: "W8-7", name: "LOOSE GRAVEL" },
  { category: "Warning", code: "W8-8", name: "ROUGH ROAD" },
  { category: "Warning", code: "W8-9", name: "LOW SHOULDER" },
  { category: "Warning", code: "W8-10", name: "GROOVED PAVEMENT" },
  { category: "Warning", code: "W8-15", name: "STEEL PLATE AHEAD" },
  { category: "Warning", code: "W8-17", name: "SHOULDER DROP-OFF" },
  { category: "Warning", code: "W8-18", name: "ROAD MAY FLOOD" },
  
  // Crossings
  { category: "Warning", code: "W10-1", name: "RAILROAD CROSSING ADVANCE WARNING" },
  { category: "Warning", code: "W10-2", name: "RAILROAD CROSSING (2 TRACKS)" },
  { category: "Warning", code: "W10-3", name: "RAILROAD CROSSING (3+ TRACKS)" },
  { category: "Warning", code: "W10-4", name: "HIGHWAY-RAIL INTERSECTION" },
  { category: "Warning", code: "W11-1", name: "BICYCLE CROSSING" },
  { category: "Warning", code: "W11-2", name: "PEDESTRIAN CROSSING" },
  { category: "Warning", code: "W11-3", name: "DEER CROSSING" },
  { category: "Warning", code: "W11-4", name: "CATTLE CROSSING" },
  { category: "Warning", code: "W11-5", name: "FARM EQUIPMENT CROSSING" },
  { category: "Warning", code: "W11-6", name: "SNOWMOBILE CROSSING" },
  { category: "Warning", code: "W11-15", name: "HORSE CROSSING" },
  
  // Advisory Speeds
  { category: "Warning", code: "W13-1", name: "ADVISORY SPEED", needsValue: true },
  { category: "Warning", code: "W13-2", name: "ADVISORY EXIT SPEED", needsValue: true },
  { category: "Warning", code: "W13-3", name: "ADVISORY RAMP SPEED", needsValue: true },
  
  // Miscellaneous Warning
  { category: "Warning", code: "W14-1", name: "NO PASSING ZONE" },
  { category: "Warning", code: "W14-2", name: "PASS WITH CARE" },
  { category: "Warning", code: "W14-3", name: "NO PASSING ZONE AHEAD" },
  { category: "Warning", code: "W16-7", name: "FINES HIGHER IN WORK ZONE" },
  { category: "Warning", code: "W17-1", name: "SPEED HUMP" },
  { category: "Warning", code: "W20-1", name: "ROAD WORK AHEAD" },
  { category: "Warning", code: "W20-2", name: "ROAD CONSTRUCTION" },
  { category: "Warning", code: "W20-3", name: "DETOUR AHEAD" },
  { category: "Warning", code: "W20-7", name: "FLAGGER AHEAD" },
  { category: "Warning", code: "W21-1", name: "DOUBLE ARROW" },
  { category: "Warning", code: "W21-2", name: "SINGLE ARROW (LEFT)" },
  { category: "Warning", code: "W21-3", name: "SINGLE ARROW (RIGHT)" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // GUIDE SIGNS (D-Series & G-Series)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // Services
  { category: "Guide", code: "D9-1", name: "GAS" },
  { category: "Guide", code: "D9-2", name: "FOOD" },
  { category: "Guide", code: "D9-3", name: "LODGING" },
  { category: "Guide", code: "D9-6", name: "HOSPITAL" },
  { category: "Guide", code: "D9-7", name: "CAMPING" },
  { category: "Guide", code: "D9-8", name: "TRAILER SITES" },
  { category: "Guide", code: "D9-9", name: "TELEPHONE" },
  { category: "Guide", code: "D9-10", name: "DIESEL" },
  { category: "Guide", code: "D9-11", name: "RV SANITARY STATION" },
  { category: "Guide", code: "D9-18", name: "PARKING" },
  { category: "Guide", code: "D9-18a", name: "PARKING (P SYMBOL)" },
  
  // Recreational
  { category: "Guide", code: "D9-12", name: "PICNIC AREA" },
  { category: "Guide", code: "D9-13", name: "HIKING TRAIL" },
  { category: "Guide", code: "D9-14", name: "FISHING" },
  { category: "Guide", code: "D9-15", name: "BOAT LAUNCH" },
  { category: "Guide", code: "D9-16", name: "SWIMMING" },
  { category: "Guide", code: "D9-17", name: "SNOWMOBILE TRAIL" },
  
  // Information
  { category: "Guide", code: "D9-20", name: "TOURIST INFORMATION" },
  { category: "Guide", code: "I-1", name: "REST AREA" },
  { category: "Guide", code: "I-2", name: "REST AREA AHEAD" },
  { category: "Guide", code: "I-5", name: "AIRPORT" },
  { category: "Guide", code: "I-7", name: "BUS STATION" },
  { category: "Guide", code: "I-8", name: "TRAIN STATION" },
  
  // Mile Markers & Exit Numbers
  { category: "Guide", code: "D10-1", name: "MILE MARKER" },
  { category: "Guide", code: "E1-5", name: "EXIT NUMBER" },
  
  // Street Name
  { category: "Guide", code: "STREET", name: "STREET NAME SIGN" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // TEMPORARY TRAFFIC CONTROL (Construction/Work Zone)
  // ═══════════════════════════════════════════════════════════════════════════
  
  { category: "TemporaryTrafficControl", code: "W20-1", name: "ROAD WORK AHEAD" },
  { category: "TemporaryTrafficControl", code: "W20-2", name: "ROAD CONSTRUCTION AHEAD" },
  { category: "TemporaryTrafficControl", code: "W20-3", name: "DETOUR AHEAD" },
  { category: "TemporaryTrafficControl", code: "W20-4", name: "ROAD CLOSED AHEAD" },
  { category: "TemporaryTrafficControl", code: "W20-7", name: "FLAGGER AHEAD" },
  { category: "TemporaryTrafficControl", code: "W20-7a", name: "FLAGGER SYMBOL" },
  { category: "TemporaryTrafficControl", code: "W21-1", name: "WORKERS AHEAD" },
  { category: "TemporaryTrafficControl", code: "W21-103", name: "SHOULDER WORK" },
  { category: "TemporaryTrafficControl", code: "W21-106", name: "SURVEY CREW" },
  { category: "TemporaryTrafficControl", code: "W21-107", name: "UTILITY WORK AHEAD" },
  { category: "TemporaryTrafficControl", code: "W23-1", name: "WORK ZONE ENDS" },
  { category: "TemporaryTrafficControl", code: "W23-2", name: "END ROAD WORK" },
  { category: "TemporaryTrafficControl", code: "G20-2", name: "WORKERS" },
  { category: "TemporaryTrafficControl", code: "M4-2", name: "END CONSTRUCTION" },
  { category: "TemporaryTrafficControl", code: "M4-4", name: "SPEED LIMIT AHEAD" },
  { category: "TemporaryTrafficControl", code: "M4-5", name: "SPEED ZONE AHEAD" },
  { category: "TemporaryTrafficControl", code: "M4-8", name: "FRESH OIL" },
  { category: "TemporaryTrafficControl", code: "M4-9", name: "LOOSE GRAVEL" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SCHOOL SIGNS
  // ═══════════════════════════════════════════════════════════════════════════
  
  { category: "School", code: "S1-1", name: "SCHOOL" },
  { category: "School", code: "S3-1", name: "SCHOOL BUS STOP AHEAD" },
  { category: "School", code: "S4-1", name: "SCHOOL SPEED LIMIT", needsValue: true },
  { category: "School", code: "S4-2", name: "SCHOOL SPEED LIMIT (WHEN CHILDREN PRESENT)", needsValue: true },
  { category: "School", code: "S4-3", name: "SCHOOL ZONE" },
  { category: "School", code: "S4-4", name: "END SCHOOL ZONE" },
  { category: "School", code: "S5-1", name: "SCHOOL CROSSING" },
  { category: "School", code: "S5-2", name: "SCHOOL ADVANCE CROSSING" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RAILROAD CROSSING SIGNS
  // ═══════════════════════════════════════════════════════════════════════════
  
  { category: "Railroad", code: "R15-1", name: "RAILROAD CROSSING (CROSSBUCK)" },
  { category: "Railroad", code: "R15-2", name: "TRACKS OUT OF SERVICE" },
  { category: "Railroad", code: "R15-3", name: "EXEMPT (RAILROAD)" },
  { category: "Railroad", code: "W10-1", name: "RAILROAD ADVANCE WARNING" },
  { category: "Railroad", code: "W10-2", name: "2 TRACKS" },
  { category: "Railroad", code: "W10-3", name: "3 OR MORE TRACKS" },
  { category: "Railroad", code: "W10-5", name: "LOW GROUND CLEARANCE" },
  { category: "Railroad", code: "R8-8", name: "DO NOT STOP ON TRACKS" },
  
  // ═══════════════════════════════════════════════════════════════════════════
  // OTHER / CUSTOM
  // ═══════════════════════════════════════════════════════════════════════════
  
  { category: "Other", code: "CUSTOM", name: "CUSTOM SIGN" },
  { category: "Other", code: "DAMAGED", name: "DAMAGED/ILLEGIBLE SIGN" },
  { category: "Other", code: "MISSING", name: "MISSING SIGN" },
];
