export type WorkStatus = "Needs" | "In Progress" | "Done" | "Deferred";
export type Priority = "Low" | "Medium" | "High" | "Urgent";
export type GeomType = "point" | "line";

export type LatLng = { lat: number; lng: number };

export type WorkOrderRow = {
  id: string;
  type: string;
  createdAt: number;
  updatedAt: number;
  status: WorkStatus;
  priority: Priority;
  note?: string | null;

  geomType: GeomType;
  lat?: number | null;
  lng?: number | null;
  lineJson?: string | null;

  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

export type SignDetailsRow = {
  workOrderId: string;
  signTypeId?: string | null;
  category?: string | null;
  condition?: string | null;
  action?: string | null;
  reflectivityIssue?: 0 | 1 | null;

  // MUTCD Sign Catalog fields
  signCategory?: string | null;     // MUTCD category (Regulatory, Warning, etc.)
  signCode?: string | null;         // MUTCD code (e.g., R1-1)
  signName?: string | null;         // MUTCD name (e.g., STOP)
  
  // Inspection sheet fields
  inspectionVisible?: 0 | 1 | null;      // Toggle state per work order
  reflectivityScore?: number | null;     // 1-10 rating
  delaminationScore?: number | null;     // 1-10 rating
  appearanceScore?: number | null;       // 1-10 rating
  postMaterial?: "Wood" | "Steel" | null;
  postConditionScore?: number | null;    // 1-10 rating
  inspectionLastSavedAt?: number | null; // epoch ms - timestamp of last inspection save
};

export type WorkOrderFilter = {
  types?: string[]; // ["Sign","Pothole"]
  status?: WorkStatus[];
  priority?: Priority[];
  signCategory?: string[]; // ["Regulatory","Warning"]
  signCondition?: string[]; // ["Damaged","Missing"]
};

export type BBox = { minLat: number; minLng: number; maxLat: number; maxLng: number };
