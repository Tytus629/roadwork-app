import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getSelectedOrgId, setSelectedOrgId, clearSelectedOrgId } from "./selectedOrg";

type OrgState = {
  orgId: string | null;
  setOrgId: (orgId: string) => Promise<void>;
  clearOrgId: () => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      const saved = await getSelectedOrgId();
      setOrgIdState(saved);
      setReady(true);
    })();
  }, []);

  async function setOrgId(next: string) {
    await setSelectedOrgId(next);
    setOrgIdState(next);
  }

  async function clearOrg() {
    await clearSelectedOrgId();
    setOrgIdState(null);
  }

  const value = useMemo<OrgState>(
    () => ({ orgId, setOrgId, clearOrgId: clearOrg, ready }),
    [orgId, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrg must be used within OrgProvider");
  return v;
}
