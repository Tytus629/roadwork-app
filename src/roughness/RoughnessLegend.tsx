import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { ROUGHNESS_COLORS, ROUGHNESS_LABELS, type RoughnessClass } from "./signal";

export function RoughnessLegend({ compact }: { compact?: boolean }) {
  const classes = Object.keys(ROUGHNESS_COLORS) as RoughnessClass[];
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Road roughness (uncalibrated)</Text>
      {classes.map((c) => (
        <View key={c} style={styles.row}>
          <View style={[styles.swatch, { backgroundColor: ROUGHNESS_COLORS[c] }]} />
          <Text style={styles.label}>{ROUGHNESS_LABELS[c]}</Text>
        </View>
      ))}
      <Text style={styles.label}>Pins: yellow bump • orange possible pothole • red severe • violet photo-AI damage</Text>
      {!compact && (
        <Text style={styles.note}>
          Screening data from a phone's motion sensors, normalized to ~30 mph. Not IRI, PCI or a CRAB rating;
          values vary by vehicle and mount. Verify in the field before acting.
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 12, padding: 10, gap: 4 },
  title: { fontWeight: "800", fontSize: 13 },
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 22, height: 6, borderRadius: 3 },
  label: { fontSize: 12 },
  note: { fontSize: 11, opacity: 0.75, marginTop: 4 },
});
