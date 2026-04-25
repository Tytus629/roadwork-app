// src/services/workOrdersService.ts
//
// Canonical write path for work orders.
//
// All work order mutations flow through here:
//   1. Write canonical row → workOrdersRepo.upsert / updateFields
//   2. Enqueue sync job → saveAndEnqueueWorkOrder (offline outbox)
//   3. Emit DbEvents → all hooks re-fetch
//
// No screens / components should call db.executeSync() for work orders anymore.

import { WorkOrder } from "../types/WorkOrder";
import { ensureDbSchemaReady } from "../db/migrations";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { saveAndEnqueueWorkOrder } from "../sync/enqueueWorkOrderUpsert";
import {
  deleteWorkOrder,
  upsertSignDetailsPatch,
} from "../db/workOrdersRepo";
import { emitDbChanged } from "../state/DbEvents";
import { autoLinkOrCreateAssetForWorkOrder } from "./assetAutoLink";
import { getDeviceMeta } from "../utils/deviceMeta";
import { normalizeWorkOrderDetailsForType } from "../workOrders/pavementDetails";
import { formatWorkType, normalizeWorkTypeKey } from "../constants/workOrderTypes";
import { toCreatorIdentitySnapshot, trimToNull } from "../utils/userIdentity";
import { assertRolePermission } from "../permissions/rolePermissions";
import { addLogEntry } from "./logService";
import { listAssignableOrgMembers } from "./orgMembersService";
import { getCurrentUserIdentitySnapshot } from "./userProfileService";
import { addWorkOrderNoteActivity } from "./workOrderNoteActivityService";

function humanizeCode(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "Unknown";
  return raw
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function equalNullable(left: string | null | undefined, right: string | null | undefined): boolean {
  return (left ?? null) === (right ?? null);
}

function buildChangedFieldLabels(patch: Record<string, unknown>): string[] {
  const labels: string[] = [];
  if (patch.type !== undefined) labels.push("type");
  if (patch.priority !== undefined) labels.push("priority");
  if (patch.note !== undefined) labels.push("notes");
  if (patch.details !== undefined) labels.push("details");
  if (patch.assetId !== undefined || patch.assetMatch !== undefined) labels.push("asset link");
  return labels;
}

// ─── Canonical work-order service ─────────────────────────────────────

export const workOrdersService = {
  /**
   * Canonical create / upsert path:
   * 0) auto-link / auto-create asset locally (offline-first)
   * 1) write SQLite (work_orders)
   * 2) enqueue outbox job (offline_work_orders + outbox)
   * 3) emit DbEvents so hooks re-fetch
   */
  async upsertAndEnqueue(wo: WorkOrder) {
    assertRolePermission("createWorkOrder");
    ensureDbSchemaReady("workOrdersService.upsertAndEnqueue");

    const existing = await workOrdersRepo.getById({
      orgId: wo.orgId,
      id: wo.id,
    });

    const { deviceId, appVersion } = getDeviceMeta();
    const creator = toCreatorIdentitySnapshot({
      uid: wo.createdByUid,
      email: wo.createdByEmail,
      firstName: wo.createdByFirstName,
      lastName: wo.createdByLastName,
      displayName: wo.createdByDisplayName,
    });

    const canonicalType = normalizeWorkTypeKey(wo.type) || String(wo.type ?? "").trim();

    const enriched: WorkOrder = {
      ...wo,
      type: canonicalType,
      deviceId,
      appVersion,
      createdByUid: creator.uid,
      createdByEmail: creator.email,
      createdByFirstName: creator.firstName,
      createdByLastName: creator.lastName,
      createdByDisplayName: creator.displayName,
      details: normalizeWorkOrderDetailsForType(canonicalType, wo.details),
    };

    // Auto-link/create asset (sets assetId + assetMatch on the returned copy)
    const withAsset = await autoLinkOrCreateAssetForWorkOrder(enriched);

    await workOrdersRepo.upsert(withAsset);
    saveAndEnqueueWorkOrder(withAsset);
    if (!existing) {
      addLogEntry({
        workOrderId: withAsset.id,
        orgId: withAsset.orgId,
        event: "created",
        message: `Created ${formatWorkType(withAsset.type)}`,
        payload: {
          actorUid: creator.uid,
          actorEmail: creator.email,
          actorDisplayName: creator.displayName,
          targetType: "work_order",
          workOrderType: withAsset.type,
        },
      });
    }
    if (trimToNull(withAsset.note)) {
      const members = await listAssignableOrgMembers(withAsset.orgId).catch(() => []);
      addWorkOrderNoteActivity({
        workOrder: withAsset,
        previousNote: null,
        nextNote: withAsset.note ?? null,
        members,
        actor: {
          uid: creator.uid,
          email: creator.email,
          displayName: creator.displayName,
        },
      });
    }
    emitDbChanged();
  },

  /**
   * Update individual fields safely + enqueue.
   * Use this for status / priority / note / details changes.
   */
  async patchAndEnqueue(args: {
    orgId: string;
    id: string;
    patch: Partial<
      Pick<
        WorkOrder,
        | "type"
        | "status"
        | "priority"
        | "note"
        | "details"
        | "assetId"
        | "assetMatch"
        | "assignedToUid"
        | "assignedToName"
        | "assignedToEmail"
      >
    >;
  }) {
    if (args.patch.status !== undefined || args.patch.priority !== undefined) {
      assertRolePermission("changeStatusPriority");
    } else {
      assertRolePermission("editWorkOrder");
    }

    ensureDbSchemaReady("workOrdersService.patchAndEnqueue");

    const current = await workOrdersRepo.getById({
      orgId: args.orgId,
      id: args.id,
    });
    if (!current) {
      throw new Error(`patchAndEnqueue: work order not found id=${args.id}`);
    }

    const canonicalType = normalizeWorkTypeKey(current.type) || String(current.type ?? "").trim();
    const currentType = String(current.type ?? "").trim();

    let patchForWrite = args.patch;
    if (args.patch.details !== undefined) {
      patchForWrite = {
        ...args.patch,
        details: normalizeWorkOrderDetailsForType(
          canonicalType,
          args.patch.details,
        ),
      };
    }

    if (canonicalType && canonicalType !== currentType) {
      patchForWrite = {
        ...patchForWrite,
        type: canonicalType,
      };
    }

    // 1) update canonical row
    await workOrdersRepo.updateFields({
      orgId: args.orgId,
      id: args.id,
      patch: { ...patchForWrite, updatedAt: Date.now() },
    });

    // 2) fetch the updated row so enqueue has full object
    const updated = await workOrdersRepo.getById({
      orgId: args.orgId,
      id: args.id,
    });
    if (!updated) {
      throw new Error(
        `patchAndEnqueue: work order not found id=${args.id}`,
      );
    }

    let actor = toCreatorIdentitySnapshot({});
    try {
      actor = toCreatorIdentitySnapshot(await getCurrentUserIdentitySnapshot());
    } catch (error) {
      console.warn("[workOrdersService] Could not resolve current user identity for activity log", error);
    }

    if (current.status !== updated.status) {
      addLogEntry({
        workOrderId: updated.id,
        orgId: updated.orgId,
        event: "status_changed",
        message: `Changed status from ${humanizeCode(current.status)} to ${humanizeCode(updated.status)}`,
        payload: {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorDisplayName: actor.displayName,
          targetType: "work_order",
          workOrderType: updated.type,
          statusFrom: current.status,
          statusTo: updated.status,
        },
      });
    }

    const assignmentChanged =
      !equalNullable(current.assignedToUid, updated.assignedToUid) ||
      !equalNullable(current.assignedToName, updated.assignedToName) ||
      !equalNullable(current.assignedToEmail, updated.assignedToEmail);

    if (assignmentChanged) {
      addLogEntry({
        workOrderId: updated.id,
        orgId: updated.orgId,
        event: "assignment_changed",
        message: "Updated assignment",
        payload: {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorDisplayName: actor.displayName,
          targetType: "work_order",
          workOrderType: updated.type,
          assignedFromUid: current.assignedToUid ?? null,
          assignedFromName: current.assignedToName ?? null,
          assignedFromEmail: current.assignedToEmail ?? null,
          assignedToUid: updated.assignedToUid ?? null,
          assignedToName: updated.assignedToName ?? null,
          assignedToEmail: updated.assignedToEmail ?? null,
        },
      });
    }

    const noteChanged = !equalNullable(current.note, updated.note);
    if (noteChanged) {
      const members = await listAssignableOrgMembers(args.orgId).catch(() => []);
      addWorkOrderNoteActivity({
        workOrder: updated,
        previousNote: current.note ?? null,
        nextNote: updated.note ?? null,
        members,
        actor: {
          uid: actor.uid,
          email: actor.email,
          displayName: actor.displayName,
        },
      });
    }

    const changedFieldLabels = buildChangedFieldLabels(patchForWrite as Record<string, unknown>)
      .filter((label) => !(noteChanged && label === "notes"));
    if (changedFieldLabels.length > 0) {
      addLogEntry({
        workOrderId: updated.id,
        orgId: updated.orgId,
        event: "updated",
        message: `Updated ${formatWorkType(updated.type)}`,
        payload: {
          actorUid: actor.uid,
          actorEmail: actor.email,
          actorDisplayName: actor.displayName,
          targetType: "work_order",
          workOrderType: updated.type,
          changedFieldLabels,
        },
      });
    }

    // 3) enqueue + notify UI
    saveAndEnqueueWorkOrder(updated);
    emitDbChanged();
  },
};

// ─── Sign details (separate sign_details table — not through workOrdersRepo) ──

export function updateSignDetails(args: {
  workOrderId: string;
  signTypeId?: string | null;
  category?: string | null;
  condition?: string | null;
  action?: string | null;
  reflectivityIssue?: boolean | null;

  // MUTCD Sign Catalog fields
  signCategory?: string | null;
  signCode?: string | null;
  signName?: string | null;

  // Inspection sheet fields
  inspectionVisible?: boolean;
  reflectivityScore?: number | null;
  delaminationScore?: number | null;
  appearanceScore?: number | null;
  postMaterial?: "Wood" | "Steel" | null;
  postConditionScore?: number | null;
  inspectionLastSavedAt?: number | null;
}) {
  assertRolePermission("editWorkOrder");

  const patch: Record<string, any> = {};

  if ("signTypeId" in args) patch.signTypeId = args.signTypeId ?? null;
  if ("category" in args) patch.category = args.category ?? null;
  if ("condition" in args) patch.condition = args.condition ?? null;
  if ("action" in args) patch.action = args.action ?? null;
  if ("reflectivityIssue" in args) {
    patch.reflectivityIssue =
      args.reflectivityIssue == null ? null : args.reflectivityIssue ? 1 : 0;
  }

  if ("signCategory" in args) patch.signCategory = args.signCategory ?? null;
  if ("signCode" in args) patch.signCode = args.signCode ?? null;
  if ("signName" in args) patch.signName = args.signName ?? null;

  if ("inspectionVisible" in args)
    patch.inspectionVisible = args.inspectionVisible ? 1 : 0;
  if ("reflectivityScore" in args)
    patch.reflectivityScore = args.reflectivityScore ?? null;
  if ("delaminationScore" in args)
    patch.delaminationScore = args.delaminationScore ?? null;
  if ("appearanceScore" in args)
    patch.appearanceScore = args.appearanceScore ?? null;
  if ("postMaterial" in args) patch.postMaterial = args.postMaterial ?? null;
  if ("postConditionScore" in args)
    patch.postConditionScore = args.postConditionScore ?? null;
  if ("inspectionLastSavedAt" in args)
    patch.inspectionLastSavedAt = args.inspectionLastSavedAt ?? null;

  upsertSignDetailsPatch(args.workOrderId, patch);
  emitDbChanged();
}

// ─── Delete (still uses legacy db/workOrdersRepo for now) ─────────────

export function removeWorkOrder(id: string, orgId: string) {
  assertRolePermission("deleteWorkOrder");
  deleteWorkOrder(id, orgId);
  emitDbChanged();
}
