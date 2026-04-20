import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { getApp } from "@react-native-firebase/app";
import { requireOrgId } from "../org/requireOrg";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";
import type {
  OperationsItemStatus,
  OperationsList,
  OperationsListItem,
  OperationsProgramType,
  OperationsListStatus,
} from "../types/OperationsList";

type ListOperationsListsInput = {
  orgId: string;
  status?: OperationsListStatus;
};

type CreateOperationsListInput = {
  orgId: string;
  title: string;
  programType: OperationsProgramType | string;
  seasonYear?: number | null;
  description?: string | null;
};

type AddOperationsListItemInput = {
  orgId: string;
  listId: string;
  roadName: string;
  segmentLabel?: string | null;
  notes?: string | null;
  priority?: "low" | "medium" | "high" | "urgent" | null;
  assignedCrew?: string | null;
};

type UpdateOperationsListItemStatusInput = {
  orgId: string;
  listId: string;
  itemId: string;
  status: OperationsItemStatus;
};

type UpdateOperationsListItemInput = {
  orgId: string;
  listId: string;
  itemId: string;
  patch: Partial<OperationsListItem>;
};

type ArchiveOperationsListInput = {
  orgId: string;
  listId: string;
  status: OperationsListStatus;
};

type ListOperationsListsResponse = {
  lists: any[];
};

type GetOperationsListDetailResponse = {
  list: any;
  items: any[];
};

function toMillis(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  if (value && typeof value === "object") {
    const maybe = value as Record<string, any>;
    if (typeof maybe.toMillis === "function") {
      const ts = maybe.toMillis();
      return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
    }
    if (typeof maybe.seconds === "number") {
      return Math.trunc(maybe.seconds * 1000 + (typeof maybe.nanoseconds === "number" ? maybe.nanoseconds / 1e6 : 0));
    }
    if (typeof maybe._seconds === "number") {
      return Math.trunc(maybe._seconds * 1000 + (typeof maybe._nanoseconds === "number" ? maybe._nanoseconds / 1e6 : 0));
    }
  }
  return null;
}

function normalizeItemStatus(raw: unknown): OperationsItemStatus {
  const normalized = String(raw ?? "").trim().toLowerCase();
  if (normalized === "todo" || normalized === "not_started") return "not_started";
  if (normalized === "in_progress" || normalized === "done" || normalized === "skipped" || normalized === "blocked") {
    return normalized as OperationsItemStatus;
  }
  return "not_started";
}

function normalizeProgress(listLike: Record<string, any>) {
  const progress = listLike.progress ?? null;
  if (progress && typeof progress === "object") {
    const total = Number(progress.total ?? 0);
    const done = Number(progress.done ?? 0);
    const inProgress = Number(progress.inProgress ?? progress.in_progress ?? 0);
    const remaining =
      progress.remaining != null
        ? Number(progress.remaining)
        : Math.max(0, total - done - inProgress);
    return {
      total: Number.isFinite(total) ? total : 0,
      done: Number.isFinite(done) ? done : 0,
      inProgress: Number.isFinite(inProgress) ? inProgress : 0,
      remaining: Number.isFinite(remaining) ? remaining : 0,
    };
  }

  const counts = listLike.itemCounts ?? null;
  const total = Number(listLike.totalCount ?? counts?.total ?? 0);
  const done = Number(listLike.doneCount ?? counts?.done ?? 0);
  const inProgress = Number(
    listLike.inProgressCount ?? counts?.inProgress ?? counts?.in_progress ?? 0,
  );
  return {
    total: Number.isFinite(total) ? total : 0,
    done: Number.isFinite(done) ? done : 0,
    inProgress: Number.isFinite(inProgress) ? inProgress : 0,
    remaining: Math.max(0, (Number.isFinite(total) ? total : 0) - (Number.isFinite(done) ? done : 0) - (Number.isFinite(inProgress) ? inProgress : 0)),
  };
}

function normalizeList(raw: any): OperationsList {
  const src = (raw ?? {}) as Record<string, any>;
  const statusRaw = String(src.status ?? "").trim().toLowerCase();
  const status: OperationsListStatus = statusRaw === "archived" ? "archived" : "active";
  const updatedAt = toMillis(src.updatedAt) ?? toMillis(src.updatedAtMs);
  const archivedAt = toMillis(src.archivedAt);
  const active = src.active != null ? Boolean(src.active) : status !== "archived";

  return {
    ...(src as any),
    id: String(src.id ?? ""),
    status,
    active,
    archivedAt,
    updatedAt,
    createdAt: toMillis(src.createdAt),
    updatedByDisplayName: (src.updatedByDisplayName ?? src.updatedByName ?? src.modifiedByName ?? null) as string | null,
    progress: normalizeProgress(src),
  } as OperationsList;
}

function normalizeItem(raw: any): OperationsListItem {
  const src = (raw ?? {}) as Record<string, any>;
  return {
    ...(src as any),
    id: String(src.id ?? ""),
    status: normalizeItemStatus(src.status),
    updatedAt: toMillis(src.updatedAt),
    updatedByDisplayName: (src.updatedByDisplayName ?? src.updatedByName ?? src.modifiedByName ?? null) as string | null,
    doneAt: toMillis(src.doneAt ?? src.completedAt),
    doneByUid: (src.doneByUid ?? src.completedBy ?? null) as string | null,
    doneByDisplayName: (src.doneByDisplayName ?? src.doneByName ?? src.completedByName ?? null) as string | null,
  } as OperationsListItem;
}

async function callOperationsFn<T>(name: string, payload: Record<string, any>): Promise<T> {
  if (__DEV__) {
    return callDevFunctionHttp<T>(name, payload);
  }

  const functions = getFunctions(getApp());
  const fn = httpsCallable(functions, name);
  const res = await fn(payload);
  return res.data as T;
}

export async function listOperationsLists(input: ListOperationsListsInput): Promise<OperationsList[]> {
  const orgId = requireOrgId(input.orgId);
  const data = await callOperationsFn<ListOperationsListsResponse>("roadwork_listOperationsLists", {
    orgId,
    status: input.status,
  });
  return (data?.lists ?? []).map(normalizeList);
}

export async function createOperationsList(input: CreateOperationsListInput): Promise<{ listId: string }> {
  const orgId = requireOrgId(input.orgId);
  return callOperationsFn<{ listId: string }>("roadwork_createOperationsList", {
    ...input,
    orgId,
  });
}

export async function getOperationsListDetail(args: {
  orgId: string;
  listId: string;
}): Promise<GetOperationsListDetailResponse> {
  const orgId = requireOrgId(args.orgId);
  const data = await callOperationsFn<GetOperationsListDetailResponse>("roadwork_getOperationsListDetail", {
    orgId,
    listId: args.listId,
  });
  return {
    list: normalizeList(data?.list ?? {}),
    items: (data?.items ?? []).map(normalizeItem),
  };
}

export async function addOperationsListItem(
  input: AddOperationsListItemInput,
): Promise<{ itemId: string }> {
  const orgId = requireOrgId(input.orgId);
  return callOperationsFn<{ itemId: string }>("roadwork_addOperationsListItem", {
    ...input,
    orgId,
    priority: input.priority ?? null,
  });
}

export async function updateOperationsListItemStatus(
  input: UpdateOperationsListItemStatusInput,
): Promise<{ ok: boolean }> {
  const orgId = requireOrgId(input.orgId);
  return callOperationsFn<{ ok: boolean }>("roadwork_updateOperationsListItemStatus", {
    ...input,
    orgId,
  });
}

export async function updateOperationsListItem(
  input: UpdateOperationsListItemInput,
): Promise<{ ok: boolean }> {
  const orgId = requireOrgId(input.orgId);
  return callOperationsFn<{ ok: boolean }>("roadwork_updateOperationsListItem", {
    ...input,
    orgId,
  });
}

export async function archiveOperationsList(
  input: ArchiveOperationsListInput,
): Promise<{ ok: boolean }> {
  const orgId = requireOrgId(input.orgId);
  return callOperationsFn<{ ok: boolean }>("roadwork_archiveOperationsList", {
    orgId,
    listId: input.listId,
    status: input.status,
  });
}
