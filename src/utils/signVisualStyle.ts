import { getSignTypeById } from "./signTypeLookup";
import { normalizeSignEntries } from "./signAssetDetails";

export type SignVisualKind =
  | "STOP"
  | "YIELD"
  | "SPEED_LIMIT"
  | "WARNING"
  | "SCHOOL"
  | "RAILROAD"
  | "NO_PARKING"
  | "ONE_WAY"
  | "STREET_NAME"
  | "UNKNOWN";

export type SignVisualShape =
  | "octagon"
  | "triangle"
  | "rectangle"
  | "diamond"
  | "pentagon"
  | "crossbuck"
  | "circle"
  | "bar"
  | "street"
  | "unknown";

export type SignVisualStyle = {
  kind: SignVisualKind;
  shape: SignVisualShape;
  fillColor: string;
  borderColor: string;
  textColor: string;
  shortLabel: string;
  rotationDeg?: number | null;
  normalizedType: string | null;
  usedFallback: boolean;
};

export type SignVisualInput = {
  subtype?: unknown;
  details?: Record<string, unknown> | null;
  source?: Record<string, unknown> | null;
};

type EmblemSpec = {
  shape: SignVisualShape;
  fillColor: string;
  borderColor: string;
  textColor: string;
  shortLabel: string;
  kind: SignVisualKind;
};

const DIRECT_KEYS = [
  "subtype",
  "type",
  "signType",
  "signTypeId",
  "category",
  "signCategory",
  "signName",
  "name",
  "label",
  "mutcdCode",
  "MUTCDCode",
  "code",
  "signCode",
] as const;

const NESTED_KEYS = ["sign", "signDetails", "findings", "meta", "metadata"] as const;

const STYLE_BY_KIND: Record<
  SignVisualKind,
  Omit<SignVisualStyle, "kind" | "normalizedType" | "usedFallback">
> = {
  STOP: {
    shape: "octagon",
    fillColor: "#dc2626",
    borderColor: "#111827",
    textColor: "#ffffff",
    shortLabel: "STOP",
  },
  YIELD: {
    shape: "triangle",
    fillColor: "#dc2626",
    borderColor: "#111827",
    textColor: "#ffffff",
    shortLabel: "YLD",
  },
  SPEED_LIMIT: {
    shape: "rectangle",
    fillColor: "#ffffff",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel: "SPD",
  },
  WARNING: {
    shape: "diamond",
    fillColor: "#facc15",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel: "!",
  },
  SCHOOL: {
    shape: "pentagon",
    fillColor: "#a3e635",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel: "SCH",
  },
  RAILROAD: {
    shape: "crossbuck",
    fillColor: "#ffffff",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel: "RR",
  },
  NO_PARKING: {
    shape: "rectangle",
    fillColor: "#ffffff",
    borderColor: "#111827",
    textColor: "#dc2626",
    shortLabel: "NP",
  },
  ONE_WAY: {
    shape: "bar",
    fillColor: "#111827",
    borderColor: "#111827",
    textColor: "#ffffff",
    shortLabel: "1W",
  },
  STREET_NAME: {
    shape: "street",
    fillColor: "#166534",
    borderColor: "#111827",
    textColor: "#ffffff",
    shortLabel: "ST",
  },
  UNKNOWN: {
    shape: "unknown",
    fillColor: "#9ca3af",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel: "?",
  },
};

function normalizeToken(raw: unknown): string | null {
  const text = String(raw ?? "").trim();
  if (!text) return null;
  const normalized = text
    .replace(/[_]+/g, " ")
    .replace(/[^a-zA-Z0-9\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
  return normalized.length ? normalized : null;
}

function compactToken(token: string): string {
  return token.replace(/[^A-Z0-9]/g, "");
}

function pushCandidate(candidates: string[], raw: unknown) {
  const token = normalizeToken(raw);
  if (!token) return;
  candidates.push(token);
}

function getObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pushFromRecord(candidates: string[], rec: Record<string, unknown> | null | undefined) {
  if (!rec) return;
  for (const key of DIRECT_KEYS) {
    pushCandidate(candidates, rec[key]);
  }
}

function collectCandidates(input: SignVisualInput): string[] {
  const out: string[] = [];
  pushCandidate(out, input.subtype);

  const details = getObject(input.details);
  const source = getObject(input.source);
  pushFromRecord(out, source);
  pushFromRecord(out, details);

  for (const key of NESTED_KEYS) {
    const nested = getObject(details?.[key]);
    pushFromRecord(out, nested);
  }

  const signs = Array.isArray(details?.signs) ? (details?.signs as unknown[]) : null;
  if (signs?.length) {
    const first = getObject(signs[0]);
    pushFromRecord(out, first);
    pushCandidate(out, first?.signLabel);
  }

  const normalizedSigns = normalizeSignEntries((details as Record<string, any> | null) ?? null);
  const primarySign = normalizedSigns[0] ?? null;
  if (primarySign) {
    pushCandidate(out, primarySign.signTypeId);
    pushCandidate(out, primarySign.signLabel);
    pushCandidate(out, primarySign.signCode);
  }

  const signTypeIdRaw = details?.signTypeId ?? getObject(details?.sign)?.signTypeId;
  if (typeof signTypeIdRaw === "string" && signTypeIdRaw.trim()) {
    const found = getSignTypeById(signTypeIdRaw) ?? getSignTypeById(signTypeIdRaw.toLowerCase());
    if (found) {
      pushCandidate(out, found.id);
      pushCandidate(out, found.label);
      pushCandidate(out, found.category);
    }
  }

  const deduped: string[] = [];
  const seen = new Set<string>();
  for (const token of out) {
    if (seen.has(token)) continue;
    seen.add(token);
    deduped.push(token);
  }
  return deduped;
}

function isStopSign(input: SignVisualInput, tokens: string[], compactTokens: string[]): boolean {
  const details = getObject(input.details);
  const source = getObject(input.source);
  const normalizedSigns = normalizeSignEntries((details as Record<string, any> | null) ?? null);
  const primarySign = normalizedSigns[0] ?? null;

  const directRaw: unknown[] = [
    input.subtype,
    source?.signTypeId,
    source?.signType,
    source?.signLabel,
    source?.signName,
    source?.signCode,
    source?.mutcdCode,
    source?.MUTCDCode,
    details?.signTypeId,
    details?.signType,
    details?.signLabel,
    details?.signName,
    details?.signCode,
    details?.mutcdCode,
    details?.MUTCDCode,
    primarySign?.signTypeId,
    primarySign?.signLabel,
    primarySign?.signCode,
  ];

  const directTokens = directRaw
    .map((raw) => normalizeToken(raw))
    .filter((token): token is string => !!token);
  const directCompact = directTokens.map(compactToken);

  const hasStopWord = [...directTokens, ...tokens].some((t) =>
    t.includes("STOP") || t === "R1 1" || t === "R1-1",
  );
  const hasStopCode = [...directCompact, ...compactTokens].some((t) => t === "R11");
  const hasStopTypeId = directCompact.some((t) => t === "STOP");

  return hasStopWord || hasStopCode || hasStopTypeId;
}

function hasToken(tokens: string[], phrase: string): boolean {
  return tokens.some(t => t.includes(phrase));
}

function hasCompactPrefix(compactTokens: string[], prefix: string): boolean {
  return compactTokens.some(t => t.startsWith(prefix));
}

function hasCompactValue(compactTokens: string[], exact: string): boolean {
  return compactTokens.some(t => t === exact);
}

function pickPrimarySignTypeId(input: SignVisualInput): string | null {
  const details = getObject(input.details);
  const source = getObject(input.source);
  const signs = normalizeSignEntries((details as Record<string, any> | null) ?? null);
  const first = signs[0] ?? null;

  const raw =
    first?.signTypeId ??
    (typeof details?.signTypeId === "string" ? details.signTypeId : null) ??
    (typeof source?.signTypeId === "string" ? source.signTypeId : null) ??
    (typeof input.subtype === "string" ? input.subtype : null);

  const id = String(raw ?? "").trim().toLowerCase();
  return id.length ? id : null;
}

function toShortLabel(id: string, label: string): string {
  const speed = id.match(/speed_limit_(\d+)/i) || label.match(/SPEED\s+LIMIT\s+(\d+)/i);
  if (speed?.[1]) return speed[1].slice(0, 4);

  const specific: Record<string, string> = {
    stop: "STOP",
    yield: "YLD",
    no_parking: "NP",
    one_way: "1W",
    do_not_enter: "DNE",
    no_turn_on_red: "NTR",
    no_u_turn: "NUT",
    keep_right: "KR",
    keep_left: "KL",
    curve_ahead: "CURV",
    right_turn: "RT",
    sharp_turn: "SHP",
    hairpin_curve_left: "HL",
    hairpin_curve_right: "HR",
    winding_road: "WND",
    intersection_ahead: "INT",
    cross_traffic: "XING",
    deer_crossing: "DEER",
    elk_crossing: "ELK",
    fire_station_crossing: "FIRE",
    slippery_when_wet: "SLIP",
    steep_hill: "HILL",
    pedestrian_crossing: "PED",
    merge: "MRG",
    lane_ends: "LEND",
    divided_highway: "DIV",
    street_name: "ST",
    mile_marker: "MM",
    route_marker: "RTE",
    route_shield: "US",
    exit_sign: "EXIT",
    destination_distance: "DIST",
    hospital: "H",
    amenities: "GFL",
    work_zone_ahead: "WORK",
    detour: "DETR",
    flagger_ahead: "FLAG",
    lane_shift: "SHIFT",
    uneven_lanes: "UNEV",
    school_zone: "SCH",
    school_crossing: "SCHX",
    school_speed_limit: "S-LIM",
    children_at_play: "PLAY",
    railroad_crossing: "RR",
    other: "?",
  };

  if (specific[id]) return specific[id];

  const condensed = label
    .replace(/[^A-Z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!condensed) return "?";

  const words = condensed.split(" ");
  if (words.length === 1) return words[0].slice(0, 4);
  return words.slice(0, 2).map((w) => w[0]).join("").slice(0, 4) || "?";
}

function emblemFromSignType(input: SignVisualInput): EmblemSpec | null {
  const id = pickPrimarySignTypeId(input);
  if (!id) return null;

  const st = getSignTypeById(id);
  if (!st) return null;

  const label = String(st.label ?? id).toUpperCase();
  const category = String(st.category ?? "Other").toUpperCase();
  const mutcd = String(st.mutcdCode ?? "").toUpperCase();
  const shortLabel = toShortLabel(id, label);

  if (id === "stop" || mutcd === "R1-1") {
    return {
      kind: "STOP",
      shape: "octagon",
      fillColor: "#dc2626",
      borderColor: "#111827",
      textColor: "#ffffff",
      shortLabel: "STOP",
    };
  }

  if (id === "yield" || mutcd === "R1-2") {
    return {
      kind: "YIELD",
      shape: "triangle",
      fillColor: "#dc2626",
      borderColor: "#111827",
      textColor: "#ffffff",
      shortLabel,
    };
  }

  if (id.startsWith("speed_limit") || mutcd === "R2-1") {
    return {
      kind: "SPEED_LIMIT",
      shape: "rectangle",
      fillColor: "#ffffff",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  if (id === "no_parking" || mutcd === "R8-3") {
    return {
      kind: "NO_PARKING",
      shape: "rectangle",
      fillColor: "#ffffff",
      borderColor: "#111827",
      textColor: "#dc2626",
      shortLabel,
    };
  }

  if (id === "one_way" || mutcd === "R6-1") {
    return {
      kind: "ONE_WAY",
      shape: "bar",
      fillColor: "#111827",
      borderColor: "#111827",
      textColor: "#ffffff",
      shortLabel,
    };
  }

  if (id === "street_name" || mutcd === "D3-1") {
    return {
      kind: "STREET_NAME",
      shape: "street",
      fillColor: "#166534",
      borderColor: "#111827",
      textColor: "#ffffff",
      shortLabel,
    };
  }

  if (category === "SCHOOL") {
    return {
      kind: "SCHOOL",
      shape: "pentagon",
      fillColor: "#a3e635",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  if (category === "RAILROAD" || mutcd.startsWith("R15")) {
    return {
      kind: "RAILROAD",
      shape: "crossbuck",
      fillColor: "#ffffff",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  if (category === "WARNING") {
    return {
      kind: "WARNING",
      shape: "diamond",
      fillColor: "#facc15",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  if (category === "CONSTRUCTION") {
    return {
      kind: "WARNING",
      shape: "diamond",
      fillColor: "#fb923c",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  if (category === "GUIDE") {
    return {
      kind: "STREET_NAME",
      shape: "rectangle",
      fillColor: "#166534",
      borderColor: "#111827",
      textColor: "#ffffff",
      shortLabel,
    };
  }

  if (category === "REGULATORY") {
    return {
      kind: "SPEED_LIMIT",
      shape: "rectangle",
      fillColor: "#ffffff",
      borderColor: "#111827",
      textColor: "#111827",
      shortLabel,
    };
  }

  return {
    kind: "UNKNOWN",
    shape: "unknown",
    fillColor: "#9ca3af",
    borderColor: "#111827",
    textColor: "#111827",
    shortLabel,
  };
}

function classifySign(input: SignVisualInput, tokens: string[]): SignVisualKind {
  const compactTokens = tokens.map(compactToken);

  if (isStopSign(input, tokens, compactTokens) || hasToken(tokens, "ALL WAY")) {
    return "STOP";
  }
  if (hasToken(tokens, "YIELD") || hasCompactValue(compactTokens, "R12")) return "YIELD";
  if (hasToken(tokens, "SCHOOL") || hasCompactPrefix(compactTokens, "S")) return "SCHOOL";

  if (
    hasToken(tokens, "SPEED LIMIT") ||
    (hasToken(tokens, "SPEED") && hasToken(tokens, "LIMIT")) ||
    hasCompactValue(compactTokens, "R21")
  ) {
    return "SPEED_LIMIT";
  }

  if (hasToken(tokens, "NO PARKING") || hasCompactValue(compactTokens, "R83")) return "NO_PARKING";
  if (hasToken(tokens, "ONE WAY") || hasCompactValue(compactTokens, "R61")) return "ONE_WAY";
  if (hasToken(tokens, "STREET NAME") || hasCompactValue(compactTokens, "D31")) return "STREET_NAME";

  if (
    hasToken(tokens, "RAILROAD") ||
    hasToken(tokens, "CROSSBUCK") ||
    hasCompactPrefix(compactTokens, "R15")
  ) {
    return "RAILROAD";
  }

  if (
    hasToken(tokens, "WARNING") ||
    hasToken(tokens, "CONSTRUCTION") ||
    hasCompactPrefix(compactTokens, "W")
  ) {
    return "WARNING";
  }

  return "UNKNOWN";
}

export function getSignVisualStyle(input: SignVisualInput): SignVisualStyle {
  const emblem = emblemFromSignType(input);
  if (emblem) {
    const tokens = collectCandidates(input);
    return {
      kind: emblem.kind,
      shape: emblem.shape,
      fillColor: emblem.fillColor,
      borderColor: emblem.borderColor,
      textColor: emblem.textColor,
      shortLabel: emblem.shortLabel,
      rotationDeg: null,
      normalizedType: tokens[0] ?? null,
      usedFallback: false,
    };
  }

  const candidates = collectCandidates(input);
  const kind = classifySign(input, candidates);
  const base = STYLE_BY_KIND[kind];

  return {
    kind,
    shape: base.shape,
    fillColor: base.fillColor,
    borderColor: base.borderColor,
    textColor: base.textColor,
    shortLabel: base.shortLabel,
    rotationDeg: base.rotationDeg ?? null,
    normalizedType: candidates[0] ?? null,
    usedFallback: kind === "UNKNOWN",
  };
}
