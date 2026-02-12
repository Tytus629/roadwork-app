import type { WorkItem } from "../types/workItem";
import type { Filters, SortMode } from "../store/workItemsSlice";

function priorityScore(p: WorkItem["priority"]) {
  switch (p) {
    case "urgent": return 4;
    case "high": return 3;
    case "medium": return 2;
    case "low": return 1;
    default: return 0;
  }
}

export function selectVisibleWorkItems(
  items: WorkItem[],
  filters: Filters,
  sortMode: SortMode
): WorkItem[] {
  let out = items;

  // Filters
  if (filters.type && filters.type !== "all") out = out.filter(i => i.type === filters.type);
  if (filters.status && filters.status !== "all") out = out.filter(i => i.status === filters.status);
  if (filters.priority && filters.priority !== "all") out = out.filter(i => i.priority === filters.priority);

  // Sorts (nearest comes later when GPS is wired)
  out = [...out].sort((a, b) => {
    const aAge = a.createdAt ?? 0;
    const bAge = b.createdAt ?? 0;

    if (sortMode === "newest") return bAge - aAge;
    if (sortMode === "oldest") return aAge - bAge;

    if (sortMode === "priority") {
      return priorityScore(b.priority) - priorityScore(a.priority);
    }

    if (sortMode === "priority_then_oldest") {
      const p = priorityScore(b.priority) - priorityScore(a.priority);
      if (p !== 0) return p;
      // same priority → oldest first (sitting longest)
      return aAge - bAge;
    }

    // nearest (placeholder)
    return 0;
  });

  return out;
}
