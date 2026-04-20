// src/types/ToolRecords.ts
export type ToolKind = "DMI" | "COUNTER" | "TAILGATE";

export type ToolRecordBase = {
  id: string;
  orgId: string;
  kind: ToolKind;
  createdAt: number;
  createdByUid?: string | null;
  deviceId?: string | null;
  appVersion?: string | null;
};

export type DmiRecord = ToolRecordBase & {
  kind: "DMI";
  startAt: number;
  endAt: number;
  startLat?: number | null;
  startLng?: number | null;
  endLat?: number | null;
  endLng?: number | null;
  distanceMeters: number;
};

export type CounterRecord = ToolRecordBase & {
  kind: "COUNTER";
  label: string;
  count: number;
  lat?: number | null;
  lng?: number | null;
};

export type TailgateRecord = ToolRecordBase & {
  kind: "TAILGATE";
  dateKey: string; // e.g. "2026-03-04"
  crew?: string[] | null; // uids or names (later)
  workTypes?: string[] | null;
  hazards?: string[] | null;
  ppe?: string[] | null;
  notes?: string | null;
};
