import React, { useState } from "react";
import { View, Text, TextInput, Pressable, StyleSheet, TouchableOpacity, Platform, KeyboardAvoidingView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "@react-native-firebase/auth";
import { getApp } from "@react-native-firebase/app";
import { callDevFunctionHttp } from "../firebase/devFunctionsHttp";
import { normalizeEmail, trimToNull } from "../utils/userIdentity";
import { upsertUserProfile } from "../services/userProfileService";


export function AuthScreen({ onDone }: { onDone: (orgId?: string) => void }) {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function validate(): string | null {
    const safeEmail = normalizeEmail(email);

    if (mode === "signup") {
      if (!trimToNull(firstName)) return "First name is required.";
      if (!trimToNull(lastName)) return "Last name is required.";
    }

    if (!safeEmail) return "Email is required.";
    if (!trimToNull(pass)) return "Password is required.";

    if (mode === "signup") {
      if (!trimToNull(confirmPass)) return "Confirm password is required.";
      if (pass !== confirmPass) return "Password and confirm password must match.";
    }

    return null;
  }

  function friendlyAuthMessage(err: any): string {
    const code = String(err?.code ?? "");
    if (code === "auth/invalid-email") return "Please enter a valid email address.";
    if (code === "auth/wrong-password") return "That password is incorrect.";
    if (code === "auth/user-not-found") return "No account found for that email. Use Create Account to sign up.";
    if (code === "auth/email-already-in-use") return "An account with that email already exists. Try signing in instead.";
    if (code === "auth/weak-password") return "Password is too weak. Please use at least 6 characters.";
    return err?.message ?? "Authentication failed. Please try again.";
  }

  async function submitAuth() {
    setMsg(null);
    const error = validate();
    if (error) {
      setMsg(error);
      return;
    }

    const safeEmail = normalizeEmail(email)!;
    const safeFirstName = trimToNull(firstName);
    const safeLastName = trimToNull(lastName);

    setLoading(true);
    const auth = getAuth(getApp());

    try {
      if (mode === "signin") {
        await signInWithEmailAndPassword(auth, safeEmail, pass);
        console.log("[Auth] Signed in");
        onDone();
      } else {
        const cred = await createUserWithEmailAndPassword(auth, safeEmail, pass);
        console.log("[Auth] Created user");

        try {
          await upsertUserProfile({
            uid: cred.user.uid,
            email: safeEmail,
            firstName: safeFirstName,
            lastName: safeLastName,
          });
        } catch (profileErr) {
          // Profile write should not block account creation/login.
          console.warn("[Auth] Failed to save user profile", profileErr);
        }

        await bootstrapDevOrg();
      }
    } catch (e: any) {
      setMsg(friendlyAuthMessage(e));
      console.error("[Auth] Sign-in/up error:", e);
      setLoading(false);
    }
  }

  async function bootstrapDevOrg() {
    try {
      console.log("[Auth] Calling dev bootstrap...");
      let orgId: string;

      if (__DEV__) {
        const result = await callDevFunctionHttp<{ orgId: string }>(
          "roadwork_devBootstrapOrg",
          {},
        );
        orgId = result?.orgId;
      } else {
        // In production, skip dev bootstrap — user picks org via OrgPickerScreen
        onDone();
        return;
      }

      console.log("[Auth] Bootstrap successful, orgId:", orgId);
      onDone(orgId);
    } catch (e: any) {
      console.error("[Auth] Bootstrap failed:", e);
      setMsg(e?.message ?? "Bootstrap failed");
      setLoading(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <Text style={styles.title}>WayCrew</Text>

      <View style={styles.modeRow}>
        <Pressable
          onPress={() => {
            setMode("signin");
            setMsg(null);
          }}
          style={[styles.modeButton, mode === "signin" && styles.modeButtonActive]}
        >
          <Text style={[styles.modeButtonText, mode === "signin" && styles.modeButtonTextActive]}>Sign In</Text>
        </Pressable>
        <Pressable
          onPress={() => {
            setMode("signup");
            setMsg(null);
          }}
          style={[styles.modeButton, mode === "signup" && styles.modeButtonActive]}
        >
          <Text style={[styles.modeButtonText, mode === "signup" && styles.modeButtonTextActive]}>Create Account</Text>
        </Pressable>
      </View>

      {mode === "signup" && (
        <>
          <Text style={styles.fieldLabel}>First Name</Text>
          <TextInput
            placeholder="First Name"
            placeholderTextColor="#6b7280"
            value={firstName}
            onChangeText={setFirstName}
            autoCapitalize="words"
            autoComplete="name-given"
            style={styles.input}
          />
          <Text style={styles.fieldLabel}>Last Name</Text>
          <TextInput
            placeholder="Last Name"
            placeholderTextColor="#6b7280"
            value={lastName}
            onChangeText={setLastName}
            autoCapitalize="words"
            autoComplete="name-family"
            style={styles.input}
          />
        </>
      )}

      <Text style={styles.fieldLabel}>Email</Text>
      <TextInput
        placeholder="Email"
        placeholderTextColor="#6b7280"
        autoCapitalize="none"
        keyboardType="email-address"
        autoCorrect={false}
        autoComplete="email"
        textContentType="emailAddress"
        value={email}
        onChangeText={setEmail}
        style={styles.input}
      />
      
      <Text style={styles.fieldLabel}>Password</Text>
      <View style={styles.passwordContainer}>
        <TextInput
          placeholder="Password"
          placeholderTextColor="#6b7280"
          secureTextEntry={!showPassword}
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete={mode === "signin" ? "password" : "new-password"}
          textContentType={mode === "signin" ? "password" : "newPassword"}
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

      {mode === "signup" && (
        <>
          <Text style={styles.fieldLabel}>Confirm Password</Text>
          <View style={styles.passwordContainer}>
            <TextInput
              placeholder="Confirm Password"
              placeholderTextColor="#6b7280"
              secureTextEntry={!showConfirmPassword}
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirmPass}
              onChangeText={setConfirmPass}
              style={styles.passwordInput}
            />
            <TouchableOpacity
              onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              style={styles.eyeButton}
            >
              <Text style={styles.eyeText}>{showConfirmPassword ? "👁️" : "👁️‍🗨️"}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      <Pressable
        onPress={submitAuth}
        style={styles.button}
        disabled={loading}
      >
        <Text style={styles.buttonText}>
          {loading ? "Loading..." : mode === "signin" ? "Sign In" : "Create Account"}
        </Text>
      </Pressable>

      {msg ? <Text style={styles.errorText}>{msg}</Text> : null}
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
    padding: 16,
    gap: 12,
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "800",
    color: "#111827",
  },
  modeRow: {
    flexDirection: "row",
    gap: 8,
  },
  modeButton: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "white",
  },
  modeButtonActive: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  modeButtonText: {
    fontWeight: "700",
    color: "#374151",
  },
  modeButtonTextActive: {
    color: "white",
  },
  fieldLabel: {
    color: "#111827",
    fontWeight: "700",
    fontSize: 13,
    marginBottom: -4,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    color: "#111827",
    backgroundColor: "#fff",
  },
  passwordContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    paddingRight: 4,
    backgroundColor: "#fff",
  },
  passwordInput: {
    flex: 1,
    padding: 12,
    color: "#111827",
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
    borderColor: "#111827",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  buttonText: {
    fontWeight: "800",
    color: "#fff",
  },
  errorText: {
    color: "#dc2626",
    fontWeight: "600",
  },
});
