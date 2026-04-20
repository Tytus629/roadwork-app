// AsphaltMix type available from ./asphaltMixes if needed by future callers

export type AsphaltInputs = {
  lengthFt: number;
  widthFt: number;
  depthIn: number; // inches
  densityLbPerFt3: number; // derived from mix OR override
};

export type AsphaltResult = {
  areaFt2: number;
  volumeFt3: number;
  volumeYd3: number;
  weightLb: number;
  weightTons: number; // US short tons (2000 lb)
};

export function calcAsphalt(i: AsphaltInputs): AsphaltResult {
  const lengthFt = clampNum(i.lengthFt);
  const widthFt = clampNum(i.widthFt);
  const depthIn = clampNum(i.depthIn);
  const density = clampNum(i.densityLbPerFt3);

  const depthFt = depthIn / 12;
  const areaFt2 = lengthFt * widthFt;
  const volumeFt3 = areaFt2 * depthFt;
  const volumeYd3 = volumeFt3 / 27;

  const weightLb = volumeFt3 * density;
  const weightTons = weightLb / 2000;

  return roundResult({ areaFt2, volumeFt3, volumeYd3, weightLb, weightTons });
}

function clampNum(n: number) {
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function roundResult(r: AsphaltResult): AsphaltResult {
  const r2 = (x: number, d: number) => Number(x.toFixed(d));
  return {
    areaFt2: r2(r.areaFt2, 2),
    volumeFt3: r2(r.volumeFt3, 2),
    volumeYd3: r2(r.volumeYd3, 2),
    weightLb: r2(r.weightLb, 0),
    weightTons: r2(r.weightTons, 2),
  };
}

// Optional helper: estimate truckloads
export function estimateTruckloads(weightTons: number, truckCapacityTons: number) {
  if (!Number.isFinite(weightTons) || weightTons <= 0) return 0;
  if (!Number.isFinite(truckCapacityTons) || truckCapacityTons <= 0) return 0;
  return Math.ceil(weightTons / truckCapacityTons);
}
