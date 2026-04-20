import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "settings.colorblindMode.v1";

let cache: boolean | null = null;
const listeners = new Set<(value: boolean) => void>();

function emit(value: boolean) {
  for (const listener of listeners) {
    listener(value);
  }
}

export async function getColorblindModePreference(): Promise<boolean> {
  if (cache != null) return cache;

  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw == null) {
      cache = false;
      return cache;
    }

    const parsed = JSON.parse(raw);
    cache = !!parsed;
    return cache;
  } catch {
    cache = false;
    return cache;
  }
}

export async function setColorblindModePreference(value: boolean): Promise<void> {
  cache = value;
  await AsyncStorage.setItem(KEY, JSON.stringify(value));
  emit(value);
}

export function subscribeColorblindModePreference(listener: (value: boolean) => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useColorblindModePreference(): boolean {
  const [value, setValue] = useState(false);

  useEffect(() => {
    let mounted = true;

    getColorblindModePreference().then((current) => {
      if (mounted) setValue(current);
    });

    const unsubscribe = subscribeColorblindModePreference((next) => {
      setValue(next);
    });

    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  return value;
}
