import { resolveMapPressTarget } from "../src/dev/mapPressTargetResolver";

describe("resolveMapPressTarget", () => {
  it("prefers bridge asset when bridge geometry is near", () => {
    const result = resolveMapPressTarget({
      assetCandidates: [{ id: "bridge_1", assetType: "bridge", distanceMeters: 25, source: "bridge" }],
      workOrderCandidates: [{ id: "wo_1", type: "bridge_repair", distanceMeters: 12 }],
    });

    expect(result).toEqual({ kind: "asset", assetId: "bridge_1", reason: "bridge-near-tap" });
  });

  it("uses linked asset for linear work order near tap", () => {
    const result = resolveMapPressTarget({
      workOrderCandidates: [
        {
          id: "wo_linear",
          type: "guardrail_repair",
          distanceMeters: 21,
          linkedAssetId: "guardrail_1",
        },
      ],
    });

    expect(result).toEqual({
      kind: "asset",
      assetId: "guardrail_1",
      reason: "linear-work-order-linked-asset",
    });
  });

  it("falls back to work order for non-linear near tap", () => {
    const result = resolveMapPressTarget({
      workOrderCandidates: [{ id: "wo_nonlinear", type: "ditch", distanceMeters: 18 }],
    });

    expect(result).toEqual({
      kind: "work_order",
      workOrderId: "wo_nonlinear",
      reason: "work-order-near-tap",
    });
  });

  it("returns none for far candidates", () => {
    const result = resolveMapPressTarget({
      workOrderCandidates: [{ id: "wo_far", type: "pothole", distanceMeters: 85 }],
    });

    expect(result).toEqual({ kind: "none", reason: "work-order-too-far" });
  });
});
