// src/sync/syncStatus.ts
//
// Single source of truth for sync state. Lightweight observable store
// that the SyncStatusBanner subscribes to and the scheduler drives.

type SyncState = "idle" | "pending" | "syncing" | "error";

export type SyncStatus = {
  state: SyncState;
  pendingCount: number;
  lastError?: string;
  lastSyncedAt?: number;
};

let status: SyncStatus = { state: "idle", pendingCount: 0 };
const listeners = new Set<(s: SyncStatus) => void>();

export function getSyncStatus(): SyncStatus {
  return status;
}

export function setSyncStatus(patch: Partial<SyncStatus>) {
  status = { ...status, ...patch };
  listeners.forEach((fn) => fn(status));
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void) {
  listeners.add(fn);
  fn(status); // immediately push current state
  return () => {
    listeners.delete(fn);
  };
}
