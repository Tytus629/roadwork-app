export type OperationsProgramType =
  | "crack_seal"
  | "snow_plow"
  | "shoulder_sweeping"
  | "other";

export type OperationsListStatus = "active" | "archived";

export type OperationsItemStatus =
  | "todo"
  | "not_started"
  | "in_progress"
  | "done"
  | "skipped"
  | "blocked";

export type OperationsListProgress = {
  total: number;
  done: number;
  inProgress: number;
  remaining: number;
};

export type OperationsTargetType = "road_segment" | "route_segment" | "road_asset" | "route_asset";

export type OperationsList = {
  id: string;
  orgId: string;
  title: string;
  programType: OperationsProgramType | string;
  status?: OperationsListStatus;
  seasonYear?: number | null;
  description?: string | null;
  active?: boolean;
  archivedAt?: number | null;
  createdAt?: number | null;
  updatedAt?: number | null;
  updatedByUid?: string | null;
  updatedByDisplayName?: string | null;
  progress?: OperationsListProgress | null;
  itemCounts?: {
    total?: number;
    done?: number;
    inProgress?: number;
    notStarted?: number;
    in_progress?: number;
    not_started?: number;
  } | null;

  // Future compatibility for asset/route linkage.
  targetType?: OperationsTargetType | null;
  targetRef?: Record<string, any> | null;
  assetRef?: Record<string, any> | null;
};

export type OperationsListItem = {
  id: string;
  orgId: string;
  listId: string;
  roadName: string;
  segmentLabel?: string | null;
  notes?: string | null;
  priority?: "low" | "medium" | "high" | "urgent" | null;
  assignedCrew?: string | null;
  status: OperationsItemStatus;

  updatedAt?: number | null;
  updatedByUid?: string | null;
  updatedByDisplayName?: string | null;
  doneAt?: number | null;
  doneByUid?: string | null;
  doneByDisplayName?: string | null;

  // Future compatibility for asset/route linkage.
  targetType?: OperationsTargetType | null;
  targetRef?: Record<string, any> | null;
  assetRef?: Record<string, any> | null;
};
