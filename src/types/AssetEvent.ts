// src/types/AssetEvent.ts
export type AssetEventKind = "INSTALL" | "INSPECTION" | "REPAIR" | "REPLACE" | "NOTE";

export type AssetEvent = {
  id: string;
  orgId: string;
  assetId: string;

  kind: AssetEventKind;

  at: number;                  // event time (epoch ms)
  byUid?: string | null;
  byName?: string | null;
  byDisplayName?: string | null;
  byEmail?: string | null;
  actorUid?: string | null;
  actorName?: string | null;
  actorDisplayName?: string | null;
  actorEmail?: string | null;

  workOrderId?: string | null;

  notes?: string | null;
  photoIds?: string[] | null;  // maps to photoIdsJson in SQLite

  details?: Record<string, any> | null;  // maps to detailsJson in SQLite

  createdAt: number;           // epoch ms
  updatedAt: number;           // epoch ms
};
