/** Export for GIS-Mo / VUEWorks / Esri: CSV or GeoJSON (EPSG:4326) via the OS share sheet. */
import React, { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useOrg } from "../state/OrgContext";
import { shareExport, type ExportDataset, type ExportFormat } from "../integration/exportService";

const DATASETS: Array<{ key: ExportDataset; label: string; desc: string }> = [
  { key: "work_orders", label: "Work orders", desc: "Activity, status, dates, route/milepost, location" },
  { key: "drive_segments", label: "Drive Mode road segments", desc: "~100 m roughness lines (uncalibrated screening)" },
  { key: "bump_events", label: "Bump / pothole events", desc: "Points flagged by Drive Mode (uncalibrated)" },
  { key: "damage_detections", label: "Photo damage detections", desc: "Photo-AI cracks/potholes (RDD2022 classes), screening only" },
];
const RANGES = [
  { label: "30 days", days: 30 },
  { label: "1 year", days: 365 },
  { label: "All", days: null },
] as const;

export default function ExportScreen() {
  const { orgId } = useOrg();
  const [days, setDays] = useState<number | null>(30);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (dataset: ExportDataset, format: ExportFormat) => {
    setBusy(`${dataset}.${format}`);
    try {
      const n = await shareExport(dataset, format, { orgId: orgId ?? null, fromMs: days ? Date.now() - days * 86400000 : null });
      if (n === 0) Alert.alert("Nothing to export", "No records match this range.");
    } catch (e: any) {
      Alert.alert("Export failed", String(e?.message ?? e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Export to GIS</Text>
      <Text style={styles.subtitle}>
        CSV or GeoJSON (WGS84 / EPSG:4326) for import into GIS-Mo, VUEWorks or Esri ArcGIS. WayCrew feeds these systems; it does not replace them.
      </Text>
      <View style={styles.row}>
        {RANGES.map((r) => (
          <Pressable key={r.label} onPress={() => setDays(r.days)} style={[styles.chip, days === r.days && styles.chipOn]}>
            <Text style={[styles.chipText, days === r.days && styles.chipTextOn]}>{r.label}</Text>
          </Pressable>
        ))}
      </View>
      {DATASETS.map((d) => (
        <View key={d.key} style={styles.card}>
          <Text style={styles.cardTitle}>{d.label}</Text>
          <Text style={styles.cardDesc}>{d.desc}</Text>
          <View style={styles.row}>
            {(["csv", "geojson"] as ExportFormat[]).map((f) => (
              <Pressable key={f} disabled={!!busy} onPress={() => run(d.key, f)} style={[styles.btn, busy && styles.btnBusy]}>
                <Text style={styles.btnText}>{busy === `${d.key}.${f}` ? "…" : f === "csv" ? "CSV" : "GeoJSON"}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}
      <Text style={styles.note}>
        Field names follow common GIS-Mo / VUEWorks concepts; some mappings are assumptions until confirmed with CRAB and your county. Drive Mode values are uncalibrated (not IRI/PCI).
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, gap: 12 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, opacity: 0.75 },
  row: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" },
  chipOn: { backgroundColor: "#1e293b", borderColor: "#1e293b" },
  chipText: { fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: "white" },
  card: { padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", gap: 6 },
  cardTitle: { fontWeight: "800", fontSize: 16 },
  cardDesc: { fontSize: 12, opacity: 0.7 },
  btn: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, backgroundColor: "#1d4ed8" },
  btnBusy: { opacity: 0.5 },
  btnText: { color: "white", fontWeight: "800" },
  note: { fontSize: 11, opacity: 0.7 },
});
