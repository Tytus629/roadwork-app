import {
  deriveAssetWorkOrderSeedLocation,
  deriveCreateFromAssetPayloadSeedLocation,
} from "../src/utils/assetGeometry";

function makeAsset(overrides: Record<string, any> = {}) {
  return {
    id: "asset-1",
    orgId: "org-1",
    assetType: "CULVERT",
    status: "ACTIVE",
    lat: 0,
    lng: 0,
    createdAt: 1,
    updatedAt: 1,
    details: null,
    ...overrides,
  };
}

describe("deriveAssetWorkOrderSeedLocation", () => {
  it("uses direct point when valid", () => {
    const result = deriveAssetWorkOrderSeedLocation(
      makeAsset({ lat: 44.1234, lng: -79.2222 }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("point");
    expect(result.lat).toBeCloseTo(44.1234);
    expect(result.lng).toBeCloseTo(-79.2222);
  });

  it("derives line-center from culvert endpoints when no direct point", () => {
    const result = deriveAssetWorkOrderSeedLocation(
      makeAsset({
        lat: 0,
        lng: 0,
        details: {
          culvert: {
            inlet: { lat: 44.0, lng: -79.0 },
            outlet: { lat: 46.0, lng: -77.0 },
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("line-center");
    expect(result.lat).toBeCloseTo(45.0);
    expect(result.lng).toBeCloseTo(-78.0);
    expect(result.linePoints?.length).toBeGreaterThanOrEqual(2);
  });

  it("derives bbox-center from bbox-like geometry when no point/line", () => {
    const result = deriveAssetWorkOrderSeedLocation(
      makeAsset({
        lat: 0,
        lng: 0,
        details: {
          bbox: {
            minLat: 10,
            minLng: 20,
            maxLat: 14,
            maxLng: 24,
          },
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("bbox-center");
    expect(result.lat).toBeCloseTo(12);
    expect(result.lng).toBeCloseTo(22);
  });

  it("derives corners-center from corner arrays when no point/line", () => {
    const result = deriveAssetWorkOrderSeedLocation(
      makeAsset({
        lat: 0,
        lng: 0,
        details: {
          corners: [
            { lat: 10, lng: 20 },
            { lat: 10, lng: 24 },
            { lat: 14, lng: 24 },
            { lat: 14, lng: 20 },
          ],
        },
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("corners-center");
    expect(result.lat).toBeCloseTo(12);
    expect(result.lng).toBeCloseTo(22);
  });

  it("fails cleanly when geometry is unusable", () => {
    const result = deriveAssetWorkOrderSeedLocation(
      makeAsset({
        lat: 0,
        lng: 0,
        details: {
          culvert: {
            inlet: { lat: "bad", lng: null },
            outlet: { lat: undefined, lng: "bad" },
          },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(["missing_geometry", "invalid_point", "invalid_line", "invalid_bounds"]).toContain(result.reason);
  });
});

describe("deriveCreateFromAssetPayloadSeedLocation", () => {
  it("derives line-center from payload line points when payload point is missing", () => {
    const result = deriveCreateFromAssetPayloadSeedLocation({
      latitude: 0,
      longitude: 0,
      linePoints: [
        { lat: 40, lng: -80 },
        { lat: 42, lng: -78 },
      ],
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe("line-center");
    expect(result.lat).toBeCloseTo(41);
    expect(result.lng).toBeCloseTo(-79);
  });
});
