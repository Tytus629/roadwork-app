import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert, Button } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFirestore, collectionGroup, query, where, onSnapshot } from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { useOrg } from "../state/OrgContext";
import { JoinOrgScreen } from "./JoinOrgScreen";
import { clearPendingOrgId, getPendingOrgId } from "../state/pendingOrg";
import {
  getMyJoinRequestStatus,
  getMyMembershipRole,
  JoinRequestStatus,
  validateMembershipRecord,
} from "../services/orgJoin";

type OrgRow = { orgId: string; name: string; role: string };

export function OrgPickerScreen() {
  const { setOrgId } = useOrg();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showJoin, setShowJoin] = useState(false);
  const [pendingOrgId, setPendingOrgIdState] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<JoinRequestStatus>("none");
  const [checking, setChecking] = useState(false);
  const [autoOpenedJoin, setAutoOpenedJoin] = useState(false);

  const uid = getAuth(getApp()).currentUser?.uid ?? null;
  const joinButtonLabel = orgs.length > 0 ? "Join New Organization" : "Join an Organization";

  // Restore pending org on mount; jump straight to JoinOrgScreen if one is found
  useEffect(() => {
    getPendingOrgId(uid).then((pendingId) => {
      if (pendingId) {
        setPendingOrgIdState(pendingId);
        setShowJoin(true);
      }
    });
  }, [uid]);

  async function checkPendingApproval() {
    if (!uid || !pendingOrgId) return;
    setChecking(true);
    try {
      const role = await getMyMembershipRole(pendingOrgId, uid);
      if (role) {
        await clearPendingOrgId(uid);
        setPendingOrgIdState(null);
        setPendingStatus("approved");
        await setOrgId(pendingOrgId);
        return;
      }
      const s = await getMyJoinRequestStatus(pendingOrgId, uid);
      setPendingStatus(s);
      if (s === "rejected") {
        Alert.alert("Request rejected", "Your join request was declined by the admin.");
      } else {
        Alert.alert("Still pending", "Not approved yet. Check back soon.");
      }
    } catch (e: any) {
      Alert.alert("Check failed", e?.message ?? String(e));
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => {
    if (!uid) {
      console.log("[OrgPicker] No user signed in");
      setLoading(false);
      return;
    }

    const db = getFirestore(getApp());
    const q = query(collectionGroup(db, "members"), where("uid", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d: { data: () => Record<string, unknown> }) => d.data());
        const checkedRows: Array<{ m: Record<string, unknown>; isActive: boolean }> = rows.map(
          (m: Record<string, unknown>) => ({
            m,
            isActive: validateMembershipRecord(m as Record<string, any>).isActive,
          })
        );
        const activeRows = checkedRows
          .filter((row) => row.isActive)
          .map((row) => row.m);

        if (__DEV__) {
          console.log(`[OrgPicker] memberships active=${activeRows.length} total=${rows.length}`);
        }

        const orgList: OrgRow[] = activeRows.map((m: Record<string, unknown>) => ({
          orgId: String(m.orgId ?? ""),
          role: String(m.role ?? "viewer"),
          name: String(m.orgNameSnapshot ?? m.orgId ?? "Unnamed Org"),
        }));

        setOrgs(orgList);
        setLoading(false);
      },
      (err) => {
        console.log("[OrgPicker] memberships error:", err?.message ?? String(err));
        setOrgs([]);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  // New users with zero memberships should land directly in Join Org by Code.
  useEffect(() => {
    if (loading) return;
    if (pendingOrgId) return;
    if (showJoin) return;
    if (autoOpenedJoin) return;
    if (orgs.length > 0) return;

    setAutoOpenedJoin(true);
    setShowJoin(true);
  }, [loading, pendingOrgId, showJoin, autoOpenedJoin, orgs.length]);

  async function onPick(item: OrgRow) {
    if (__DEV__) {
      console.log(`[OrgPicker] explicit org select target=${item.orgId} role=${item.role}`);
    }
    await setOrgId(item.orgId);
  }

  async function devBootstrap() {
    if (!__DEV__) return;
    try {
      console.log("[OrgPicker] DEV bootstrap starting...");
      const functions = getFunctions(getApp());
      const fn = httpsCallable(functions, "roadwork_devBootstrapOrg");
      const res = await fn({});
      console.log("[OrgPicker] DEV bootstrap OK:", res.data);

      const orgId = (res.data as any)?.orgId;

      Alert.alert(
        "Bootstrap Success ✅",
        `Created org: ${orgId}\n\nOrg was not auto-selected. Tap an org card to select explicitly.`,
        [{ text: "OK" }]
      );
    } catch (e: any) {
      console.error("[OrgPicker] DEV bootstrap ERROR:", e?.message ?? e);
      Alert.alert(
        "Bootstrap Failed ❌",
        `Error: ${e?.message || e}\n\nCheck console for details.`,
        [{ text: "OK" }]
      );
    }
  }

  // Show join-org screen (request form or pending-approval state)
  if (showJoin) {
    return (
      <JoinOrgScreen
        onBack={() => setShowJoin(false)}
        onApproved={async (orgId) => {
          setPendingOrgIdState(null);
          setPendingStatus("none");
          await setOrgId(orgId);
        }}
      />
    );
  }

  if (loading) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.container}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Loading organizations...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <View style={styles.container}>
      <Text style={styles.title}>Choose Organization</Text>

      <View style={{ height: 12 }} />

      {/* Pending approval card */}
      {!!pendingOrgId && (
        <View style={styles.pendingCard}>
          <Text style={styles.pendingLabel}>Pending Request</Text>
          <Text style={styles.pendingOrg} numberOfLines={1}>{pendingOrgId}</Text>
          {pendingStatus !== "none" && (
            <Text style={[
              styles.pendingStatus,
              pendingStatus === "rejected" && { color: "#ef4444" },
              pendingStatus === "pending" && { color: "#f59e0b" },
            ]}>
              Status: {pendingStatus}
            </Text>
          )}
          <View style={styles.pendingActions}>
            <Pressable
              style={[styles.checkBtn, checking && styles.checkBtnDisabled]}
              onPress={checkPendingApproval}
              disabled={checking}
            >
              {checking
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.checkBtnText}>Check Approval</Text>}
            </Pressable>
            <Pressable
              style={styles.viewPendingBtn}
              onPress={() => setShowJoin(true)}
            >
              <Text style={styles.viewPendingBtnText}>View</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Join by org ID */}
      <Pressable style={styles.joinButton} onPress={() => setShowJoin(true)}>
        <Text style={styles.joinButtonText}>{joinButtonLabel}</Text>
      </Pressable>

      <View style={{ height: 8 }} />

      {__DEV__ && (
        <Button title="DEV: Bootstrap Org (emulator)" onPress={devBootstrap} />
      )}

      <View style={{ height: 12 }} />

      {orgs.length === 0 ? (
        <Text style={styles.noOrgsText}>
          Not in any orgs yet. Tap "Join an Organization" and enter the org code
          (e.g. 2468) or org ID your admin shared with you.
        </Text>
      ) : (
        <FlatList
          data={orgs}
          keyExtractor={(item) => item.orgId}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onPick(item)}
              style={styles.orgCard}
            >
              <Text style={styles.orgName}>{item.name}</Text>
              <Text style={styles.orgRole}>Role: {item.role}</Text>
              <Text style={styles.orgId}>OrgId: {item.orgId}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
    padding: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: "#667085",
    textAlign: "center",
  },
  noOrgsText: {
    fontSize: 14,
    color: "#667085",
    marginBottom: 16,
    lineHeight: 20,
  },
  pendingCard: {
    borderWidth: 1,
    borderColor: "#f59e0b",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
    backgroundColor: "#fffbeb",
    gap: 4,
  },
  pendingLabel: {
    fontWeight: "700",
    fontSize: 14,
    color: "#92400e",
  },
  pendingOrg: {
    fontSize: 12,
    color: "#78350f",
    opacity: 0.8,
  },
  pendingStatus: {
    fontSize: 12,
    fontWeight: "600",
    color: "#6b7280",
  },
  pendingActions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
  checkBtn: {
    flex: 1,
    backgroundColor: "#2563eb",
    borderRadius: 8,
    paddingVertical: 9,
    alignItems: "center",
  },
  checkBtnDisabled: { opacity: 0.5 },
  checkBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  viewPendingBtn: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
  },
  viewPendingBtnText: { fontWeight: "600", fontSize: 13, color: "#374151" },
  joinButton: {
    borderWidth: 1,
    borderColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginBottom: 4,
  },
  joinButtonText: {
    color: "#2563eb",
    fontSize: 15,
    fontWeight: "600",
  },
  orgCard: {
    padding: 14,
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 10,
  },
  orgName: {
    fontSize: 16,
    fontWeight: "700",
  },
  orgRole: {
    opacity: 0.7,
    fontSize: 14,
    marginTop: 4,
  },
  orgId: {
    opacity: 0.5,
    fontSize: 12,
    marginTop: 2,
  },
});

