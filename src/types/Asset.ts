// src/types/Asset.ts
export type AssetType = "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE";

export type AssetStatus = "ACTIVE" | "RETIRED";

export type Asset = {
  id: string;
  orgId: string;

  assetType: AssetType;
  subtype?: string | null;     // e.g. "STOP", "W_BEAM", "CMP_36"
  status: AssetStatus;

  lat: number;
  lng: number;

  createdAt: number;           // epoch ms
  updatedAt: number;           // epoch ms
  createdByUid?: string | null;
  createdByDisplayName?: string | null;

  installedAt?: number | null;

  lastEventAt?: number | null;
  lastInspectionAt?: number | null;

  details?: Record<string, any> | null;
};
