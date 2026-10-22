/** One-shot channel: other screens (Drive Mode) ask the Map to open a work-order draft at a point. */
import type { WorkPhoto, WorkType } from "../types/workItem";

export type MapCreateFromPointPayload = { lat: number; lng: number; type: WorkType; note?: string | null; photos?: WorkPhoto[] };
type Listener = (p: MapCreateFromPointPayload) => void;

let listeners: Listener[] = [];
let last: MapCreateFromPointPayload | null = null;

export function requestMapCreateWorkOrderAtPoint(p: MapCreateFromPointPayload) {
  last = p;
  for (const l of listeners) l(p);
}
export function subscribeMapCreateAtPoint(l: Listener) {
  listeners.push(l);
  return () => {
    listeners = listeners.filter((x) => x !== l);
  };
}
export function takeLastMapCreateAtPoint(): MapCreateFromPointPayload | null {
  const p = last;
  last = null;
  return p;
}
