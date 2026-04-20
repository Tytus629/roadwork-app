/**
 * useLogs.ts
 *
 * Reactive hook that reads log entries from SQLite.
 * Re-queries whenever a DbEvent fires.
 */

import { useState, useEffect } from "react";
import { listLogEntries, LogEntry } from "../services/logService";
import { subscribeDbChanged } from "../state/DbEvents";

export function useLogs(limit = 200, orgId?: string | null): LogEntry[] {
  const [entries, setEntries] = useState<LogEntry[]>([]);

  useEffect(() => {
    setEntries(listLogEntries(limit, orgId));
    const unsub = subscribeDbChanged(() => {
      setEntries(listLogEntries(limit, orgId));
    });
    return unsub;
  }, [limit, orgId]);

  return entries;
}
