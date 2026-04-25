import { emitDbChanged } from "../state/DbEvents";
import { assertRolePermission } from "../permissions/rolePermissions";
import { getDeviceMeta } from "../utils/deviceMeta";
import { makeClientId } from "../repositories/repoUtils";
import { maintenanceSlipsRepo } from "../repositories/maintenanceSlipsRepo";
import { enqueueMaintenanceSlipUpsert } from "../sync/enqueueMaintenanceSlipUpsert";
import { getCurrentUserIdentitySnapshot } from "./userProfileService";
import { normalizeEmail, trimToNull } from "../utils/userIdentity";
import {
  buildMaintenanceReadingLabel,
  buildMaintenanceUnitLabel,
  defaultServiceRequest,
  normalizeVehicleSnapshot,
} from "../utils/vehicleMaintenance";
import type {
  MaintenanceSlip,
  MaintenanceSlipNote,
  MaintenanceSlipStatus,
} from "../types/MaintenanceSlip";

async function currentActor() {
  const snapshot = await getCurrentUserIdentitySnapshot();
  return {
    uid: trimToNull(snapshot.uid),
    displayName: trimToNull(snapshot.displayName),
    email: normalizeEmail(snapshot.email),
  };
}

function withDeviceMeta(slip: MaintenanceSlip): MaintenanceSlip {
  const { deviceId, appVersion } = getDeviceMeta();
  return {
    ...slip,
    deviceId,
    appVersion,
  };
}

async function persistAndQueue(slip: MaintenanceSlip): Promise<MaintenanceSlip> {
  const enriched = withDeviceMeta(slip);
  await maintenanceSlipsRepo.upsert(enriched);
  enqueueMaintenanceSlipUpsert(enriched);
  emitDbChanged();
  return enriched;
}

export const maintenanceSlipService = {
  async createAndEnqueue(input: Omit<MaintenanceSlip, "createdByUid" | "createdByDisplayName" | "createdByEmail" | "deviceId" | "appVersion">): Promise<MaintenanceSlip> {
    assertRolePermission("createMaintenanceSlip");
    const actor = await currentActor();
    const vehicleSnapshot = normalizeVehicleSnapshot(input.vehicleSnapshot);
    return persistAndQueue({
      ...input,
      vehicleSnapshot,
      vehicleSource: input.vehicleAssetId ? "linked_asset" : "manual_entry",
      unitLabel: buildMaintenanceUnitLabel(vehicleSnapshot, input.unitLabel),
      readingLabel: buildMaintenanceReadingLabel(vehicleSnapshot) ?? trimToNull(input.readingLabel),
      maintenanceCategory: trimToNull(input.maintenanceCategory),
      serviceRequest: defaultServiceRequest(input.serviceRequest),
      createdByUid: actor.uid,
      createdByDisplayName: actor.displayName,
      createdByEmail: actor.email,
      deviceId: null,
      appVersion: null,
    });
  },

  async saveAndEnqueue(slip: MaintenanceSlip): Promise<MaintenanceSlip> {
    assertRolePermission("editMaintenanceSlip");
    const vehicleSnapshot = normalizeVehicleSnapshot(slip.vehicleSnapshot);
    return persistAndQueue({
      ...slip,
      vehicleAssetId: trimToNull(slip.vehicleAssetId),
      vehicleSource: trimToNull(slip.vehicleAssetId) ? "linked_asset" : "manual_entry",
      vehicleSnapshot,
      unitLabel: buildMaintenanceUnitLabel(vehicleSnapshot, slip.unitLabel),
      issueTitle: slip.issueTitle.trim(),
      equipmentType: trimToNull(slip.equipmentType),
      maintenanceCategory: trimToNull(slip.maintenanceCategory),
      systemArea: trimToNull(slip.systemArea),
      issueDescription: trimToNull(slip.issueDescription),
      locationHint: trimToNull(slip.locationHint),
      readingLabel: buildMaintenanceReadingLabel(vehicleSnapshot) ?? trimToNull(slip.readingLabel),
      serviceRequest: defaultServiceRequest(slip.serviceRequest),
      assignedToUid: trimToNull(slip.assignedToUid),
      assignedToName: trimToNull(slip.assignedToName),
      assignedToEmail: normalizeEmail(slip.assignedToEmail),
    });
  },

  async appendNoteAndEnqueue(args: {
    orgId: string;
    id: string;
    body: string;
    kind?: MaintenanceSlipNote["kind"];
  }): Promise<MaintenanceSlip> {
    assertRolePermission("editMaintenanceSlip");
    const existing = await maintenanceSlipsRepo.getById({ orgId: args.orgId, id: args.id });
    if (!existing) throw new Error("Maintenance slip not found.");

    const actor = await currentActor();
    const body = args.body.trim();
    if (!body) throw new Error("Enter a note before saving.");

    const note: MaintenanceSlipNote = {
      id: makeClientId("maint_note"),
      kind: args.kind ?? "note",
      body,
      createdAt: Date.now(),
      createdByUid: actor.uid,
      createdByDisplayName: actor.displayName,
      createdByEmail: actor.email,
    };

    return persistAndQueue({
      ...existing,
      updatedAt: Date.now(),
      notes: [...(existing.notes ?? []), note],
    });
  },

  async updateStatusAndEnqueue(args: {
    orgId: string;
    id: string;
    status: MaintenanceSlipStatus;
    noteBody?: string | null;
  }): Promise<MaintenanceSlip> {
    assertRolePermission("editMaintenanceSlip");
    const existing = await maintenanceSlipsRepo.getById({ orgId: args.orgId, id: args.id });
    if (!existing) throw new Error("Maintenance slip not found.");
    if (existing.status === args.status && !String(args.noteBody ?? "").trim()) {
      return existing;
    }

    const actor = await currentActor();
    const now = Date.now();
    const statusNote = existing.status === args.status
      ? null
      : {
          id: makeClientId("maint_status"),
          kind: "status" as const,
          body: `Status changed from ${existing.status.replace(/_/g, " ")} to ${args.status.replace(/_/g, " ")}.`,
          createdAt: now,
          createdByUid: actor.uid,
          createdByDisplayName: actor.displayName,
          createdByEmail: actor.email,
        };
    const manualNoteBody = String(args.noteBody ?? "").trim();
    const manualNote = manualNoteBody
      ? {
          id: makeClientId("maint_note"),
          kind: "note" as const,
          body: manualNoteBody,
          createdAt: now,
          createdByUid: actor.uid,
          createdByDisplayName: actor.displayName,
          createdByEmail: actor.email,
        }
      : null;

    return persistAndQueue({
      ...existing,
      status: args.status,
      updatedAt: now,
      notes: [...(existing.notes ?? []), ...(statusNote ? [statusNote] : []), ...(manualNote ? [manualNote] : [])],
      lastStatusChangedAt: now,
      lastStatusChangedByUid: actor.uid,
      lastStatusChangedByDisplayName: actor.displayName,
      lastStatusChangedByEmail: actor.email,
      resolvedAt: args.status === "resolved" ? now : null,
      resolvedByUid: args.status === "resolved" ? actor.uid : null,
      resolvedByDisplayName: args.status === "resolved" ? actor.displayName : null,
      resolvedByEmail: args.status === "resolved" ? actor.email : null,
    });
  },
};
