/**
 * JoinOrgScreen.tsx
 *
 * "Join Org by Code" flow — pre-NavigationContainer, rendered inline from OrgPickerScreen.
 *
 * Flow:
 *   1. User pastes org code → validation → calls roadwork_requestJoinOrg
 *   2. Saves orgId to AsyncStorage via setPendingOrgId
 *   3. Shows "Pending Approval" card with manual "Check Approval" button
 *   4. Auto-polls orgs/{orgId}/members/{uid} every 15 s while pending
 *   5. Membership doc found → calls onApproved(orgId) → enters app
 *
 * Props:
 *   onBack      – user cancels before submitting a request
 *   onApproved  – membership confirmed; caller saves orgId and mounts main app
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { toastSuccess, toastError } from "../ui/toast";
import { SafeAreaView } from "react-native-safe-area-context";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import {
  getMyJoinRequestStatus,
  getMyMembershipRole,
  JoinRequestStatus,
  requestJoinOrg,
} from "../services/orgJoin";
import {
  clearPendingOrgId,
  getPendingOrgId,
  setPendingOrgId,
} from "../state/pendingOrg";

const POLL_INTERVAL_MS = 15_000;

type Props = {
  onBack: () => void;
  onApproved: (orgId: string) => Promise<void>;
};

/**
 * Surfaces the real Firebase callable error — code, message, details — for debugging.
 * @react-native-firebase wraps native Android errors in a Java ExecutionException;
 * the real Firebase error lives in e.userInfo or e.nativeErrorCode / e.nativeErrorMessage.
 */
function formatCallableError(e: any): { code: string; message: string; details: string } {
  // @react-native-firebase puts the real error here on Android
  const nativeCode = e?.userInfo?.code ?? e?.nativeErrorCode ?? "";
  const nativeMsg = e?.userInfo?.message ?? e?.nativeErrorMessage ?? "";

  const code = nativeCode || e?.code || e?.name || "unknown";
  const message = nativeMsg || e?.message || String(e);
  const details =
    typeof e?.details === "string"
      ? e.details
      : e?.details
      ? JSON.stringify(e.details, null, 2)
      : e?.userInfo
      ? JSON.stringify(e.userInfo, null, 2)
      : "";

  // Also dump the whole error so nothing is hidden
  console.log("[JoinOrg] raw error object:", JSON.stringify(e, Object.getOwnPropertyNames(e), 2));

  return { code, message, details };
}

export function JoinOrgScreen({ onBack, onApproved }: Props) {
  const [orgIdInput, setOrgIdInput] = useState(() => (__DEV__ ? "2468" : ""));
  const [requesting, setBusy] = useState(false);
  const [pendingOrgId, setPendingState] = useState<string | null>(null);
  const [joinStatus, setJoinStatus] = useState<JoinRequestStatus>("none");
  const [checking, setChecking] = useState(false);
  const [errorText, setErrorText] = useState<string | null>(null);

  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const uid = getAuth(getApp()).currentUser?.uid ?? null;

  // Restore any pending request from a previous session
  useEffect(() => {
    getPendingOrgId(uid).then((saved) => {
      if (saved) setPendingState(saved);
    });
  }, [uid]);

  // Auto-poll while pending
  useEffect(() => {
    if (!pendingOrgId || !uid) {
      stopPolling();
      return;
    }
    void pollOnce(pendingOrgId, uid);
    startPolling(pendingOrgId, uid);
    return stopPolling;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingOrgId, uid]);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(orgId: string, userId: string) {
    stopPolling();
    pollRef.current = setInterval(() => pollOnce(orgId, userId), POLL_INTERVAL_MS);
  }

  const pollOnce = useCallback(
    async (orgId: string, userId: string) => {
      try {
        const role = await getMyMembershipRole(orgId, userId);
        if (role) {
          stopPolling();
          await clearPendingOrgId(userId);
          setPendingState(null);
          await onApproved(orgId);
          return;
        }
        const status = await getMyJoinRequestStatus(orgId, userId);
        setJoinStatus(status);
      } catch (e) {
        console.warn("[JoinOrg] poll error:", e);
      }
    },
    [onApproved],
  );

  // Validate: allow short codes (e.g. "2468") or full Firestore IDs (20 chars)
  // Minimum 2 chars; letters, numbers, hyphens and underscores only
  const trimmedInput = useMemo(() => orgIdInput.trim().replace(/\s+/g, ""), [orgIdInput]);

  async function handleRequestAccess() {
    if (!uid) {
      Alert.alert("Sign in required", "Please sign in first.");
      return;
    }
    if (!trimmedInput) {
      Alert.alert("Code required", "Enter the org code or ID your admin shared.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{2,40}$/.test(trimmedInput)) {
      Alert.alert(
        "That doesn't look right",
        "Org codes and IDs can only contain letters, numbers, hyphens and underscores.",
      );
      return;
    }

    setErrorText(null);
    setBusy(true);
    try {
      // Server resolves the code → real orgId
      const result = await requestJoinOrg(trimmedInput);
      const orgName = result.orgName ?? "your org";

      // If already a member, skip pending flow and go straight in
      if (result.alreadyMember) {
        toastSuccess("Already a member", `Switched to ${orgName}`);
        console.log("[JoinOrg] alreadyMember=true, selecting org and continuing:", result.orgId);
        await onApproved(result.orgId);
        return;
      }

      // Otherwise, store for polling and show "pending approval" UI
      toastSuccess("Request sent", `Waiting for approval in ${orgName}`);
      await setPendingOrgId(result.orgId, uid);
      setPendingState(result.orgId);
      setOrgIdInput("");
      setJoinStatus("pending");
    } catch (e: any) {
      const f = formatCallableError(e);
      console.log("[JoinOrg] ERROR:", f);
      toastError("Join failed", f.message);
      setErrorText(`${f.code}: ${f.message}${f.details ? `\n${f.details}` : ""}`);
    } finally {
      setBusy(false);
    }
  }

  async function handleCheckApproval() {
    if (!uid || !pendingOrgId) return;
    setChecking(true);
    try {
      const role = await getMyMembershipRole(pendingOrgId, uid);
      if (role) {
        stopPolling();
        await clearPendingOrgId(uid);
        setPendingState(null);
        await onApproved(pendingOrgId);
        return;
      }
      const status = await getMyJoinRequestStatus(pendingOrgId, uid);
      setJoinStatus(status);
      if (status === "rejected") {
        Alert.alert("Request rejected", "Your join request was declined by the admin.");
      } else {
        Alert.alert("Still pending", "Your request hasn't been approved yet. Check back soon.");
      }
    } catch (e: any) {
      Alert.alert("Check failed", e?.message ?? String(e));
    } finally {
      setChecking(false);
    }
  }

  async function handleCancelPending() {
    stopPolling();
    await clearPendingOrgId(uid);
    setPendingState(null);
    setJoinStatus("none");
  }

  const statusColor: Record<JoinRequestStatus, string> = {
    none: "#6b7280",
    pending: "#f59e0b",
    approved: "#22c55e",
    rejected: "#ef4444",
  };

  // ─── Pending state UI ────────────────────────────────────────────────────
  if (pendingOrgId) {
    return (
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <View style={styles.container}>
        <Pressable onPress={handleCancelPending} style={styles.backRow}>
          <Text style={styles.backText}>← Cancel request</Text>
        </Pressable>

        <View style={styles.pendingCard}>
          <Text style={styles.pendingTitle}>Awaiting Approval</Text>
          <Text style={styles.pendingBody}>
            Request sent for org{"\n"}
            <Text style={styles.orgIdLabel}>{pendingOrgId}</Text>
          </Text>

          {joinStatus !== "none" && (
            <View style={[styles.statusBadge, { borderColor: statusColor[joinStatus] }]}>
              <View style={[styles.statusDot, { backgroundColor: statusColor[joinStatus] }]} />
              <Text style={[styles.statusText, { color: statusColor[joinStatus] }]}>
                {joinStatus.charAt(0).toUpperCase() + joinStatus.slice(1)}
              </Text>
            </View>
          )}

          <Pressable
            style={[styles.checkBtn, checking && styles.btnDisabled]}
            onPress={handleCheckApproval}
            disabled={checking}
          >
            {checking ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.btnText}>Check Approval</Text>
            )}
          </Pressable>

          <View style={styles.pollingRow}>
            <ActivityIndicator size="small" color="#9ca3af" />
            <Text style={styles.pollingText}>Auto-checking every 15 s…</Text>
          </View>
        </View>
        </View>
      </SafeAreaView>
    );
  }

  // ─── Request form UI ─────────────────────────────────────────────────────
  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
      <Pressable onPress={onBack} style={styles.backRow}>
        <Text style={styles.backText}>← Back</Text>
      </Pressable>

      <Text style={styles.title}>Join an Org</Text>
      <Text style={styles.subtitle}>
        Enter the org code (e.g. 2468) or full org ID your admin gave you.
      </Text>

      <TextInput
        style={styles.input}
        placeholder="Org ID or Org Code"
        placeholderTextColor="#9ca3af"
        value={orgIdInput}
        onChangeText={setOrgIdInput}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="done"
        onSubmitEditing={handleRequestAccess}
      />

      {errorText ? (
        <Text style={styles.errorText}>{errorText}</Text>
      ) : null}

      <Pressable
        style={[styles.requestBtn, requesting && styles.btnDisabled]}
        onPress={handleRequestAccess}
        disabled={requesting}
      >
        {requesting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.btnText}>Request Access</Text>
        )}
      </Pressable>
    </KeyboardAvoidingView>
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
    padding: 24,
    backgroundColor: "#fff",
  },
  backRow: {
    marginBottom: 24,
  },
  backText: {
    fontSize: 15,
    color: "#2563eb",
    fontWeight: "600",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    color: "#111827",
  },
  subtitle: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 24,
    lineHeight: 20,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    marginBottom: 16,
  },
  requestBtn: {
    backgroundColor: "#111827",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  // Pending card
  pendingCard: {
    backgroundColor: "#f8fafc",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 24,
    alignItems: "center",
    marginTop: 32,
    gap: 14,
  },
  pendingTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#1e293b",
  },
  pendingBody: {
    fontSize: 14,
    color: "#374151",
    textAlign: "center",
    lineHeight: 22,
  },
  orgIdLabel: {
    fontWeight: "700",
    color: "#2563eb",
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 13,
    fontWeight: "700",
  },
  checkBtn: {
    backgroundColor: "#2563eb",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: "center",
    width: "100%",
  },
  pollingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  pollingText: {
    fontSize: 12,
    color: "#9ca3af",
  },
  errorText: {
    fontSize: 14,
    color: "#ef4444",
    marginBottom: 12,
    marginTop: -4,
  },
});
