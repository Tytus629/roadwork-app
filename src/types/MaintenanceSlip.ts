export type MaintenanceSlipStatus = "open" | "scheduled" | "in_progress" | "resolved";

export type MaintenanceSlipSeverity = "low" | "medium" | "high" | "urgent";

export type MaintenanceSlipVehicleSource = "linked_asset" | "manual_entry";

export type MaintenanceSlipVehicleSnapshot = {
  unitNumber: string | null;
  truckNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  status: string | null;
  odometer: number | null;
  engineHours: number | null;
  vin: string | null;
  serialNumber: string | null;
  licensePlate: string | null;
};

export type MaintenanceSlipRequestType =
  | "inspection"
  | "service"
  | "repair"
  | "breakdown"
  | "other";

export type MaintenanceSlipServiceRequest = {
  requestType: MaintenanceSlipRequestType;
  requestedService: string | null;
  complaint: string | null;
  reportedLocation: string | null;
  safetySensitive: boolean | null;
  vehicleOutOfService: boolean | null;
  reportedOdometer: number | null;
  reportedEngineHours: number | null;
};

export type MaintenanceSlipNoteKind = "note" | "status";

export type MaintenanceSlipNote = {
  id: string;
  kind: MaintenanceSlipNoteKind;
  body: string;
  createdAt: number;
  createdByUid: string | null;
  createdByDisplayName: string | null;
  createdByEmail: string | null;
};

export type MaintenanceSlip = {
  id: string;
  orgId: string;
  vehicleAssetId: string | null;
  vehicleSource: MaintenanceSlipVehicleSource;
  vehicleSnapshot: MaintenanceSlipVehicleSnapshot | null;
  unitLabel: string;
  equipmentType: string | null;
  maintenanceCategory: string | null;
  systemArea: string | null;
  issueTitle: string;
  issueDescription: string | null;
  locationHint: string | null;
  readingLabel: string | null;
  preferredServiceDate: number | null;
  serviceRequest: MaintenanceSlipServiceRequest | null;
  status: MaintenanceSlipStatus;
  severity: MaintenanceSlipSeverity;
  createdAt: number;
  updatedAt: number;
  createdByUid: string | null;
  createdByDisplayName: string | null;
  createdByEmail: string | null;
  assignedToUid: string | null;
  assignedToName: string | null;
  assignedToEmail: string | null;
  deviceId: string | null;
  appVersion: string | null;
  notes: MaintenanceSlipNote[];
  lastStatusChangedAt: number | null;
  lastStatusChangedByUid: string | null;
  lastStatusChangedByDisplayName: string | null;
  lastStatusChangedByEmail: string | null;
  resolvedAt: number | null;
  resolvedByUid: string | null;
  resolvedByDisplayName: string | null;
  resolvedByEmail: string | null;
};

export const MAINTENANCE_SLIP_STATUSES: MaintenanceSlipStatus[] = [
  "open",
  "scheduled",
  "in_progress",
  "resolved",
];

export const MAINTENANCE_SLIP_SEVERITIES: MaintenanceSlipSeverity[] = [
  "low",
  "medium",
  "high",
  "urgent",
];

export function formatMaintenanceSlipStatus(status: MaintenanceSlipStatus): string {
  switch (status) {
    case "open":
      return "Open";
    case "scheduled":
      return "Scheduled";
    case "in_progress":
      return "In Progress";
    case "resolved":
      return "Resolved";
    default:
      return "Open";
  }
}

export function formatMaintenanceSlipSeverity(severity: MaintenanceSlipSeverity): string {
  switch (severity) {
    case "low":
      return "Low";
    case "medium":
      return "Medium";
    case "high":
      return "High";
    case "urgent":
      return "Urgent";
    default:
      return "Low";
  }
}
