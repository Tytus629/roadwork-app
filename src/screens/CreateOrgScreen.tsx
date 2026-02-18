import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, Alert, ActivityIndicator } from "react-native";
import { getApp } from "@react-native-firebase/app";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
import { useOrg } from "../state/OrgContext";

export function CreateOrgScreen() {
  const { setOrgId } = useOrg();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);

  async function onCreate() {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
      Alert.alert("Invalid Name", "Organization name must be at least 2 characters");
      return;
    }

    setLoading(true);
    try {
      const functions = getFunctions(getApp());
      const fn = httpsCallable(functions, "roadwork_createOrg");
      const res = await fn({ name: trimmed });
      const orgId = String((res.data as any).orgId);

      console.log("[CreateOrg] Created org:", orgId);
      await setOrgId(orgId);
    } catch (e: any) {
      console.error("[CreateOrg] Error:", e);
      Alert.alert("Error", e?.message || "Failed to create organization");
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Create Organization</Text>

      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Org name (e.g., Kittitas County Road Dept)"
        style={styles.input}
        editable={!loading}
        autoCapitalize="words"
      />

      <Pressable
        onPress={onCreate}
        disabled={loading || name.trim().length < 2}
        style={[styles.button, (loading || name.trim().length < 2) && styles.buttonDisabled]}
      >
        {loading ? (
          <ActivityIndicator color="white" />
        ) : (
          <Text style={styles.buttonText}>Create Organization</Text>
        )}
      </Pressable>
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
    marginBottom: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    borderRadius: 10,
    fontSize: 16,
    marginBottom: 16,
  },
  button: {
    backgroundColor: "#3b82f6",
    padding: 14,
    borderRadius: 10,
    alignItems: "center",
  },
  buttonDisabled: {
    opacity: 0.4,
  },
  buttonText: {
    color: "white",
    fontWeight: "700",
    fontSize: 16,
  },
});
