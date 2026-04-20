import type { AssetType } from "../types/Asset";

export type MapCreateWorkOrderPayload = {
  assetId: string;
  assetType: AssetType;
  latitude: number;
  longitude: number;
  linePoints?: Array<{ lat: number; lng: number }>;
};

type Listener = (payload: MapCreateWorkOrderPayload) => void;

let listeners: Listener[] = [];
let lastPayload: MapCreateWorkOrderPayload | null = null;

export function requestMapCreateWorkOrderFromAsset(payload: MapCreateWorkOrderPayload) {
  lastPayload = payload;
  for (const listener of listeners) listener(payload);
}

export function subscribeMapCreateWorkOrder(listener: Listener) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((x) => x !== listener);
  };
}

export function peekLastMapCreateWorkOrder() {
  return lastPayload;
}

export function clearLastMapCreateWorkOrder() {
  lastPayload = null;
}
