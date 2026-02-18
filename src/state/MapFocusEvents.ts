/**
 * MapFocusEvents.ts
 * 
 * PURPOSE:
 * Event bus for "Show on Map" navigation.
 * Allows any screen to request the Map tab to focus on a specific work order location.
 * 
 * USAGE:
 * - From WorkItemSheet or list screens: focusMapOnWorkOrder({ workOrderId, latitude, longitude })
 * - MapScreen subscribes and animates to the location when event fires
 * - MapScreen can also pull pending focus on map ready via peekLastMapFocus()
 */

export type MapFocusPayload = {
  workOrderId: string;
  latitude: number;
  longitude: number;
  zoom?: "close" | "street" | "wide";
};

type Listener = (p: MapFocusPayload) => void;

let listeners: Listener[] = [];
let lastPayload: MapFocusPayload | null = null;

/**
 * Request the map to focus on a specific work order location.
 * Call this before navigating to the Map tab.
 */
export function focusMapOnWorkOrder(payload: MapFocusPayload) {
  lastPayload = payload;
  console.log("[MapFocusEvents] focusMapOnWorkOrder:", payload);
  for (const l of listeners) l(payload);
}

/**
 * Subscribe to map focus events.
 * Returns unsubscribe function.
 * Does NOT auto-replay - MapScreen should pull via peekLastMapFocus when ready.
 */
export function subscribeMapFocus(listener: Listener) {
  listeners.push(listener);
  // Do NOT auto-replay here (MapScreen pulls when it's ready)
  return () => {
    listeners = listeners.filter((x) => x !== listener);
  };
}

/**
 * Peek at the last focus payload (for MapScreen to pull on mount/ready).
 */
export function peekLastMapFocus() {
  return lastPayload;
}

/**
 * Clear the last focus payload (call after handling to prevent replay).
 */
export function clearLastMapFocus() {
  lastPayload = null;
}
