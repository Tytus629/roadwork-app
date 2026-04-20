// src/workOrders/typeGroups.ts
//
// Canonical type-group classifier for work orders.
// Avoids string-matching scattered across UI files.

export type WorkOrderTypeGroup = "guardrail" | "sign" | "pavement" | "culvert" | "other";

const GUARDRAIL_ALIASES = new Set([
  "guardrail",
  "guard_rail",
  "guardrail",
  "guard rails",
  "guard rail",
]);

const SIGN_ALIASES = new Set([
  "sign",
  "signs",
  "sign_maintenance",
  "signmaintenance",
  "sign inspection",
  "sign_inspection",
]);

const PAVEMENT_ALIASES = new Set([
  "pothole",
  "pavement_repair",
  "pavement repair",
  "asphalt_patch",
  "asphalt patch",
  "roadway_surface_repair",
  "roadway surface repair",
  "asphalt", // legacy
]);

const CULVERT_ALIASES = new Set([
  "culvert",
  "culverts",
  "culvert_repair",
  "culvert repair",
  "drain_pipe",
  "drain pipe",
]);

export function getTypeGroup(typeRaw: string | null | undefined): WorkOrderTypeGroup {
  const t = (typeRaw ?? "").trim().toLowerCase();
  if (!t) return "other";
  if (GUARDRAIL_ALIASES.has(t)) return "guardrail";
  if (SIGN_ALIASES.has(t)) return "sign";
  if (PAVEMENT_ALIASES.has(t)) return "pavement";
  if (CULVERT_ALIASES.has(t)) return "culvert";
  return "other";
}
