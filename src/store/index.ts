import { configureStore } from "@reduxjs/toolkit";
import workItemsReducer from "./workItemsSlice";
import workLogReducer from "./workLogSlice";

export const store = configureStore({
  reducer: {
    workItems: workItemsReducer,
    workLog: workLogReducer,
  },
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
