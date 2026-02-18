/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ROAD WORK TRACKER - ROOT APP COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * DATABASE DIAGNOSTIC BANNER:
 * Shows real-time persistence status at top of app.
 * 
 * WHAT IT SHOWS:
 * - "Persistence: ON (SQLite)" - Database initialized successfully
 * - "Persistence: OFF (In-memory)" - Running without DB (rare failure case)
 * - Error message - Shows why DB failed to initialize
 * 
 * HOW IT WORKS:
 * - Polls isDbReady() every 1 second
 * - Displays getDbInitError() if initialization failed
 * - Blue banner with minimal height (~30px)
 * 
 * WHY IT EXISTS:
 * Created to debug "Work Orders disappear after restart" issue.
 * Gives immediate visibility into persistence layer health.
 * 
 * STYLING:
 * - Light blue background (#f0f9ff)
 * - Bold title, small error text
 * - Truncates long errors to 2 lines
 */
import "react-native-gesture-handler";
import React, { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { NavigationContainer } from "@react-navigation/native";
import { View, Text, StyleSheet } from "react-native";
import { FirebaseAuthTypes } from "@react-native-firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getAuth, onAuthStateChanged } from "@react-native-firebase/auth";

import { store } from "./src/store";
import RootNavigator from "./src/navigation/RootNavigator";
import { initDb, isDbReady, getDbInitError } from "./src/storage/db";
import { SignsProvider } from "./src/state/SignsContext";
import { requestNotificationPermission } from "./src/services/notify";
import { runMigrations } from "./src/db/migrations";
import { dbPing } from "./src/db/db";
import { FilterProvider } from "./src/state/FilterContext";
import { connectToEmulatorsIfDev } from "./src/firebase/emulators";
import { AuthScreen } from "./src/screens/AuthScreen";
import { OrgPickerScreen } from "./src/screens/OrgPickerScreen";
import { setOrgId as setServiceOrgId } from "./src/services/orgSettings";
import { initializeApp, getApps, getApp } from "@react-native-firebase/app";
import { OrgProvider, useOrg } from "./src/state/OrgContext";

// Initialize Firebase if not already initialized
// This code handles hot reloads gracefully
try {
  if (getApps().length === 0) {
    // Firebase config - UPDATE WITH REAL VALUES FROM FIREBASE CONSOLE
    // Project: skyhours-781d1
    const firebaseConfig = {
      apiKey: "AIzaSyDummyKeyForEmulatorDev123456789", // TODO: Replace with real API key from Firebase Console
      authDomain: "skyhours-781d1.firebaseapp.com",
      databaseURL: "https://skyhours-781d1.firebaseio.com",
      projectId: "skyhours-781d1",
      storageBucket: "skyhours-781d1.appspot.com",
      messagingSenderId: "1234567890", // TODO: Replace with real value from Firebase Console
      appId: "1:1234567890:android:dummyappidforemulator", // TODO: Replace with real value from Firebase Console
    };
    
    // DEBUG: Verify API key is set correctly
    console.log("[FirebaseConfig] apiKey:", firebaseConfig.apiKey);
    console.log("[FirebaseConfig] projectId:", firebaseConfig.projectId);
    
    initializeApp(firebaseConfig);
    console.log("[Firebase] Initialized with config for project:", firebaseConfig.projectId);
  } else {
    console.log("[Firebase] Already initialized (hot reload)");
  }
  
  // Connect to emulators AFTER initialization (safe to call multiple times)
  connectToEmulatorsIfDev();
} catch (e: any) {
  // Ignore "already exists" errors from hot reload
  if (e?.message?.includes("already exists")) {
    console.log("[Firebase] App already exists (hot reload), continuing...");
    connectToEmulatorsIfDev();
  } else {
    console.warn("[Firebase] Init failed:", e);
  }
}

/**
 * DbBanner component: Shows persistence status
 * Polls DB state every 1s for real-time updates
 */
function DbBanner() {
  const [ready, setReady] = useState(isDbReady());
  const [error, setError] = useState(getDbInitError());

  useEffect(() => {
    const interval = setInterval(() => {
      setReady(isDbReady());
      setError(getDbInitError());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  return (
    <View style={styles.banner}>
      <Text style={styles.bannerTitle}>
        Persistence: {ready ? "ON (SQLite)" : "OFF (In-memory)"}
      </Text>
      {!ready && error && (
        <Text style={styles.bannerError} numberOfLines={2}>
          {String(error?.message ?? error ?? "DB not initialized")}
        </Text>
      )}
    </View>
  );
}

/**
 * RootGate: Determines which screen to show based on auth + org state
 */
function RootGate() {
  const { orgId, ready: orgReady, setOrgId } = useOrg();
  const [authReady, setAuthReady] = useState(false);
  const [user, setUser] = useState<FirebaseAuthTypes.User | null>(null);

  // Auth state listener
  useEffect(() => {
    // Check if Firebase is initialized before accessing auth
    if (getApps().length === 0) {
      console.warn("[App] Firebase not initialized, skipping auth setup");
      setAuthReady(true);
      return;
    }

    try {
      const auth = getAuth(getApp());
      const unsubscribe = onAuthStateChanged(auth, (user) => {
        setUser(user);
        setAuthReady(true);
      });
      return unsubscribe;
    } catch (e) {
      console.warn("[App] Failed to setup auth listener:", e);
      setAuthReady(true);
    }
  }, []);

  // Sync orgId to service settings whenever it changes
  useEffect(() => {
    if (orgId) {
      setServiceOrgId(orgId);
    }
  }, [orgId]);

  // Show loading while checking auth and org state
  if (!authReady || !orgReady) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text>Loading...</Text>
      </View>
    );
  }

  // Show auth screen if not signed in
  if (!user) {
    return (
      <AuthScreen
        onDone={async (bootstrappedOrgId) => {
          // If bootstrap returned an orgId, save it
          if (bootstrappedOrgId) {
            await setOrgId(bootstrappedOrgId);
          }
        }}
      />
    );
  }

  // Show org picker if signed in but no org selected
  if (!orgId) {
    return <OrgPickerScreen />;
  }

  // Main app - user is authenticated and org is selected
  return (
    <Provider store={store}>
      <FilterProvider>
        <SignsProvider>
          <View style={{ flex: 1 }}>
            <DbBanner />
            <NavigationContainer>
              <RootNavigator />
            </NavigationContainer>
          </View>
        </SignsProvider>
      </FilterProvider>
    </Provider>
  );
}

export default function App() {
  useEffect(() => {
    // Initialize new SQLite database (op-sqlite)
    try {
      runMigrations();
      console.log("[DB] New SQLite initialized, ping:", dbPing());
    } catch (e) {
      console.warn("[DB] New SQLite init failed:", e);
    }

    // Initialize legacy database (react-native-sqlite-storage)
    initDb().catch((e) => {
      // Gracefully handle DB init failure - app will run without persistence
      console.warn("[App] Database init failed, continuing without persistence:", e);
    });

    // Request notification permissions (Android 13+ requires this)
    requestNotificationPermission()
      .then((granted) => {
        console.log("[App] Notification permission:", granted ? "GRANTED" : "DENIED");
      })
      .catch((e) => {
        console.warn("[App] Failed to request notification permission:", e);
      });
  }, []);

  return (
    <OrgProvider>
      <RootGate />
    </OrgProvider>
  );
}

const styles = StyleSheet.create({
  banner: {
    padding: 8,
    backgroundColor: "#f0f9ff",
    borderBottomWidth: 1,
    borderBottomColor: "#bae6fd",
  },
  bannerTitle: {
    fontWeight: "800",
    fontSize: 12,
    color: "#0c4a6e",
  },
  bannerError: {
    fontSize: 10,
    color: "#dc2626",
    marginTop: 2,
  },
});
