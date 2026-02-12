export type AsphaltMixKey =
  | "generic_hma"
  | "g_mix"
  | "s_mix"
  | "b_mix"
  | "warm_mix"
  | "cold_patch";

export type AsphaltMix = {
  key: AsphaltMixKey;
  label: string;
  // density in lb/ft^3 (field-friendly); convert to tons later
  densityLbPerFt3: number;
  note?: string;
};

// NOTE: These are starting defaults. Different plants/mixes vary.
// We'll add an "Override density" input in the UI so crews can match their ticket.
export const ASPHALT_MIXES: AsphaltMix[] = [
  { key: "generic_hma", label: "Generic HMA (default)", densityLbPerFt3: 145, note: "Common estimate" },
  { key: "g_mix", label: "G-Mix", densityLbPerFt3: 145, note: "Adjust per plant ticket" },
  { key: "s_mix", label: "S-Mix", densityLbPerFt3: 147, note: "Adjust per plant ticket" },
  { key: "b_mix", label: "B-Mix", densityLbPerFt3: 144, note: "Adjust per plant ticket" },
  { key: "warm_mix", label: "Warm Mix", densityLbPerFt3: 143, note: "Often slightly lower density" },
  { key: "cold_patch", label: "Cold Patch (bag)", densityLbPerFt3: 132, note: "Varies widely by product" },
];
