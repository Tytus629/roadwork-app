// src/dev/devFlagStore.ts
import AsyncStorage from "@react-native-async-storage/async-storage";

type DevFlags = {
  enableStartupWipe: boolean;
  enableOutboxClearOnStart: boolean;
};

const KEY = "DEV_FLAGS_V1";

const DEFAULTS: DevFlags = {
  enableStartupWipe: false,
  enableOutboxClearOnStart: false,
};

let cache: DevFlags = { ...DEFAULTS };
let loaded = false;

export const DevFlagStore = {
  defaults(): DevFlags {
    return { ...DEFAULTS };
  },

  get(): DevFlags {
    return { ...cache };
  },

  async load(): Promise<DevFlags> {
    if (!__DEV__) {
      cache = { ...DEFAULTS };
      loaded = true;
      return DevFlagStore.get();
    }

    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<DevFlags>;
        cache = {
          enableStartupWipe: !!parsed.enableStartupWipe,
          enableOutboxClearOnStart: !!parsed.enableOutboxClearOnStart,
        };
      } else {
        cache = { ...DEFAULTS };
      }
    } catch {
      cache = { ...DEFAULTS };
    } finally {
      loaded = true;
    }

    return DevFlagStore.get();
  },

  isLoaded(): boolean {
    return loaded;
  },

  async set(next: Partial<DevFlags>): Promise<DevFlags> {
    cache = { ...cache, ...next };

    if (__DEV__) {
      try {
        await AsyncStorage.setItem(KEY, JSON.stringify(cache));
      } catch {
        // ignore persistence errors in dev
      }
    }

    return DevFlagStore.get();
  },

  async reset(): Promise<DevFlags> {
    cache = { ...DEFAULTS };
    if (__DEV__) {
      try {
        await AsyncStorage.removeItem(KEY);
      } catch {}
    }
    return DevFlagStore.get();
  },
};
