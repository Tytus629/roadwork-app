/**
 * workOrdersService.ts
 * 
 * PURPOSE:
 * Service layer that wraps database operations for work orders.
 * All database writes should go through this service (never call repo functions directly from UI).
 * 
 * KEY RESPONSIBILITIES:
 * - Create point and line work orders
 * - Update work order fields (status, priority, note)
 * - Update sign-specific details (sign type, condition, etc.)
 * - Delete work orders
 * - Emit DbEvents after every change to trigger UI updates
 * 
 * ARCHITECTURE PATTERN:
 * UI Components → Service Functions → Database Repo Functions → SQLite → DbEvents → Hooks → UI
 * 
 * WHY THIS LAYER:
 * 1. Single place to emit DbEvents (don't forget in UI code)
 * 2. Consistent error handling (can add try/catch here)
 * 3. Business logic (validation, side effects) separate from UI and DB
 * 4. Easy to add logging, analytics, API sync in future
 * 
 * DATA FLOW EXAMPLE (updating status):
 * 1. User taps "In Progress" chip in WorkItemSheet
 * 2. WorkItemSheet calls: updateWorkOrder({ id, status: "In Progress" })
 * 3. This file calls: updateWorkOrderFields(args) → writes to SQLite
 * 4. This file calls: emitDbChanged() → global event
 * 5. All hooked components (useWorkOrder, useMapWorkOrders, etc.) re-fetch
 * 6. WorkItemSheet shows updated status
 * 
 * SIGN DETAILS PATTERN:
 * - work_orders table: Generic fields (id, type, status, priority, etc.)
 * - sign_details table: Sign-specific fields (signTypeId, condition, etc.)
 * - Foreign key: sign_details.workOrderId → work_orders.id
 * - upsertSignDetails: Creates or updates sign_details row (INSERT OR REPLACE)
 * - Keeps database normalized and extensible for other work types
 */

import {
  deleteWorkOrder,
  updateWorkOrderFields,
  upsertSignDetailsPatch,
  upsertWorkOrderLine,
  upsertWorkOrderPoint,
} from "../db/workOrdersRepo";
import type { LatLng } from "../db/types";
import { emitDbChanged } from "../state/DbEvents";

/**
 * Create a point work order (single GPS coordinate)
 * Used for: Signs, Potholes, Street Lights, etc. at specific locations
 * Default values: Needs + High priority (user can change immediately)
 */
export function createPointWorkOrder(args: {
  id: string;
  type: string;
  status: string;
  priority: string;
  note?: string | null;
  point: LatLng;
  createdAt?: number;
}) {
  upsertWorkOrderPoint(args);
  emitDbChanged();
}

export function createLineWorkOrder(args: {
  id: string;
  type: string;
  status: string;
  priority: string;
  note?: string | null;
  points: LatLng[];
  createdAt?: number;
}) {
  upsertWorkOrderLine(args);
  emitDbChanged();
}

export function updateWorkOrder(args: {
  id: string;
  status?: string;
  priority?: string;
  note?: string | null;
}) {
  updateWorkOrderFields(args);
  emitDbChanged();
}

export function updateSignDetails(args: {
  workOrderId: string;
  signTypeId?: string | null;
  category?: string | null;
  condition?: string | null;
  action?: string | null;
  reflectivityIssue?: boolean | null;
  
  // Inspection sheet fields
  inspectionVisible?: boolean;
  reflectivityScore?: number | null;
  delaminationScore?: number | null;
  appearanceScore?: number | null;
  postMaterial?: "Wood" | "Steel" | null;
  postConditionScore?: number | null;
  inspectionLastSavedAt?: number | null;
}) {
  const patch: Record<string, any> = {};

  // Original fields
  if ("signTypeId" in args) patch.signTypeId = args.signTypeId ?? null;
  if ("category" in args) patch.category = args.category ?? null;
  if ("condition" in args) patch.condition = args.condition ?? null;
  if ("action" in args) patch.action = args.action ?? null;
  if ("reflectivityIssue" in args) {
    patch.reflectivityIssue = args.reflectivityIssue == null ? null : (args.reflectivityIssue ? 1 : 0);
  }

  // Inspection sheet fields
  if ("inspectionVisible" in args) patch.inspectionVisible = args.inspectionVisible ? 1 : 0;
  if ("reflectivityScore" in args) patch.reflectivityScore = args.reflectivityScore ?? null;
  if ("delaminationScore" in args) patch.delaminationScore = args.delaminationScore ?? null;
  if ("appearanceScore" in args) patch.appearanceScore = args.appearanceScore ?? null;
  if ("postMaterial" in args) patch.postMaterial = args.postMaterial ?? null;
  if ("postConditionScore" in args) patch.postConditionScore = args.postConditionScore ?? null;
  if ("inspectionLastSavedAt" in args) patch.inspectionLastSavedAt = args.inspectionLastSavedAt ?? null;

  upsertSignDetailsPatch(args.workOrderId, patch);
  emitDbChanged();
}

export function removeWorkOrder(id: string) {
  deleteWorkOrder(id);
  emitDbChanged();
}
