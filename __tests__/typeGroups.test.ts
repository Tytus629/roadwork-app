import { getTypeGroup } from "../src/workOrders/typeGroups";

describe("getTypeGroup", () => {
  it('returns "sign" for sign aliases', () => {
    expect(getTypeGroup("sign")).toBe("sign");
    expect(getTypeGroup("Sign")).toBe("sign");
    expect(getTypeGroup("signs")).toBe("sign");
    expect(getTypeGroup("sign_maintenance")).toBe("sign");
    expect(getTypeGroup("  SIGN  ")).toBe("sign");
  });

  it('returns "guardrail" for guardrail aliases', () => {
    expect(getTypeGroup("guardrail")).toBe("guardrail");
    expect(getTypeGroup("Guard Rail")).toBe("guardrail");
    expect(getTypeGroup("guard_rail")).toBe("guardrail");
    expect(getTypeGroup("guard rails")).toBe("guardrail");
  });

  it('returns "pavement" for pavement aliases', () => {
    expect(getTypeGroup("pothole")).toBe("pavement");
    expect(getTypeGroup("pavement repair")).toBe("pavement");
    expect(getTypeGroup("asphalt_patch")).toBe("pavement");
    expect(getTypeGroup("Roadway Surface Repair")).toBe("pavement");
    expect(getTypeGroup("asphalt")).toBe("pavement");
  });

  it('returns "other" for unrecognized types', () => {
    expect(getTypeGroup("drainage")).toBe("other");
  });

  it('returns "culvert" for culvert aliases', () => {
    expect(getTypeGroup("culvert")).toBe("culvert");
    expect(getTypeGroup("Culverts")).toBe("culvert");
    expect(getTypeGroup("culvert repair")).toBe("culvert");
    expect(getTypeGroup("drain_pipe")).toBe("culvert");
  });

  it('returns "other" for null/undefined/empty', () => {
    expect(getTypeGroup(null)).toBe("other");
    expect(getTypeGroup(undefined)).toBe("other");
    expect(getTypeGroup("")).toBe("other");
    expect(getTypeGroup("   ")).toBe("other");
  });
});
