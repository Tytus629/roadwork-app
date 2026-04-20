// src/types/WorkOrder.ts
//
// Status / Priority values match what SQLite stores — no mapping needed.
import type {
  CulvertDetails,
  GuardrailDetails,
  PavementRepairDetails,
  SignDetailsInfo,
} from "./workItem";
import type { AssetType } from "./Asset";

export type WorkOrderStatus = "Needs" | "In Progress" | "Done" | "Deferred";

export type WorkOrderPriority = "None" | "Low" | "Medium" | "High" | "Urgent";

export type GeometryType = "point" | "line";

export type LatLng = { lat: number; lng: number };

export type WorkOrderDetails =
  | PavementRepairDetails
  | SignDetailsInfo
  | CulvertDetails
  | GuardrailDetails
  | Record<string, any>;

export type WorkOrder = {
  id: string;
  orgId: string;

  // matches SQLite column name
  type: string;

  status: WorkOrderStatus;
  priority: WorkOrderPriority;

  // matches SQLite column name
  geomType: GeometryType;

  // POINT: lat/lng
  lat?: number | null;
  lng?: number | null;

  // LINE: stored as JSON string in SQLite column lineJson
  line?: LatLng[] | null;

  // bbox required for all rows
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;

  note?: string | null;

  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms

  // production metadata
  createdByUid?: string | null;
  createdByEmail?: string | null;
  createdByFirstName?: string | null;
  createdByLastName?: string | null;
  createdByDisplayName?: string | null;
  assignedToUid?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;

  // assets (coming next)
  assetId?: string | null;
  assetType?: AssetType | null;
  assetMatch?: {
    method: "USER_SELECTED" | "AUTO_MATCH" | "AUTO_CREATE";
    confidence?: number;
    radiusM?: number;
  } | null;

  // detailsJson
  details?: WorkOrderDetails | null;
};
