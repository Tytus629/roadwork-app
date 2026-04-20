import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { WORK_ORDER_TYPE_OPTIONS } from "../constants/workOrderTypes";
import type { WorkType } from "../types/workItem";

const KEY = "settings.workOrderTypeVisibility.v1";

export type WorkOrderTypeVisibilityMap = Record<WorkType, boolean>;

let cache: WorkOrderTypeVisibilityMap | null = null;
const listeners = new Set<(value: WorkOrderTypeVisibilityMap) => void>();

function buildAllVisibleMap(): WorkOrderTypeVisibilityMap {
  return WORK_ORDER_TYPE_OPTIONS.reduce((acc, option) => {
    acc[option.key] = true;
    return acc;
  }, {} as WorkOrderTypeVisibilityMap);
}

function hasAnyVisibleType(map: WorkOrderTypeVisibilityMap): boolean {
  return WORK_ORDER_TYPE_OPTIONS.some((option) => !!map[option.key]);
}

function sanitizeVisibilityMap(raw: unknown): WorkOrderTypeVisibilityMap {
  const defaults = buildAllVisibleMap();
  if (!raw || typeof raw !== "object") return defaults;

  const parsed = raw as Partial<Record<WorkType, unknown>>;
  const merged = WORK_ORDER_TYPE_OPTIONS.reduce((acc, option) => {
    const value = parsed[option.key];
    acc[option.key] = typeof value === "boolean" ? value : true;
    return acc;
  }, {} as WorkOrderTypeVisibilityMap);

  return hasAnyVisibleType(merged) ? merged : defaults;
}

function emit(value: WorkOrderTypeVisibilityMap) {
  for (const listener of listeners) {
    listener(value);
  }
}

export async function getWorkOrderTypeVisibilityPreference(): Promise<WorkOrderTypeVisibilityMap> {
  if (cache) return cache;

  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) {
      cache = buildAllVisibleMap();
      return cache;
    }

    cache = sanitizeVisibilityMap(JSON.parse(raw));
    return cache;
  } catch {
    cache = buildAllVisibleMap();
    return cache;
  }
}

export async function setWorkOrderTypeVisibilityPreference(value: Partial<WorkOrderTypeVisibilityMap>): Promise<WorkOrderTypeVisibilityMap> {
  const merged = sanitizeVisibilityMap(value);
  cache = merged;
  await AsyncStorage.setItem(KEY, JSON.stringify(merged));
  emit(merged);
  return merged;
}

export function subscribeWorkOrderTypeVisibilityPreference(
  listener: (value: WorkOrderTypeVisibilityMap) => void,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useWorkOrderTypeVisibilityPreference(): WorkOrderTypeVisibilityMap {
  const [value, setValue] = useState<WorkOrderTypeVisibilityMap>(buildAllVisibleMap());

  useEffect(() => {
    let mounted = true;

    getWorkOrderTypeVisibilityPreference().then((current) => {
      if (mounted) setValue(current);
    });

    const unsubscribe = subscribeWorkOrderTypeVisibilityPreference((next) => {
      setValue(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return value;
}
