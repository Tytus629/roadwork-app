import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { WorkItem, WorkStatus, Priority, WorkType } from "../types/workItem";

type Filters = {
  type?: WorkType | "all";
  status?: WorkStatus | "all";
  priority?: Priority | "all";
};

type SortMode =
  | "nearest"          // (we'll implement when GPS is wired)
  | "newest"
  | "oldest"
  | "priority"
  | "priority_then_oldest";

type WorkItemsState = {
  items: WorkItem[];
  filters: Filters;
  sortMode: SortMode;
};

const initialState: WorkItemsState = {
  items: [],
  filters: { type: "all", status: "all", priority: "all" },
  sortMode: "priority_then_oldest",
};

const workItemsSlice = createSlice({
  name: "workItems",
  initialState,
  reducers: {
    // STEP D-4: Load all items from persistent storage
    loadAllWorkItems(state, action: PayloadAction<WorkItem[]>) {
      console.log("[reducer] LOAD_ALL", action.payload.length, "items");
      state.items = action.payload;
    },
    addWorkItem(state, action: PayloadAction<WorkItem>) {
      state.items.unshift(action.payload);
    },
    updateWorkItem(state, action: PayloadAction<{ id: string; patch: Partial<WorkItem> }>) {
      const idx = state.items.findIndex(i => i.id === action.payload.id);
      if (idx >= 0) {
        // Full replacement pattern to ensure all fields update properly
        const updated = {
          ...state.items[idx],
          ...action.payload.patch,
          // STEP 1: Mark as needing sync on any update
          needsSync: true,
          updatedAt: Date.now(),
        };
        state.items[idx] = updated;
        console.log("[reducer] UPDATE_ITEM", updated.id, "status=", updated.status, "completedAt=", updated.completedAt);
      } else {
        console.warn("[reducer] UPDATE_ITEM failed - item not found:", action.payload.id);
      }
    },
    deleteWorkItem(state, action: PayloadAction<string>) {
      state.items = state.items.filter(i => i.id !== action.payload);
    },
    setFilters(state, action: PayloadAction<Filters>) {
      state.filters = { ...state.filters, ...action.payload };
    },
    setSortMode(state, action: PayloadAction<SortMode>) {
      state.sortMode = action.payload;
    },
    clearAll(state) {
      state.items = [];
    },
  },
});

export const {
  loadAllWorkItems,
  addWorkItem,
  updateWorkItem,
  deleteWorkItem,
  setFilters,
  setSortMode,
  clearAll,
} = workItemsSlice.actions;

export default workItemsSlice.reducer;

export type { Filters, SortMode };
