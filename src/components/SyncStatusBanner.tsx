// src/components/SyncStatusBanner.tsx
//
// Small overlay banner showing sync state: Pending / Syncing / Error.
// Tap to trigger an immediate manual sync.

import React, { useEffect, useState } from "react";
import { Pressable, Text, View, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getSyncStatus, subscribeSyncStatus } from "../sync/syncStatus";
import { manualSyncNow } from "../sync/syncScheduler";

export function SyncStatusBanner({ topOffset = 4 }: { topOffset?: number }) {
  const [s, setS] = useState(getSyncStatus());
  const insets = useSafeAreaInsets();

  useEffect(() => subscribeSyncStatus(setS), []);

  // Don't show anything when idle (nothing to sync)
  if (s.state === "idle") return null;

  const label =
    s.state === "syncing"
      ? `Syncing\u2026 (${s.pendingCount})`
      : s.state === "pending"
      ? `Pending sync (${s.pendingCount})`
      : `Sync error \u2014 tap to retry (${s.pendingCount})`;

  const bg =
    s.state === "error"
      ? "rgba(220,38,38,0.85)"   // red
      : s.state === "syncing"
      ? "rgba(37,99,235,0.85)"   // blue
      : "rgba(0,0,0,0.75)";     // dark

  return (
    <View style={[styles.wrapper, { top: insets.top + topOffset }]} pointerEvents="box-none">
      <Pressable onPress={() => manualSyncNow()} style={[styles.pill, { backgroundColor: bg }]}>
        <Text style={styles.label}>{label}</Text>

        {!!s.lastSyncedAt && s.state !== "syncing" && (
          <Text style={styles.detail}>
            Last synced: {new Date(s.lastSyncedAt).toLocaleTimeString()}
          </Text>
        )}

        {s.state === "error" && !!s.lastError && (
          <Text style={styles.detail} numberOfLines={2}>
            {s.lastError}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: "absolute",
    left: 8,
    right: 8,
    zIndex: 999,
  },
  pill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  label: {
    color: "white",
    fontWeight: "700",
    fontSize: 13,
  },
  detail: {
    color: "white",
    opacity: 0.8,
    marginTop: 2,
    fontSize: 11,
  },
});
