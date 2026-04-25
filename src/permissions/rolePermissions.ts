export type CanonicalRole =
  | "platform_owner"
  | "org_owner"
  | "org_admin"
  | "mechanic"
  | "asset_manager"
  | "crew_member"
  | "viewer";

export type RolePermission =
  | "viewMap"
  | "viewWorkOrders"
  | "viewVehicleAssets"
  | "editVehicleAssets"
  | "viewMaintenanceSlip"
  | "createWorkOrder"
  | "editWorkOrder"
  | "createMaintenanceSlip"
  | "editMaintenanceSlip"
  | "changeStatusPriority"
  | "deleteWorkOrder"
  | "addWorkOrderPhoto"
  | "manageAssets"
  | "createTailgate"
  | "createDmi"
  | "createCounter"
  | "manageOrgMembers"
  | "assignOrgOwner";

const ROLE_ALIASES: Record<string, CanonicalRole> = {
  platform_owner: "platform_owner",
  platformowner: "platform_owner",
  super_admin: "platform_owner",
  superadmin: "platform_owner",

  org_owner: "org_owner",
  orgowner: "org_owner",
  owner: "org_owner",

  org_admin: "org_admin",
  orgadmin: "org_admin",
  admin: "org_admin",

  crew_lead: "asset_manager",
  crewlead: "asset_manager",
  lead: "asset_manager",
  asset_manager: "asset_manager",
  assetmanager: "asset_manager",
  asset_mgr: "asset_manager",

  mechanic: "mechanic",

  crew_member: "crew_member",
  crewmember: "crew_member",
  worker: "crew_member",
  member: "crew_member",
  org_member: "crew_member",
  orgmember: "crew_member",
  user: "crew_member",

  viewer: "viewer",
  read_only: "viewer",
  readonly: "viewer",
  read: "viewer",
};

const ROLE_PERMISSIONS: Record<CanonicalRole, Record<RolePermission, boolean>> = {
  platform_owner: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: true,
    editVehicleAssets: true,
    viewMaintenanceSlip: true,
    createWorkOrder: true,
    editWorkOrder: true,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: true,
    deleteWorkOrder: true,
    addWorkOrderPhoto: true,
    manageAssets: true,
    createTailgate: true,
    createDmi: true,
    createCounter: true,
    manageOrgMembers: true,
    assignOrgOwner: true,
  },
  org_owner: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: true,
    editVehicleAssets: true,
    viewMaintenanceSlip: true,
    createWorkOrder: true,
    editWorkOrder: true,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: true,
    deleteWorkOrder: true,
    addWorkOrderPhoto: true,
    manageAssets: true,
    createTailgate: true,
    createDmi: true,
    createCounter: true,
    manageOrgMembers: true,
    assignOrgOwner: false,
  },
  org_admin: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: true,
    editVehicleAssets: true,
    viewMaintenanceSlip: true,
    createWorkOrder: true,
    editWorkOrder: true,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: true,
    deleteWorkOrder: true,
    addWorkOrderPhoto: true,
    manageAssets: true,
    createTailgate: true,
    createDmi: true,
    createCounter: true,
    manageOrgMembers: true,
    assignOrgOwner: false,
  },
  mechanic: {
    viewMap: false,
    viewWorkOrders: false,
    viewVehicleAssets: true,
    editVehicleAssets: true,
    viewMaintenanceSlip: true,
    createWorkOrder: false,
    editWorkOrder: false,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: false,
    deleteWorkOrder: false,
    addWorkOrderPhoto: false,
    manageAssets: false,
    createTailgate: false,
    createDmi: false,
    createCounter: false,
    manageOrgMembers: false,
    assignOrgOwner: false,
  },
  asset_manager: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: true,
    editVehicleAssets: true,
    viewMaintenanceSlip: true,
    createWorkOrder: true,
    editWorkOrder: true,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: true,
    deleteWorkOrder: false,
    addWorkOrderPhoto: true,
    manageAssets: true,
    createTailgate: true,
    createDmi: true,
    createCounter: true,
    manageOrgMembers: false,
    assignOrgOwner: false,
  },
  crew_member: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: false,
    editVehicleAssets: false,
    viewMaintenanceSlip: true,
    createWorkOrder: true,
    editWorkOrder: true,
    createMaintenanceSlip: true,
    editMaintenanceSlip: true,
    changeStatusPriority: true,
    deleteWorkOrder: false,
    addWorkOrderPhoto: true,
    // Needed so map create wizard can expose the Asset branch at runtime.
    manageAssets: true,
    createTailgate: false,
    createDmi: false,
    createCounter: false,
    manageOrgMembers: false,
    assignOrgOwner: false,
  },
  viewer: {
    viewMap: true,
    viewWorkOrders: true,
    viewVehicleAssets: false,
    editVehicleAssets: false,
    viewMaintenanceSlip: true,
    createWorkOrder: false,
    editWorkOrder: false,
    createMaintenanceSlip: false,
    editMaintenanceSlip: false,
    changeStatusPriority: false,
    deleteWorkOrder: false,
    addWorkOrderPhoto: false,
    manageAssets: false,
    createTailgate: false,
    createDmi: false,
    createCounter: false,
    manageOrgMembers: false,
    assignOrgOwner: false,
  },
};

export function normalizeRole(role: unknown): CanonicalRole {
  if (typeof role !== "string") return "viewer";
  const key = role.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return ROLE_ALIASES[key] ?? "viewer";
}

export function hasRolePermission(permission: RolePermission, role: unknown): boolean {
  const canonical = normalizeRole(role);
  return ROLE_PERMISSIONS[canonical][permission];
}

let activeRoleForGuards: CanonicalRole = "viewer";

export function setActiveRoleForGuards(role: unknown): CanonicalRole {
  activeRoleForGuards = normalizeRole(role);
  return activeRoleForGuards;
}

export function getActiveRoleForGuards(): CanonicalRole {
  return activeRoleForGuards;
}

export class PermissionDeniedError extends Error {
  code = "permission-denied" as const;
  permission: RolePermission;
  role: CanonicalRole;

  constructor(permission: RolePermission, role: CanonicalRole, message?: string) {
    super(message ?? `Role ${role} cannot perform ${permission}`);
    this.permission = permission;
    this.role = role;
    this.name = "PermissionDeniedError";
  }
}

export function assertRolePermission(permission: RolePermission, role?: unknown): void {
  const effectiveRole = role == null ? activeRoleForGuards : normalizeRole(role);
  if (!ROLE_PERMISSIONS[effectiveRole][permission]) {
    throw new PermissionDeniedError(permission, effectiveRole);
  }
}

export function permissionDeniedMessage(permission: RolePermission): string {
  switch (permission) {
    case "viewVehicleAssets":
      return "Your role cannot view vehicle assets.";
    case "editVehicleAssets":
      return "Your role cannot create or edit vehicle assets.";
    case "createWorkOrder":
      return "Your role cannot create work orders.";
    case "viewMaintenanceSlip":
      return "Your role cannot view vehicle maintenance slips.";
    case "editWorkOrder":
      return "Your role cannot edit this work order.";
    case "createMaintenanceSlip":
      return "Your role cannot create vehicle maintenance slips.";
    case "editMaintenanceSlip":
      return "Your role cannot edit vehicle maintenance slips.";
    case "changeStatusPriority":
      return "Your role cannot change status or priority.";
    case "deleteWorkOrder":
      return "Your role cannot delete work orders.";
    case "addWorkOrderPhoto":
      return "Your role cannot add or remove work-order photos.";
    case "manageAssets":
      return "Your role cannot modify asset records.";
    case "createTailgate":
      return "Your role cannot create tailgate logs.";
    case "createDmi":
      return "Your role cannot create DMI records.";
    case "createCounter":
      return "Your role cannot create counter records.";
    case "manageOrgMembers":
      return "Your role cannot manage organization members.";
    case "assignOrgOwner":
      return "Only platform owners can assign org owners.";
    default:
      return "Your role does not allow this action.";
  }
}
