// src/context/AssetsContext.tsx
//
// Provides nearby assets for the map viewport.
// Loads from SQLite (offline-first), refreshes when viewport changes.

import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { assetsRepo } from "../repositories/assetsRepo";
import { Asset } from "../types/Asset";
import { subscribeDbChanged } from "../state/DbEvents";

type BBox = {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
};

type AssetsContextValue = {
  assets: Asset[];
  loadAssetsInViewport: (orgId: string, bbox: BBox) => Promise<void>;
  refreshAsset: (orgId: string, assetId: string) => Promise<void>;
};

const AssetsContext = createContext<AssetsContextValue | null>(null);

export function AssetsProvider({ children }: { children: React.ReactNode }) {
  const [assets, setAssets] = useState<Asset[]>([]);
  const lastViewportQueryRef = useRef<{ orgId: string; bbox: BBox } | null>(null);

  const loadAssetsInViewport = useCallback(async (orgId: string, bbox: BBox) => {
    lastViewportQueryRef.current = { orgId, bbox };
    const rows = await assetsRepo.getInViewport({ orgId, bbox });
    setAssets(rows);
  }, []);

  useEffect(() => {
    return subscribeDbChanged(() => {
      const last = lastViewportQueryRef.current;
      if (!last) return;
      loadAssetsInViewport(last.orgId, last.bbox).catch((e) => {
        if (__DEV__) {
          console.warn("[AssetsContext] failed to refresh viewport assets", e);
        }
      });
    });
  }, [loadAssetsInViewport]);

  async function refreshAsset(orgId: string, assetId: string) {
    const a = await assetsRepo.getById({ orgId, id: assetId });
    if (!a) return;

    setAssets((prev) => {
      const idx = prev.findIndex((p) => p.id === assetId);
      if (idx === -1) return prev;

      const next = [...prev];
      next[idx] = a;
      return next;
    });
  }

  return (
    <AssetsContext.Provider value={{ assets, loadAssetsInViewport, refreshAsset }}>
      {children}
    </AssetsContext.Provider>
  );
}

export function useAssets() {
  const ctx = useContext(AssetsContext);
  if (!ctx) throw new Error("useAssets must be used within AssetsProvider");
  return ctx;
}
