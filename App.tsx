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

import { store } from "./src/store";
import RootNavigator from "./src/navigation/RootNavigator";
import { initDb, isDbReady, getDbInitError } from "./src/storage/db";
import { SignsProvider } from "./src/state/SignsContext";
import { requestNotificationPermission } from "./src/services/notify";
import { runMigrations } from "./src/db/migrations";
import { dbPing } from "./src/db/db";
import { FilterProvider } from "./src/state/FilterContext";

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
    requestNotificationPermission().then((granted) => {
      console.log("[App] Notification permission:", granted ? "GRANTED" : "DENIED");
    }).catch((e) => {
      console.warn("[App] Failed to request notification permission:", e);
    });
  }, []);

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
