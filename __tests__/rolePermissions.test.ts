import {
  assertRolePermission,
  getActiveRoleForGuards,
  hasRolePermission,
  normalizeRole,
  permissionDeniedMessage,
  PermissionDeniedError,
  setActiveRoleForGuards,
} from "../src/permissions/rolePermissions";

describe("rolePermissions", () => {
  afterEach(() => {
    setActiveRoleForGuards("viewer");
  });

  it("normalizes aliases to canonical roles", () => {
    expect(normalizeRole("owner")).toBe("org_owner");
    expect(normalizeRole("admin")).toBe("org_admin");
    expect(normalizeRole("mechanic")).toBe("mechanic");
    expect(normalizeRole("member")).toBe("crew_member");
    expect(normalizeRole("asset_manager")).toBe("asset_manager");
    expect(normalizeRole("read only")).toBe("viewer");
    expect(normalizeRole("super-admin")).toBe("platform_owner");
  });

  it("falls back to viewer for unknown role values", () => {
    expect(normalizeRole("mystery_role")).toBe("viewer");
    expect(normalizeRole(undefined)).toBe("viewer");
    expect(normalizeRole(null)).toBe("viewer");
  });

  it("enforces expected matrix examples", () => {
    expect(hasRolePermission("createWorkOrder", "viewer")).toBe(false);
    expect(hasRolePermission("createWorkOrder", "member")).toBe(true);
    expect(hasRolePermission("createWorkOrder", "mechanic")).toBe(false);
    expect(hasRolePermission("createMaintenanceSlip", "member")).toBe(true);
    expect(hasRolePermission("createMaintenanceSlip", "mechanic")).toBe(true);
    expect(hasRolePermission("viewMaintenanceSlip", "viewer")).toBe(true);
    expect(hasRolePermission("editMaintenanceSlip", "mechanic")).toBe(true);
    expect(hasRolePermission("viewVehicleAssets", "mechanic")).toBe(true);
    expect(hasRolePermission("editVehicleAssets", "asset_manager")).toBe(true);
    expect(hasRolePermission("viewVehicleAssets", "crew_member")).toBe(false);
    expect(hasRolePermission("deleteWorkOrder", "crew_member")).toBe(false);
    expect(hasRolePermission("deleteWorkOrder", "org_admin")).toBe(true);
    expect(hasRolePermission("manageAssets", "asset_manager")).toBe(true);
    expect(hasRolePermission("manageAssets", "mechanic")).toBe(false);
    expect(hasRolePermission("createTailgate", "crew_member")).toBe(false);
    expect(hasRolePermission("assignOrgOwner", "org_owner")).toBe(false);
    expect(hasRolePermission("assignOrgOwner", "platform_owner")).toBe(true);
  });

  it("uses global active role for assertRolePermission when role is omitted", () => {
    setActiveRoleForGuards("member");
    expect(getActiveRoleForGuards()).toBe("crew_member");
    expect(() => assertRolePermission("createWorkOrder")).not.toThrow();
  });

  it("throws PermissionDeniedError with details when denied", () => {
    setActiveRoleForGuards("viewer");

    try {
      assertRolePermission("editWorkOrder");
      throw new Error("Expected assertRolePermission to throw");
    } catch (err: any) {
      expect(err).toBeInstanceOf(PermissionDeniedError);
      expect(err.code).toBe("permission-denied");
      expect(err.permission).toBe("editWorkOrder");
      expect(err.role).toBe("viewer");
    }
  });

  it("provides user-friendly denial messages", () => {
    expect(permissionDeniedMessage("createCounter")).toContain("counter");
    expect(permissionDeniedMessage("createMaintenanceSlip")).toContain("maintenance slips");
    expect(permissionDeniedMessage("editVehicleAssets")).toContain("vehicle assets");
    expect(permissionDeniedMessage("assignOrgOwner")).toContain("platform owners");
  });
});
