import { bboxForPoint, bboxForLine, padBBox } from "../src/db/geom";

describe("bboxForPoint", () => {
  it("returns zero-area bbox at the point", () => {
    const box = bboxForPoint({ lat: 40.0, lng: -80.0 });
    expect(box).toEqual({ minLat: 40.0, minLng: -80.0, maxLat: 40.0, maxLng: -80.0 });
  });
});

describe("bboxForLine", () => {
  it("computes bbox from multiple points", () => {
    const box = bboxForLine([
      { lat: 40.0, lng: -80.0 },
      { lat: 41.0, lng: -79.0 },
      { lat: 40.5, lng: -79.5 },
    ]);
    expect(box).toEqual({ minLat: 40.0, minLng: -80.0, maxLat: 41.0, maxLng: -79.0 });
  });

  it("returns zero bbox for empty array", () => {
    const box = bboxForLine([]);
    expect(box).toEqual({ minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 });
  });

  it("handles single point", () => {
    const box = bboxForLine([{ lat: 35.0, lng: -90.0 }]);
    expect(box).toEqual({ minLat: 35.0, minLng: -90.0, maxLat: 35.0, maxLng: -90.0 });
  });
});

describe("padBBox", () => {
  it("expands bbox by default pad", () => {
    const box = padBBox({ minLat: 40.0, minLng: -80.0, maxLat: 41.0, maxLng: -79.0 });
    expect(box.minLat).toBeCloseTo(39.998);
    expect(box.maxLat).toBeCloseTo(41.002);
    expect(box.minLng).toBeCloseTo(-80.002);
    expect(box.maxLng).toBeCloseTo(-78.998);
  });

  it("accepts custom pad value", () => {
    const box = padBBox({ minLat: 40.0, minLng: -80.0, maxLat: 40.0, maxLng: -80.0 }, 0.01);
    expect(box.minLat).toBeCloseTo(39.99);
    expect(box.maxLat).toBeCloseTo(40.01);
  });
});
