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
