export type VehicleAssetStatus = "active" | "in_service" | "out_of_service" | "retired";

export type VehicleAssetSource = {
  provider: string | null;
  externalId: string | null;
};

export type VehicleAsset = {
  id: string;
  orgId: string;
  unitNumber: string;
  truckNumber: string | null;
  make: string | null;
  model: string | null;
  year: number | null;
  vin: string | null;
  serialNumber: string | null;
  licensePlate: string | null;
  inServiceDate: number | null;
  status: VehicleAssetStatus | null;
  odometer: number | null;
  engineHours: number | null;
  notes: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdByName: string | null;
  updatedByName: string | null;
  department?: string | null;
  location?: string | null;
  source?: VehicleAssetSource | null;
};