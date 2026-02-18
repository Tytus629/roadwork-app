import React, { useEffect, useState } from "react";
import { View, Text, Pressable, StyleSheet, FlatList, ActivityIndicator, Alert, Button } from "react-native";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFirestore, collection, query, where, onSnapshot, doc, getDoc } from "@react-native-firebase/firestore";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { useOrg } from "../state/OrgContext";

type OrgRow = { orgId: string; name: string; role: string };

export function OrgPickerScreen() {
  const { setOrgId } = useOrg();
  const [orgs, setOrgs] = useState<OrgRow[]>([]);
  const [loading, setLoading] = useState(true);

  const auth = getAuth(getApp());
  const uid = auth.currentUser?.uid ?? null;

  useEffect(() => {
    if (!uid) {
      console.log("[OrgPicker] No user signed in");
      setLoading(false);
      return;
    }

    const db = getFirestore(getApp());
    const orgMembersRef = collection(db, "orgMembers");
    const q = query(orgMembersRef, where("uid", "==", uid));

    const unsubscribe = onSnapshot(
      q,
      async (snapshot) => {
        console.log(`[OrgPicker] Found ${snapshot.docs.length} org memberships`);

        const orgList: OrgRow[] = [];

        for (const memberDoc of snapshot.docs) {
          const memberData = memberDoc.data();
          const orgId = String(memberData.orgId);
          const role = String(memberData.role ?? "member");

          try {
            const orgDocRef = doc(db, "orgs", orgId);
            const orgSnap = await getDoc(orgDocRef);

            if (orgSnap.exists()) {
              const orgData = orgSnap.data();
              orgList.push({
                orgId,
                name: String(orgData.name ?? "Unnamed Org"),
                role,
              });
            } else {
              console.warn(`[OrgPicker] Org ${orgId} not found`);
            }
          } catch (e) {
            console.error(`[OrgPicker] Error fetching org ${orgId}:`, e);
          }
        }

        setOrgs(orgList);
        setLoading(false);
      },
      (error) => {
        console.error("[OrgPicker] Error loading orgs:", error);
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [uid]);

  async function onPick(item: OrgRow) {
    await setOrgId(item.orgId);
  }

  async function devBootstrap() {
    try {
      console.log("[OrgPicker] DEV bootstrap starting...");
      const functions = getFunctions(getApp());
      const fn = httpsCallable(functions, "roadwork_devBootstrapOrg");
      const res = await fn({});
      console.log("[OrgPicker] DEV bootstrap OK:", res.data);

      const orgId = (res.data as any)?.orgId;
      Alert.alert(
        "Bootstrap Success ✅",
        `Created org: ${orgId}\n\nThe org list should refresh automatically.`,
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

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" />
        <Text style={styles.loadingText}>Loading organizations...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Choose Organization</Text>

      <View style={{ height: 12 }} />
      <Button title="DEV: Bootstrap Org (emulator)" onPress={devBootstrap} />

      <View style={{ height: 12 }} />

      {orgs.length === 0 ? (
        <Text style={styles.noOrgsText}>
          You're not in any orgs yet. In production you'd "Create org" or "Join org".
          For now, press DEV bootstrap.
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
  );
}

const styles = StyleSheet.create({
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

