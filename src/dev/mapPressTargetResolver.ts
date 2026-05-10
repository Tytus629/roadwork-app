export type MapPressTapType = "asset" | "work_order";

export type MapPressAssetCandidate = {
  id: string;
  assetType: string;
  distanceMeters: number;
  source: "bridge" | "culvert" | "guardrail" | "center";
};

export type MapPressWorkOrderCandidate = {
  id: string;
  type: string;
  distanceMeters: number;
  linkedAssetId?: string | null;
};

export type MapPressTargetInput = {
  assetCandidates?: MapPressAssetCandidate[];
  workOrderCandidates?: MapPressWorkOrderCandidate[];
};

export type MapPressResolution =
  | { kind: "asset"; assetId: string; reason: string }
  | { kind: "work_order"; workOrderId: string; reason: string }
  | { kind: "none"; reason: string };

const BRIDGE_MAX_DIST_METERS = 50;
const CULVERT_MAX_DIST_METERS = 75;
const GUARDRAIL_MAX_DIST_METERS = 65;
const CENTER_CULVERT_FALLBACK_MAX_DIST_METERS = 35;
const WORK_ORDER_LINEAR_MAX_DIST_METERS = 70;
const WORK_ORDER_DEFAULT_MAX_DIST_METERS = 24;

function normalizeType(typeRaw: string | null | undefined): string {
  return String(typeRaw ?? "").trim().toUpperCase();
}

function isLinearWorkOrderType(typeRaw: string | null | undefined): boolean {
  const t = String(typeRaw ?? "").toLowerCase();
  return t.includes("guardrail") || t.includes("culvert") || t.includes("bridge");
}

function pickClosestAsset(candidates: MapPressAssetCandidate[]): MapPressAssetCandidate | null {
  let best: MapPressAssetCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
  }
  return best;
}

function pickClosestBySource(
  candidates: MapPressAssetCandidate[],
  source: MapPressAssetCandidate["source"],
): MapPressAssetCandidate | null {
  return pickClosestAsset(candidates.filter((candidate) => candidate.source === source));
}

function pickClosestWorkOrder(candidates: MapPressWorkOrderCandidate[]): MapPressWorkOrderCandidate | null {
  let best: MapPressWorkOrderCandidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.distanceMeters < best.distanceMeters) {
      best = candidate;
    }
  }
  return best;
}

export function resolveMapPressTarget(input: MapPressTargetInput): MapPressResolution {
  const assets = Array.isArray(input.assetCandidates) ? input.assetCandidates : [];
  const workOrders = Array.isArray(input.workOrderCandidates) ? input.workOrderCandidates : [];

  const closestBridge = pickClosestBySource(assets, "bridge");
  if (closestBridge && normalizeType(closestBridge.assetType) === "BRIDGE" && closestBridge.distanceMeters <= BRIDGE_MAX_DIST_METERS) {
    return { kind: "asset", assetId: closestBridge.id, reason: "bridge-near-tap" };
  }

  const closestLinear = pickClosestAsset(
    assets.filter((candidate) => {
      const type = normalizeType(candidate.assetType);
      return (
        (candidate.source === "culvert" && type === "CULVERT") ||
        (candidate.source === "guardrail" && type === "GUARDRAIL")
      );
    }),
  );

  if (closestLinear) {
    const maxDist = normalizeType(closestLinear.assetType) === "CULVERT"
      ? CULVERT_MAX_DIST_METERS
      : GUARDRAIL_MAX_DIST_METERS;
    if (closestLinear.distanceMeters <= maxDist) {
      return {
        kind: "asset",
        assetId: closestLinear.id,
        reason: `${normalizeType(closestLinear.assetType).toLowerCase()}-line-near-tap`,
      };
    }
  }

  const closestCenter = pickClosestBySource(assets, "center");
  if (
    closestCenter &&
    normalizeType(closestCenter.assetType) === "CULVERT" &&
    closestCenter.distanceMeters <= CENTER_CULVERT_FALLBACK_MAX_DIST_METERS
  ) {
    return { kind: "asset", assetId: closestCenter.id, reason: "culvert-center-fallback" };
  }

  const closestWorkOrder = pickClosestWorkOrder(workOrders);
  if (!closestWorkOrder) {
    return { kind: "none", reason: "no-candidates" };
  }

  if (isLinearWorkOrderType(closestWorkOrder.type)) {
    if (closestWorkOrder.distanceMeters > WORK_ORDER_LINEAR_MAX_DIST_METERS) {
      return { kind: "none", reason: "linear-work-order-too-far" };
    }
    if (closestWorkOrder.linkedAssetId) {
      return {
        kind: "asset",
        assetId: String(closestWorkOrder.linkedAssetId),
        reason: "linear-work-order-linked-asset",
      };
    }
    return {
      kind: "work_order",
      workOrderId: closestWorkOrder.id,
      reason: "linear-work-order-fallback",
    };
  }

  if (closestWorkOrder.distanceMeters <= WORK_ORDER_DEFAULT_MAX_DIST_METERS) {
    return {
      kind: "work_order",
      workOrderId: closestWorkOrder.id,
      reason: "work-order-near-tap",
    };
  }

  return { kind: "none", reason: "work-order-too-far" };
}
