import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { SignAsset, SignInspection } from "../types/Sign";
import { uid } from "../utils/uid";

/**
 * Signs State Management Context
 * 
 * Manages sign assets and their inspections in-memory.
 * Persistence will be re-connected when the sign-asset feature
 * migrates from the legacy storage layer to the new db/ layer.
 */

type SignsState = {
  signs: Record<string, SignAsset>;
  inspectionsBySign: Record<string, SignInspection[]>;
};

type SignsContextType = SignsState & {
  createSign: (sign: Omit<SignAsset, "id" | "createdAt" | "updatedAt" | "needsSync">) => SignAsset;
  updateSign: (id: string, patch: Partial<SignAsset>) => void;
  deleteSign: (id: string) => void;
  addInspection: (signId: string, inspection: Omit<SignInspection, "id" | "signId" | "ts" | "needsSync">) => void;
  loadAllSigns: () => Promise<void>;
  getSignsNeedingInspection: (daysAhead?: number) => SignAsset[];
};

const SignsContext = createContext<SignsContextType | null>(null);

export function useSignsContext() {
  const ctx = useContext(SignsContext);
  if (!ctx) {
    throw new Error("useSignsContext must be used within SignsProvider");
  }
  return ctx;
}

export function SignsProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SignsState>({
    signs: {},
    inspectionsBySign: {},
  });

  // Load signs and inspections from DB on mount
  useEffect(() => {
    loadAllSigns();
  }, []);

  const loadAllSigns = async () => {
    // TODO: Re-connect to new db/ layer when sign-asset tables are migrated
    console.log("[SignsContext] loadAllSigns (in-memory only)");
  };

  const createSign = (signData: Omit<SignAsset, "id" | "createdAt" | "updatedAt" | "needsSync">): SignAsset => {
    const now = Date.now();
    const sign: SignAsset = {
      ...signData,
      id: uid(),
      createdAt: now,
      updatedAt: now,
      needsSync: true,
    };

    setState((prev) => ({
      ...prev,
      signs: { ...prev.signs, [sign.id]: sign },
      inspectionsBySign: { ...prev.inspectionsBySign, [sign.id]: [] },
    }));

    return sign;
  };

  const updateSign = (id: string, patch: Partial<SignAsset>) => {
    setState((prev) => {
      const existing = prev.signs[id];
      if (!existing) return prev;

      const updated: SignAsset = {
        ...existing,
        ...patch,
        updatedAt: Date.now(),
        needsSync: true,
      };

      return {
        ...prev,
        signs: { ...prev.signs, [id]: updated },
      };
    });
  };

  const deleteSign = (id: string) => {
    setState((prev) => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _rmSign, ...remainingSigns } = prev.signs;
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { [id]: _rmInsp, ...remainingInspections } = prev.inspectionsBySign;

      return {
        signs: remainingSigns,
        inspectionsBySign: remainingInspections,
      };
    });
  };

  const addInspection = (
    signId: string,
    inspectionData: Omit<SignInspection, "id" | "signId" | "ts" | "needsSync">
  ) => {
    const now = Date.now();
    const inspection: SignInspection = {
      ...inspectionData,
      id: uid(),
      signId,
      ts: now,
      needsSync: true,
    };

    setState((prev) => {
      const sign = prev.signs[signId];
      if (!sign) return prev;

      // Update sign summary fields
      const updatedSign: SignAsset = {
        ...sign,
        lastInspectionAt: now,
        lastResult: inspection.retroResult,
        // Default to 180 days for next inspection
        nextDueAt: now + 180 * 24 * 60 * 60 * 1000,
        updatedAt: now,
        needsSync: true,
      };

      // Add inspection to history
      const inspections = prev.inspectionsBySign[signId] || [];
      const updatedInspections = [inspection, ...inspections];

      return {
        signs: { ...prev.signs, [signId]: updatedSign },
        inspectionsBySign: { ...prev.inspectionsBySign, [signId]: updatedInspections },
      };
    });
  };

  const getSignsNeedingInspection = (daysAhead: number = 30): SignAsset[] => {
    const now = Date.now();
    const threshold = now + daysAhead * 24 * 60 * 60 * 1000;

    return Object.values(state.signs).filter((sign) => {
      if (!sign.nextDueAt) return false;
      return sign.nextDueAt <= threshold;
    }).sort((a, b) => (a.nextDueAt || 0) - (b.nextDueAt || 0));
  };

  return (
    <SignsContext.Provider
      value={{
        ...state,
        createSign,
        updateSign,
        deleteSign,
        addInspection,
        loadAllSigns,
        getSignsNeedingInspection,
      }}
    >
      {children}
    </SignsContext.Provider>
  );
}
