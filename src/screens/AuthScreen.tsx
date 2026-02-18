import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TouchableOpacity } from "react-native";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "@react-native-firebase/auth";
import { getApp } from "@react-native-firebase/app";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
// TODO: Re-enable when google-services.json is added
// import crashlytics from "@react-native-firebase/crashlytics";

export function AuthScreen({ onDone }: { onDone: (orgId?: string) => void }) {
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  async function signIn() {
    setMsg(null);
    setLoading(true);
    const auth = getAuth(getApp());
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
      console.log("[Auth] Signed in");
      
      // Call dev bootstrap to get/create orgId
      await bootstrapDevOrg();
    } catch (e: any) {
      // If user doesn't exist, create it
      if (e?.code === "auth/user-not-found") {
        try {
          await createUserWithEmailAndPassword(auth, email.trim(), pass);
          console.log("[Auth] Created user");
          
          // Call dev bootstrap to get/create orgId
          await bootstrapDevOrg();
          return;
        } catch (e2: any) {
          setMsg(e2?.message ?? "Auth error");
          console.error("[Auth] Error creating user:", e2);
          setLoading(false);
          return;
        }
      }
      setMsg(e?.message ?? "Auth error");
      console.error("[Auth] Sign in error:", e);
      setLoading(false);
    }
  }

  async function bootstrapDevOrg() {
    try {
      const functions = getFunctions(getApp());
      const bootstrap = httpsCallable(functions, "roadwork_devBootstrapOrg");
      console.log("[Auth] Calling dev bootstrap...");
      const res = await bootstrap({});
      const orgId = (res.data as any).orgId as string;
      console.log("[Auth] Bootstrap successful, orgId:", orgId);
      onDone(orgId);
    } catch (e: any) {
      console.error("[Auth] Bootstrap failed:", e);
      setMsg(e?.message ?? "Bootstrap failed");
      setLoading(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Roadwork Tracker</Text>

      <TextInput
        placeholder="Email"
        autoCapitalize="none"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      
      <View style={styles.passwordContainer}>
        <TextInput
          placeholder="Password"
          secureTextEntry={!showPassword}
          value={pass}
          onChangeText={setPass}
          style={styles.passwordInput}
        />
        <TouchableOpacity
          onPress={() => setShowPassword(!showPassword)}
          style={styles.eyeButton}
        >
          <Text style={styles.eyeText}>{showPassword ? "👁️" : "👁️‍🗨️"}</Text>
        </TouchableOpacity>
      </View>

      <Pressable
        onPress={signIn}
        style={styles.button}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Loading..." : "Sign In / Create Account"}
        </Text>
      </Pressable>

      {msg ? <Text style={styles.errorText}>{msg}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    gap: 12,
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
  },
  input: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 12,
    paddingRight: 4,
  },
  passwordInput: {
    flex: 1,
    padding: 12,
  },
  eyeButton: {
    padding: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  eyeText: {
    fontSize: 20,
  },
  button: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
  },
  buttonText: {
    fontWeight: "800",
  },
  errorText: {
    color: "red",
  },
});
