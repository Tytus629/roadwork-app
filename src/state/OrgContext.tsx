import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  clearSelectedOrgId,
  clearLegacySelectedOrgId,
  getLastAuthUid,
  getLegacySelectedOrgId,
  getSelectedOrgId,
  setLastAuthUid,
  setSelectedOrgId,
} from "./selectedOrg";
import { startSyncScheduler } from "../sync/syncScheduler";
import { backfillWorkOrdersOrgId } from "../db/workOrdersRepo";
import { initCrashlytics } from "../telemetry/crashlytics";
import { setCustomKeySafe } from "../telemetry/crashlytics";
import { getApp } from "@react-native-firebase/app";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";
import { clearLegacyPendingOrgId, clearPendingOrgId } from "./pendingOrg";
import { clearOrgSettings } from "../services/orgSettings";
import { validateMyMembership } from "../services/orgJoin";
import {
  type CanonicalRole,
  normalizeRole,
  setActiveRoleForGuards,
} from "../permissions/rolePermissions";
import { startRemoteSyncForOrg } from "../sync/remoteSync";
import { registerNotificationDeviceDiagnostics } from "../services/notify";

type OrgState = {
  orgId: string | null;
  role: CanonicalRole;
  setOrgId: (orgId: string) => Promise<void>;
  clearOrgId: () => Promise<void>;
  ready: boolean;
};

const Ctx = createContext<OrgState | null>(null);

export function OrgProvider({ children }: { children: React.ReactNode }) {
  const [orgId, setOrgIdState] = useState<string | null>(null);
  const [role, setRole] = useState<CanonicalRole>("viewer");
  const [ready, setReady] = useState(false);
  const [activeUid, setActiveUid] = useState<string | null>(null);
  const activeUidRef = useRef<string | null>(null);

  useEffect(() => {
    const auth = getAuth(getApp());

    const unsub = onAuthStateChanged(auth, async (user) => {
      const nextUid = user?.uid ?? null;
      const prevUid = activeUidRef.current;

      // Never keep stale org context in memory across auth transitions.
      if (prevUid !== nextUid) {
        setOrgIdState(null);
        setRole("viewer");
        setActiveRoleForGuards("viewer");
      }
      setReady(false);

      try {
        const lastUid = await getLastAuthUid();
        const legacySelectedOrg = await getLegacySelectedOrgId();

        if (__DEV__) {
          console.log(
            `[OrgSession] auth uid=${nextUid ?? "none"} lastSignedInUid=${lastUid ?? "none"}`
          );
        }

        // Always remove legacy global keys to avoid cross-user bleed-through.
        await clearLegacySelectedOrgId();
        await clearLegacyPendingOrgId();

        const switchedUsers = !!lastUid && !!nextUid && lastUid !== nextUid;
        if (switchedUsers) {
          if (__DEV__) {
            console.log(`[OrgSession] user switch detected ${lastUid} -> ${nextUid}`);
          }
          // Clear previous user's org-scoped persisted/session state.
          await Promise.all([
            clearSelectedOrgId(lastUid),
            clearPendingOrgId(lastUid),
            clearOrgSettings(lastUid),
          ]);
        }

        if (!nextUid) {
          // Defensive clear when auth transitions to signed-out.
          if (prevUid) {
            await Promise.all([
              clearSelectedOrgId(prevUid),
              clearPendingOrgId(prevUid),
              clearOrgSettings(prevUid),
            ]);
          }

          activeUidRef.current = null;
          setActiveUid(null);
          setOrgIdState(null);
          setRole("viewer");
          setActiveRoleForGuards("viewer");

          // Keep last signed-in uid so next sign-in can detect user switches.
          await setLastAuthUid(lastUid ?? prevUid ?? null);

          if (__DEV__) {
            console.log("[OrgSession] signed out; cleared org session state");
          }
          setReady(true);
          return;
        }

        // On first user-scoped run, migrate legacy org key for this same uid only.
        let saved = await getSelectedOrgId(nextUid);
        if (!saved) {
          if (legacySelectedOrg && (!lastUid || lastUid === nextUid)) {
            await setSelectedOrgId(legacySelectedOrg, nextUid);
            await clearLegacySelectedOrgId();
            saved = legacySelectedOrg;
          }
        }

        if (__DEV__) {
          console.log(
            `[OrgSession] selectedOrgId before restore=${saved ?? "none"} uid=${nextUid}`
          );
        }

        let validatedOrgId: string | null = saved;
        let validatedRole: CanonicalRole = "viewer";
        if (saved) {
          const membership = await validateMyMembership(saved, nextUid);
          if (!membership.isActive) {
            if (__DEV__) {
              console.log(
                `[OrgSession] cleared selectedOrgId=${saved} (membership ${membership.reason})`
              );
            }
            await clearSelectedOrgId(nextUid);
            await clearOrgSettings(nextUid);
            validatedOrgId = null;
            validatedRole = "viewer";
          } else if (__DEV__) {
            console.log(`[OrgSession] restored selectedOrgId=${saved} role=${membership.role ?? "viewer"}`);
            validatedRole = normalizeRole(membership.role);
          } else {
            validatedRole = normalizeRole(membership.role);
          }
        } else if (__DEV__) {
          console.log("[OrgSession] no selectedOrgId to restore");
        }

        await setLastAuthUid(nextUid);
        activeUidRef.current = nextUid;
        setActiveUid(nextUid);
        setCustomKeySafe("uid", nextUid ?? "");
        setCustomKeySafe("selectedOrgId", validatedOrgId ?? "");
        setOrgIdState(validatedOrgId);
        setRole(validatedRole);
        setActiveRoleForGuards(validatedRole);
        if (__DEV__) {
          console.log(
            `[OrgSession] startup settled uid=${nextUid} activeOrgId=${validatedOrgId ?? "none"} role=${validatedRole}`
          );
        }
      } catch (e) {
        console.warn("[OrgContext] Failed to resolve org state after auth change", e);
        activeUidRef.current = nextUid;
        setActiveUid(nextUid);
        setOrgIdState(null);
        setRole("viewer");
        setActiveRoleForGuards("viewer");
      } finally {
        setReady(true);
      }
    });

    return unsub;
  }, []);

  // Start/stop sync engines whenever orgId changes
  useEffect(() => {
    if (!orgId) return;
    // Backfill orgId for any work_orders rows that don't have one yet
    backfillWorkOrdersOrgId(orgId);

    if (__DEV__) {
      console.log("[Sync] startSyncScheduler for org", orgId);
    }

    const uidForDiagnostics = activeUidRef.current;
    if (uidForDiagnostics) {
      void registerNotificationDeviceDiagnostics({
        orgId,
        uid: uidForDiagnostics,
      });
    }

    setCustomKeySafe("orgId", orgId);
    setCustomKeySafe("selectedOrgId", orgId);
    const stop = startSyncScheduler(orgId);

    let remoteStopped = false;
    let stopRemoteSync: (() => void) | null = null;
    void startRemoteSyncForOrg(orgId)
      .then((handle) => {
        if (remoteStopped) {
          handle.stop();
          return;
        }
        stopRemoteSync = handle.stop;
      })
      .catch((e) => {
        console.warn("[Sync] failed to start remote sync", e);
      });

    return () => {
      remoteStopped = true;
      stopRemoteSync?.();

      if (__DEV__) {
        console.log("[Sync] stopSyncScheduler");
      }
      stop();
    };
  }, [orgId]);

  useEffect(() => {
    if (!orgId || !activeUid) return;

    let cancelled = false;
    (async () => {
      try {
        const membership = await validateMyMembership(orgId, activeUid);
        if (cancelled) return;

        const canonicalRole = membership.isActive
          ? normalizeRole(membership.role)
          : "viewer";

        setRole((prev) => (prev === canonicalRole ? prev : canonicalRole));
        setActiveRoleForGuards(canonicalRole);
      } catch (e) {
        if (__DEV__) {
          console.warn("[OrgContext] Failed to refresh role from membership", e);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [orgId, activeUid]);

  async function setOrgId(next: string) {
    const uid = activeUid ?? getAuth(getApp()).currentUser?.uid ?? null;
    if (!uid) {
      throw new Error("Cannot set org without an authenticated user.");
    }

    const membership = await validateMyMembership(next, uid);
    if (!membership.isActive) {
      throw new Error("Cannot set organization because your membership is not active.");
    }

    const canonicalRole = normalizeRole(membership.role);

    await setSelectedOrgId(next, uid);
    if (__DEV__) {
      console.log(`[OrgSession] explicit org switch target=${next} uid=${uid}`);
    }
    setOrgIdState(next);
    setRole(canonicalRole);
    setActiveRoleForGuards(canonicalRole);
    initCrashlytics({ uid, orgId: next });
  }

  async function clearOrg() {
    const uid = activeUid ?? getAuth(getApp()).currentUser?.uid ?? null;
    if (__DEV__) {
      console.log(`[OrgSession] clear active org uid=${uid ?? "none"} currentOrg=${orgId ?? "none"}`);
    }
    if (uid) {
      await Promise.all([
        clearSelectedOrgId(uid),
        clearPendingOrgId(uid),
        clearOrgSettings(uid),
      ]);
    }
    setOrgIdState(null);
    setRole("viewer");
    setActiveRoleForGuards("viewer");
  }

  const value = useMemo<OrgState>(
    () => ({ orgId, role, setOrgId, clearOrgId: clearOrg, ready }),
    [orgId, role, ready]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useOrg() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrg must be used within OrgProvider");
  return v;
}
