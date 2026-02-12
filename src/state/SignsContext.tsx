import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import type { SignAsset, SignInspection } from "../types/Sign";
import { upsertSign, getAllSigns, addInspection as addInspectionToDb, getInspectionsForSign } from "../storage/signRepo";
import { uid } from "../utils/uid";

/**
 * Signs State Management Context
 * 
 * Manages sign assets and their inspections with offline-first approach.
 * Always works without DB (catch + warn).
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
    try {
      const signs = await getAllSigns();
      const signsById: Record<string, SignAsset> = {};
      const inspectionsBySign: Record<string, SignInspection[]> = {};

      for (const sign of signs) {
        signsById[sign.id] = sign;
        const inspections = await getInspectionsForSign(sign.id);
        inspectionsBySign[sign.id] = inspections;
      }

      setState({ signs: signsById, inspectionsBySign });
      console.log(`[SignsContext] Loaded ${signs.length} signs`);
    } catch (error) {
      console.warn("[SignsContext] Failed to load signs (running without persistence):", error);
    }
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

    // Persist to DB
    upsertSign(sign).catch((e) => console.warn("[createSign] Failed to persist:", e));

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

      // Persist to DB
      upsertSign(updated).catch((e) => console.warn("[updateSign] Failed to persist:", e));

      return {
        ...prev,
        signs: { ...prev.signs, [id]: updated },
      };
    });
  };

  const deleteSign = (id: string) => {
    setState((prev) => {
      const { [id]: _removed, ...remainingSigns } = prev.signs;
      const { [id]: _removedInspections, ...remainingInspections } = prev.inspectionsBySign;

      return {
        signs: remainingSigns,
        inspectionsBySign: remainingInspections,
      };
    });

    // Delete from DB
    import("../storage/signRepo").then(({ deleteSign: deleteSignFromDb }) => {
      deleteSignFromDb(id).catch((e) => console.warn("[deleteSign] Failed to delete from DB:", e));
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

      // Persist both sign and inspection to DB
      upsertSign(updatedSign).catch((e) => console.warn("[addInspection] Failed to update sign:", e));
      addInspectionToDb(inspection).catch((e) => console.warn("[addInspection] Failed to persist inspection:", e));

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
