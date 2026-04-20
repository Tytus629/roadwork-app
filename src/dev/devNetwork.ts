// src/dev/devNetwork.ts
//
// ═══════════════════════════════════════════════════════════════════════════
// DEV-ONLY: "Force Offline" Toggle
// ═══════════════════════════════════════════════════════════════════════════
//
// PURPOSE:
// Simulates offline mode without actually disabling the network. Lets you
// test the full offline-first flow on a device with real connectivity.
//
// WHAT IT BLOCKS:
// - syncScheduler.ts checks isForceOffline() before every sync attempt
// - NetInfo connectivity listener in syncScheduler also checks it
// - Cloud Function calls are NOT made while force offline is active
//
// WHAT STILL WORKS:
// - Local SQLite reads and writes (all hooks continue to work)
// - Outbox enqueuing (saveAndEnqueueWorkOrder in enqueueWorkOrderUpsert.ts)
// - Creating/editing work orders — they just queue locally
//
// HOW TO USE:
// Settings → DEV section → "DEV Network" → toggle Force Offline
// When re-disabled, syncScheduler resumes and drains the outbox.
//
// INTEGRATION POINTS:
// - syncScheduler.ts → runOnce() and NetInfo listener call isForceOffline()
// - SettingsScreen.tsx → renders DevForceOfflineToggle component
// - Only active when __DEV__ is true (isForceOffline returns false in prod)

type DevNetState = {
  forceOffline: boolean;
};

let state: DevNetState = {
  forceOffline: false,
};

const listeners = new Set<(s: DevNetState) => void>();

export function getDevNetState() {
  return state;
}

export function setForceOffline(forceOffline: boolean) {
  state = { ...state, forceOffline };
  listeners.forEach((fn) => fn(state));
  console.log("[DEVNET] forceOffline =", forceOffline);
}

export function subscribeDevNet(fn: (s: DevNetState) => void) {
  listeners.add(fn);
  fn(state);
  return () => listeners.delete(fn);
}

export function isForceOffline() {
  return __DEV__ && state.forceOffline;
}
