/**
 * ========================================
 * FilterContext.tsx
 * ========================================
 * 
 * PURPOSE:
 * - Provides a React Context for sharing work order filter state across screens
 * - Allows multiple screens to coordinate on a single set of filter criteria
 * - Alternative to local filter state (see WorkOrdersScreen for local approach)
 * 
 * WHEN TO USE THIS VS LOCAL STATE:
 * - Use FilterContext: When you want multiple screens to share the same filter
 *   (e.g., MapScreen and a toolbar both show/modify the same filters)
 * - Use Local State: When each screen maintains independent filters
 *   (e.g., WorkOrdersScreen uses local state for its own filtering)
 * 
 * CURRENT USAGE:
 * - FilterProvider wraps the app in RootNavigator or AppTabs
 * - useWorkOrderFilter hook accesses the shared filter state
 * - Any screen can read/write the filter, changes propagate to all consumers
 * 
 * DATA STRUCTURE:
 * - WorkOrderFilter: { types?, priority?, status?, bounds? }
 * - undefined = no filter (show all), array = filter by those values
 * - EMPTY constant: {} (no filters applied, show everything)
 * 
 * WHY CONTEXT INSTEAD OF REDUX?
 * - Simpler: No actions, reducers, or middleware needed
 * - Sufficient: Filter state is simple and doesn't need time-travel debugging
 * - Isolated: Filter state is UI-specific, not part of core data model
 * - Performance: useMemo prevents unnecessary re-renders
 * 
 * PATTERN USAGE:
 * - Read filter: const { filter } = useWorkOrderFilter();
 * - Update filter: setFilter({ ...filter, status: ["Needs", "In Progress"] });
 * - Clear filter: clearFilter(); // resets to EMPTY
 * 
 * INTEGRATION POINTS:
 * - useWorkOrdersFiltered: Hook that fetches work orders matching the filter
 * - MapScreen: Can read/write filter to show filtered pins
 * - WorkOrderFilterSheet: UI component for modifying filter settings
 * 
 * NOTE ON MULTIPLE FILTER APPROACHES:
 * - This codebase intentionally supports BOTH global (FilterContext) and local state
 * - WorkOrdersScreen uses local state for independence
 * - MapScreen could use FilterContext for coordination with other UI elements
 * - Choose the approach that matches your screen's requirements
 */

import React, { createContext, useContext, useMemo, useState } from "react";
import type { WorkOrderFilter } from "../db/types";

type FilterContextValue = {
  filter: WorkOrderFilter;
  setFilter: (next: WorkOrderFilter) => void;
  clearFilter: () => void;
};

const FilterContext = createContext<FilterContextValue | null>(null);

const EMPTY: WorkOrderFilter = {};

export function FilterProvider({ children }: { children: React.ReactNode }) {
  const [filter, setFilter] = useState<WorkOrderFilter>(EMPTY);

  const value = useMemo(
    () => ({
      filter,
      setFilter,
      clearFilter: () => setFilter(EMPTY),
    }),
    [filter]
  );

  return <FilterContext.Provider value={value}>{children}</FilterContext.Provider>;
}

export function useWorkOrderFilter() {
  const ctx = useContext(FilterContext);
  if (!ctx) throw new Error("useWorkOrderFilter must be used inside FilterProvider");
  return ctx;
}
