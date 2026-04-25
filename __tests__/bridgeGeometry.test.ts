import {
  buildBridgeRing,
  deriveBridgeCenter,
  deriveBridgeFootprintMetrics,
  isValidBridgeCornerSet,
  normalizeBridgeCorners,
} from "../src/utils/bridgeGeometry";

describe("normalizeBridgeCorners", () => {
  it("returns ordered corners when exactly four valid points are provided", () => {
    const corners = normalizeBridgeCorners([
      { lat: 47.61, lng: -122.33 },
      { lat: 47.62, lng: -122.34 },
      { lat: 47.63, lng: -122.35 },
      { lat: 47.64, lng: -122.36 },
    ]);

    expect(corners).toEqual([
      { order: 1, lat: 47.61, lng: -122.33 },
      { order: 2, lat: 47.62, lng: -122.34 },
      { order: 3, lat: 47.63, lng: -122.35 },
      { order: 4, lat: 47.64, lng: -122.36 },
    ]);
  });

  it("returns null when point count is not exactly four", () => {
    expect(
      normalizeBridgeCorners([
        { lat: 47.61, lng: -122.33 },
        { lat: 47.62, lng: -122.34 },
        { lat: 47.63, lng: -122.35 },
      ]),
    ).toBeNull();
  });

  it("returns null when any coordinate is invalid", () => {
    expect(
      normalizeBridgeCorners([
        { lat: 47.61, lng: -122.33 },
        { lat: 47.62, lng: -122.34 },
        { lat: "bad", lng: -122.35 },
        { lat: 47.64, lng: -122.36 },
      ] as any),
    ).toBeNull();
  });
});

describe("isValidBridgeCornerSet", () => {
  it("returns true for a valid 4-corner set", () => {
    expect(
      isValidBridgeCornerSet([
        { lat: 47.61, lng: -122.33 },
        { lat: 47.62, lng: -122.34 },
        { lat: 47.63, lng: -122.35 },
        { lat: 47.64, lng: -122.36 },
      ]),
    ).toBe(true);
  });

  it("returns false for invalid corners", () => {
    expect(isValidBridgeCornerSet(null)).toBe(false);
  });
});

describe("deriveBridgeCenter", () => {
  it("averages four ordered corners", () => {
    const center = deriveBridgeCenter([
      { order: 1, lat: 0, lng: 0 },
      { order: 2, lat: 0, lng: 4 },
      { order: 3, lat: 4, lng: 4 },
      { order: 4, lat: 4, lng: 0 },
    ]);

    expect(center.lat).toBe(2);
    expect(center.lng).toBe(2);
  });
});

describe("buildBridgeRing", () => {
  it("closes an open four-corner footprint", () => {
    const ring = buildBridgeRing([
      { lat: 0, lng: 0 },
      { lat: 0, lng: 4 },
      { lat: 4, lng: 4 },
      { lat: 4, lng: 0 },
    ]);

    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
  });
});

describe("deriveBridgeFootprintMetrics", () => {
  it("returns width, length, and perimeter for a rectangular bridge footprint", () => {
    const metrics = deriveBridgeFootprintMetrics([
      { order: 1, lat: 47.0, lng: -122.0 },
      { order: 2, lat: 47.0, lng: -121.999 },
      { order: 3, lat: 47.0004, lng: -121.999 },
      { order: 4, lat: 47.0004, lng: -122.0 },
    ]);

    expect(metrics.bounds).not.toBeNull();
    expect(metrics.lengthMeters).not.toBeNull();
    expect(metrics.widthMeters).not.toBeNull();
    expect(metrics.perimeterMeters).not.toBeNull();
    expect((metrics.lengthMeters ?? 0) >= (metrics.widthMeters ?? 0)).toBe(true);
  });
});