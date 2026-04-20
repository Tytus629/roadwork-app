import {
  getPavementPreset,
  isPavementRepairType,
  normalizePavementRepairDetails,
  validatePavementRepairDetails,
} from "../src/workOrders/pavementDetails";

describe("pavementDetails helpers", () => {
  it("detects pavement-related type aliases", () => {
    expect(isPavementRepairType("pothole")).toBe(true);
    expect(isPavementRepairType("pavement repair")).toBe(true);
    expect(isPavementRepairType("roadway_surface_repair")).toBe(true);
    expect(isPavementRepairType("asphalt")).toBe(true);
    expect(isPavementRepairType("sign")).toBe(false);
  });

  it("applies temporary pothole preset values", () => {
    expect(getPavementPreset("temporary_pothole_patch")).toEqual({
      issueCategory: "pothole",
      repairMethod: "cold_mix",
      temporaryRepair: true,
      followUpNeeded: true,
    });
  });

  it("defaults temporaryRepair=true for cold mix during normalization", () => {
    const normalized = normalizePavementRepairDetails({ repairMethod: "cold_mix" });
    expect(normalized?.temporaryRepair).toBe(true);
  });

  it("does not require hidden conditional fields", () => {
    const errors = validatePavementRepairDetails({
      repairMethod: "full_depth_patch",
      estimatedDepthIn: null,
      followUpNeeded: true,
      followUpAction: null,
      drainageIssuePresent: true,
    });

    expect(errors).toEqual([]);
  });

  it("maps legacy details keys into the new schema", () => {
    const normalized = normalizePavementRepairDetails({
      category: "alligator",
      requiresGrinder: true,
      requiresSawCut: false,
      waterIssuePresent: true,
      drainageIssue: "ditch",
    });

    expect(normalized?.issueCategory).toBe("alligator_cracking");
    expect(normalized?.grinderNeeded).toBe(true);
    expect(normalized?.sawCutNeeded).toBe(false);
    expect(normalized?.drainageIssuePresent).toBe(true);
  });

  it("rejects negative numeric values", () => {
    const errors = validatePavementRepairDetails({
      estimatedLengthFt: -1,
      estimatedWidthFt: -2,
      estimatedDepthIn: -3,
      estimatedTons: -0.5,
    });

    expect(errors.some((e) => e.includes("Estimated length"))).toBe(true);
    expect(errors.some((e) => e.includes("Estimated width"))).toBe(true);
    expect(errors.some((e) => e.includes("Estimated depth"))).toBe(true);
    expect(errors.some((e) => e.includes("Estimated tons"))).toBe(true);
  });
});
