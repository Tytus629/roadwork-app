import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getApp } from "@react-native-firebase/app";
import { requireOrgId } from "../org/requireOrg";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";
import type { VehicleAsset } from "../types/VehicleAsset";

type ListVehicleAssetsResponse = {
  assets: any[];
};

type GetVehicleAssetDetailResponse = {
  asset: any;
};

type CreateVehicleAssetResponse = {
  asset: any;
};

type UpdateVehicleAssetResponse = {
  asset: any;
};

export type VehicleAssetWriteInput = {
  unitNumber?: string;
  truckNumber?: string | null;
  make?: string | null;
  model?: string | null;
  year?: number | null;
  vin?: string | null;
  serialNumber?: string | null;
  licensePlate?: string | null;
  inServiceDate?: number | null;
  status?: VehicleAsset["status"] | null;
  odometer?: number | null;
  engineHours?: number | null;
  notes?: string | null;
};

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object") {
    const maybe = value as Record<string, any>;
    if (typeof maybe.toMillis === "function") {
      const ts = maybe.toMillis();
      return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
    }
    if (typeof maybe.seconds === "number") {
      return Math.trunc(maybe.seconds * 1000 + (typeof maybe.nanoseconds === "number" ? maybe.nanoseconds / 1e6 : 0));
    }
  }
  return null;
}

function normalizeAsset(raw: any): VehicleAsset {
  const src = (raw ?? {}) as Record<string, any>;
  return {
    id: String(src.id ?? ""),
    orgId: String(src.orgId ?? ""),
    unitNumber: String(src.unitNumber ?? ""),
    truckNumber: src.truckNumber ? String(src.truckNumber) : null,
    make: src.make ? String(src.make) : null,
    model: src.model ? String(src.model) : null,
    year: typeof src.year === "number" ? src.year : src.year == null ? null : Number(src.year),
    vin: src.vin ? String(src.vin) : null,
    serialNumber: src.serialNumber ? String(src.serialNumber) : null,
    licensePlate: src.licensePlate ? String(src.licensePlate) : null,
    inServiceDate: toMillis(src.inServiceDate),
    status: src.status ? String(src.status) as VehicleAsset["status"] : null,
    odometer: typeof src.odometer === "number" ? src.odometer : src.odometer == null ? null : Number(src.odometer),
    engineHours: typeof src.engineHours === "number" ? src.engineHours : src.engineHours == null ? null : Number(src.engineHours),
    notes: src.notes ? String(src.notes) : null,
    createdAt: toMillis(src.createdAt),
    updatedAt: toMillis(src.updatedAt),
    createdBy: src.createdBy ? String(src.createdBy) : null,
    updatedBy: src.updatedBy ? String(src.updatedBy) : null,
    createdByName: src.createdByName ? String(src.createdByName) : null,
    updatedByName: src.updatedByName ? String(src.updatedByName) : null,
  };
}

async function callVehicleMaintenanceFn<T>(name: string, payload: Record<string, any>): Promise<T> {
  if (__DEV__) {
    return callDevFunctionHttp<T>(name, payload);
  }

  const functions = getFunctions(getApp());
  const fn = httpsCallable(functions, name);
  const res = await fn(payload);
  return res.data as T;
}

export async function listVehicleAssets(args: {
  orgId: string;
  limit?: number;
  statuses?: Array<NonNullable<VehicleAsset["status"]>>;
}): Promise<VehicleAsset[]> {
  const orgId = requireOrgId(args.orgId);
  const data = await callVehicleMaintenanceFn<ListVehicleAssetsResponse>("roadwork_listVehicleAssets", {
    orgId,
    limit: args.limit ?? 150,
    statuses: args.statuses,
  });
  return (data?.assets ?? []).map(normalizeAsset);
}

export async function getVehicleAssetDetail(args: {
  orgId: string;
  vehicleAssetId: string;
}): Promise<VehicleAsset> {
  const orgId = requireOrgId(args.orgId);
  const data = await callVehicleMaintenanceFn<GetVehicleAssetDetailResponse>("roadwork_getVehicleAssetDetail", {
    orgId,
    vehicleAssetId: args.vehicleAssetId,
  });
  return normalizeAsset(data?.asset ?? {});
}

export async function createVehicleAsset(args: {
  orgId: string;
  asset: VehicleAssetWriteInput;
}): Promise<VehicleAsset> {
  const orgId = requireOrgId(args.orgId);
  const unitNumber = String(args.asset?.unitNumber ?? "").trim();
  if (!unitNumber) {
    throw new Error("unitNumber is required.");
  }

  const data = await callVehicleMaintenanceFn<CreateVehicleAssetResponse>("roadwork_createVehicleAsset", {
    orgId,
    ...args.asset,
    unitNumber,
  });
  return normalizeAsset(data?.asset ?? {});
}

export async function updateVehicleAsset(args: {
  orgId: string;
  vehicleAssetId: string;
  patch: VehicleAssetWriteInput;
}): Promise<VehicleAsset> {
  const orgId = requireOrgId(args.orgId);
  const vehicleAssetId = String(args.vehicleAssetId ?? "").trim();
  if (!vehicleAssetId) {
    throw new Error("vehicleAssetId is required.");
  }

  const data = await callVehicleMaintenanceFn<UpdateVehicleAssetResponse>("roadwork_updateVehicleAsset", {
    orgId,
    vehicleAssetId,
    ...(args.patch ?? {}),
  });
  return normalizeAsset(data?.asset ?? {});
}