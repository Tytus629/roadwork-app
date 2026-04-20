// src/sync/syncScheduler.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// SYNC SCHEDULER — Exponential Backoff + Connectivity-Triggered Sync
// ═══════════════════════════════════════════════════════════════════════════
//
// PURPOSE:
// Drains the outbox by calling Cloud Functions to push locally-created
// work orders to Firestore. Uses exponential backoff (1.5s → 60s max)
// with jitter to avoid thundering herd on reconnect.
//
// HOW IT WORKS:
// 1. startSyncScheduler(orgId) initializes and subscribes to NetInfo
// 2. When outbox has items → schedules runOnce() after backoff delay
// 3. runOnce() calls trySyncOutbox() which processes the next outbox item
// 4. On success → resets backoff, schedules again if items remain
// 5. On failure → increases backoff, shows error in SyncStatusBanner
// 6. On connectivity change → if online, tries immediately (skips backoff)
//
// FORCE OFFLINE INTEGRATION:
// runOnce() and the NetInfo listener both check isForceOffline() from
// src/dev/devNetwork.ts. When force offline is active:
//   - runOnce() exits immediately without calling Cloud Functions
//   - NetInfo connectivity events are ignored
//   - Pending count is still refreshed (so UI shows correct badge)
//   - LOCAL reads/writes are NOT affected — only remote sync is blocked
//
// 250ms BANNER MINIMUM:
// The "Syncing…" banner is guaranteed visible for at least 250ms so field
// crews get visual feedback that sync happened. Without this, fast syncs
// on good connections would flash the banner too quickly to read.
//
// PUBLIC API:
// - startSyncScheduler(orgId) → returns cleanup function
// - stopSyncScheduler() → clears timers and state
// - manualSyncNow() → immediate sync attempt (resets backoff)
// - notifyEnqueued() → called after saving to outbox, triggers sync pass

import NetInfo from "@react-native-community/netinfo";
import { setSyncStatus } from "./syncStatus";
import { getOutboxPendingCount } from "./outboxRepo";
import { debugDumpPendingOutboxRows, trySyncOutbox } from "./outboxSync";
import { isForceOffline } from "../dev/devNetwork";

let timer: ReturnType<typeof setTimeout> | null = null;
let attempt = 0;
let currentOrgId: string | null = null;
let syncing = false;

const BASE_MS = 1_500;
const MAX_MS = 60_000;
const ENABLE_OUTBOX_CYCLE_DEBUG = false;

function nextDelayMs(): number {
  const exp = Math.min(MAX_MS, BASE_MS * Math.pow(2, attempt));
  const jitter = Math.floor(Math.random() * 400);
  return exp + jitter;
}

function refreshPending(): number {
  if (!currentOrgId) return 0;
  const pendingCount = getOutboxPendingCount(currentOrgId);
  setSyncStatus({
    pendingCount,
    state: pendingCount > 0 ? "pending" : "idle",
  });
  return pendingCount;
}

async function runOnce(_reason: string) {
  if (!currentOrgId) return;
  if (syncing) return;

  // DEV: block remote sync when Force Offline is on
  if (isForceOffline()) {
    refreshPending();
    return;
  }

  syncing = true;
  try {
    if (__DEV__ && ENABLE_OUTBOX_CYCLE_DEBUG) {
      debugDumpPendingOutboxRows(currentOrgId, _reason);
    }

    const pendingBefore = refreshPending();
    if (pendingBefore <= 0) {
      attempt = 0;
      return;
    }

    setSyncStatus({ state: "syncing", lastError: undefined });
    const t0 = Date.now();

    const res = await trySyncOutbox(currentOrgId);

    // Ensure "Syncing…" banner is visible for at least 250ms so crews see feedback
    const elapsed = Date.now() - t0;
    if (elapsed < 250) await new Promise<void>((r) => setTimeout(r, 250 - elapsed));

    const pendingAfter = refreshPending();

    // Success: reset backoff if we made progress or cleared queue
    if ((res?.synced ?? 0) > 0 || pendingAfter === 0) {
      attempt = 0;
      setSyncStatus({ lastSyncedAt: Date.now() });
    } else if (pendingAfter > 0 && res?.reason === "waiting-backoff") {
      // Rows are pending but all are still in per-row retry backoff windows.
      // Keep status as pending and align the next scheduler run to the next due row.
      attempt = 0;
      setSyncStatus({ state: "pending", lastError: undefined });
      const waitMs = Math.max(250, Number(res?.nextDueInMs ?? BASE_MS));
      schedule("waiting-backoff", waitMs);
      return;
    } else if (pendingAfter > 0) {
      // No progress — escalate backoff
      attempt += 1;
      const reason = res?.reason ?? "no-progress";
      setSyncStatus({ state: "error", lastError: `Sync stalled (${reason})` });
    }

    // Still pending? schedule another pass with backoff
    if (pendingAfter > 0) schedule("still-pending");
  } catch (e: any) {
    attempt += 1;
    setSyncStatus({
      state: "error",
      lastError: e?.message ?? String(e),
    });
    schedule("error");
  } finally {
    syncing = false;
  }
}

function schedule(reason: string, delayOverrideMs?: number) {
  if (!currentOrgId) return;
  if (timer) return; // already scheduled

  const delay =
    delayOverrideMs != null ? Math.max(250, Math.floor(delayOverrideMs)) : nextDelayMs();
  if (__DEV__) {
    console.log(`[SyncScheduler] scheduling retry in ${delay}ms (${reason})`);
  }
  timer = setTimeout(async () => {
    timer = null;
    await runOnce(`timer:${reason}`);
  }, delay);
}

// ─── Public API ──────────────────────────────────────────────────────────

export function stopSyncScheduler() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  attempt = 0;
  syncing = false;
  currentOrgId = null;
  setSyncStatus({ state: "idle", pendingCount: 0, lastError: undefined });
}

export function startSyncScheduler(orgId: string) {
  currentOrgId = orgId;

  // Initial pending refresh + attempt a sync once
  const pending = refreshPending();
  if (pending > 0) schedule("start");

  // If we regain connectivity, try immediately (no waiting for backoff)
  const unsub = NetInfo.addEventListener((state) => {
    if (isForceOffline()) return;
    const isOnline = !!state.isConnected && state.isInternetReachable !== false;
    if (isOnline) {
      // Clear any pending timer and try now
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      runOnce("net-online");
    }
  });

  // Return cleanup
  return () => {
    unsub();
    stopSyncScheduler();
  };
}

/**
 * Trigger an immediate sync attempt. Resets backoff.
 * Used by SyncStatusBanner tap and SettingsScreen "Sync Now" button.
 */
export async function manualSyncNow() {
  if (!currentOrgId) return;
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  attempt = 0; // manual sync resets backoff
  const pendingBefore = refreshPending();
  if (pendingBefore <= 0) return;

  setSyncStatus({ state: "syncing", lastError: undefined });
  const res = await trySyncOutbox(currentOrgId, { ignoreRowBackoff: true });
  const pendingAfter = refreshPending();

  if ((res?.synced ?? 0) > 0 || pendingAfter === 0) {
    setSyncStatus({ lastSyncedAt: Date.now(), state: pendingAfter > 0 ? "pending" : "idle" });
  }
}

/**
 * Notify the scheduler that new items were enqueued.
 * Refreshes pending count and triggers a sync pass.
 */
export function notifyEnqueued() {
  refreshPending();
  if (!syncing && currentOrgId) {
    // Attempt immediately (or schedule if already timing)
    runOnce("enqueued");
  }
}
