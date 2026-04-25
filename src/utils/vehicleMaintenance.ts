import type {
  MaintenanceSlipServiceRequest,
  MaintenanceSlipVehicleSnapshot,
} from "../types/MaintenanceSlip";
import type { VehicleAsset } from "../types/VehicleAsset";

function trimString(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function parseOptionalNumber(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  const numeric = typeof value === "number" ? value : Number(String(value).trim());
  return Number.isFinite(numeric) ? numeric : null;
}

export function vehicleSnapshotFromAsset(asset: VehicleAsset): MaintenanceSlipVehicleSnapshot {
  return {
    unitNumber: trimString(asset.unitNumber),
    truckNumber: trimString(asset.truckNumber),
    make: trimString(asset.make),
    model: trimString(asset.model),
    year: asset.year ?? null,
    status: trimString(asset.status),
    odometer: asset.odometer ?? null,
    engineHours: asset.engineHours ?? null,
    vin: trimString(asset.vin),
    serialNumber: trimString(asset.serialNumber),
    licensePlate: trimString(asset.licensePlate),
  };
}

export function normalizeVehicleSnapshot(
  snapshot: Partial<MaintenanceSlipVehicleSnapshot> | null | undefined,
): MaintenanceSlipVehicleSnapshot | null {
  const out: MaintenanceSlipVehicleSnapshot = {
    unitNumber: trimString(snapshot?.unitNumber),
    truckNumber: trimString(snapshot?.truckNumber),
    make: trimString(snapshot?.make),
    model: trimString(snapshot?.model),
    year: parseOptionalNumber(snapshot?.year ?? null),
    status: trimString(snapshot?.status),
    odometer: parseOptionalNumber(snapshot?.odometer ?? null),
    engineHours: parseOptionalNumber(snapshot?.engineHours ?? null),
    vin: trimString(snapshot?.vin),
    serialNumber: trimString(snapshot?.serialNumber),
    licensePlate: trimString(snapshot?.licensePlate),
  };

  const hasAnyValue = Boolean(
    out.unitNumber ||
      out.truckNumber ||
      out.make ||
      out.model ||
      out.year != null ||
      out.status ||
      out.odometer != null ||
      out.engineHours != null ||
      out.vin ||
      out.serialNumber ||
      out.licensePlate,
  );

  return hasAnyValue ? out : null;
}

export function describeVehicleSnapshot(snapshot: MaintenanceSlipVehicleSnapshot | null | undefined): string {
  if (!snapshot) return "Vehicle";
  const unit = [snapshot.unitNumber, snapshot.truckNumber].filter(Boolean).join(" / ").trim();
  if (unit) return unit;
  const makeModel = [snapshot.make, snapshot.model].filter(Boolean).join(" ").trim();
  if (makeModel) return makeModel;
  if (snapshot.licensePlate) return snapshot.licensePlate;
  if (snapshot.vin) return snapshot.vin;
  return "Vehicle";
}

export function buildMaintenanceUnitLabel(
  snapshot: MaintenanceSlipVehicleSnapshot | null | undefined,
  fallback?: string | null,
): string {
  return trimString(fallback) ?? describeVehicleSnapshot(snapshot);
}

export function buildMaintenanceReadingLabel(
  snapshot: MaintenanceSlipVehicleSnapshot | null | undefined,
): string | null {
  if (!snapshot) return null;
  const bits: string[] = [];
  if (snapshot.odometer != null) bits.push(`${snapshot.odometer} mi`);
  if (snapshot.engineHours != null) bits.push(`${snapshot.engineHours} hrs`);
  return bits.length > 0 ? bits.join(" / ") : null;
}

export function defaultServiceRequest(
  partial?: Partial<MaintenanceSlipServiceRequest> | null,
): MaintenanceSlipServiceRequest {
  return {
    requestType: partial?.requestType ?? "repair",
    requestedService: trimString(partial?.requestedService),
    complaint: trimString(partial?.complaint),
    reportedLocation: trimString(partial?.reportedLocation),
    safetySensitive: partial?.safetySensitive ?? null,
    vehicleOutOfService: partial?.vehicleOutOfService ?? null,
    reportedOdometer: parseOptionalNumber(partial?.reportedOdometer ?? null),
    reportedEngineHours: parseOptionalNumber(partial?.reportedEngineHours ?? null),
  };
}

export function parseDateInputToEpoch(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function formatDateInput(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "";
  return new Date(value).toISOString().slice(0, 10);
}