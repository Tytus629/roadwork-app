import {
  addOperationsListItem,
  archiveOperationsList,
  createOperationsList,
  getOperationsListDetail,
  listOperationsLists,
  updateOperationsListItem,
  updateOperationsListItemStatus,
} from "../api/operationsLists";
import type {
  OperationsItemStatus,
  OperationsList,
  OperationsListItem,
  OperationsListStatus,
  OperationsProgramType,
} from "../types/OperationsList";

export const operationsListsService = {
  async listLists(args: { orgId: string; status?: OperationsListStatus }): Promise<OperationsList[]> {
    return listOperationsLists(args);
  },

  async getListDetail(args: {
    orgId: string;
    listId: string;
  }): Promise<{ list: OperationsList; items: OperationsListItem[] }> {
    return getOperationsListDetail(args);
  },

  async createList(args: {
    orgId: string;
    title: string;
    programType: OperationsProgramType | string;
    seasonYear?: number | null;
    description?: string | null;
  }): Promise<{ listId: string }> {
    return createOperationsList(args);
  },

  async addItem(args: {
    orgId: string;
    listId: string;
    roadName: string;
    segmentLabel?: string | null;
    notes?: string | null;
    priority?: "low" | "medium" | "high" | "urgent" | null;
    assignedCrew?: string | null;
  }): Promise<{ itemId: string }> {
    return addOperationsListItem(args);
  },

  async setItemStatus(args: {
    orgId: string;
    listId: string;
    itemId: string;
    status: OperationsItemStatus;
  }): Promise<{ ok: boolean }> {
    return updateOperationsListItemStatus(args);
  },

  async updateItem(args: {
    orgId: string;
    listId: string;
    itemId: string;
    patch: Partial<OperationsListItem>;
  }): Promise<{ ok: boolean }> {
    return updateOperationsListItem(args);
  },

  async setListActive(args: {
    orgId: string;
    listId: string;
    status: OperationsListStatus;
  }): Promise<{ ok: boolean }> {
    return archiveOperationsList(args);
  },
};
