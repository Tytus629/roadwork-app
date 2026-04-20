import { requireOrgId } from "../src/org/requireOrg";

describe("requireOrgId", () => {
  it("returns trimmed orgId for valid input", () => {
    expect(requireOrgId("org123")).toBe("org123");
    expect(requireOrgId("  org123  ")).toBe("org123");
  });

  it("throws for null", () => {
    expect(() => requireOrgId(null)).toThrow("orgId is required");
  });

  it("throws for undefined", () => {
    expect(() => requireOrgId(undefined)).toThrow("orgId is required");
  });

  it("throws for empty string", () => {
    expect(() => requireOrgId("")).toThrow("orgId is required");
  });

  it("throws for whitespace-only string", () => {
    expect(() => requireOrgId("   ")).toThrow("orgId is required");
  });
});
