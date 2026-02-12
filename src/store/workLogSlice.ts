import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { WorkLogEntry } from "../types/workLog";

type WorkLogState = {
  entries: WorkLogEntry[];
};

const initialState: WorkLogState = {
  entries: [],
};

const workLogSlice = createSlice({
  name: "workLog",
  initialState,
  reducers: {
    addLog(state, action: PayloadAction<WorkLogEntry>) {
      state.entries.unshift(action.payload);
    },
    clearLogs(state) {
      state.entries = [];
    },
  },
});

export const { addLog, clearLogs } = workLogSlice.actions;
export default workLogSlice.reducer;
