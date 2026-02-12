import {
  deleteWorkOrder,
  updateWorkOrderFields,
  upsertSignDetails,
  upsertWorkOrderLine,
  upsertWorkOrderPoint,
} from "../db/workOrdersRepo";
import type { LatLng } from "../db/types";
import { emitDbChanged } from "../state/DbEvents";

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
}) {
  upsertSignDetails({
    workOrderId: args.workOrderId,
    signTypeId: args.signTypeId ?? null,
    category: args.category ?? null,
    condition: args.condition ?? null,
    action: args.action ?? null,
    reflectivityIssue:
      args.reflectivityIssue === null || args.reflectivityIssue === undefined
        ? null
        : args.reflectivityIssue
        ? 1
        : 0,
  });
  emitDbChanged();
}

export function removeWorkOrder(id: string) {
  deleteWorkOrder(id);
  emitDbChanged();
}
