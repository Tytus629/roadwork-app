import React, { useMemo, useState } from "react";
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable } from "react-native";
import { ASPHALT_MIXES, AsphaltMixKey } from "./asphaltMixes";
import { calcAsphalt, estimateTruckloads } from "./asphaltCalc";

function parseNum(s: string) {
  const n = Number(String(s).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

export function AsphaltCalculatorScreen() {
  const [lengthFt, setLengthFt] = useState("50");
  const [widthFt, setWidthFt] = useState("10");
  const [depthIn, setDepthIn] = useState("2");
  const [mixKey, setMixKey] = useState<AsphaltMixKey>("generic_hma");
  const [overrideDensity, setOverrideDensity] = useState(""); // optional
  const [truckCap, setTruckCap] = useState("20"); // tons

  const mix = useMemo(() => ASPHALT_MIXES.find(m => m.key === mixKey) ?? ASPHALT_MIXES[0], [mixKey]);

  const density = overrideDensity.trim().length ? parseNum(overrideDensity) : mix.densityLbPerFt3;

  const result = useMemo(() => {
    return calcAsphalt({
      lengthFt: parseNum(lengthFt),
      widthFt: parseNum(widthFt),
      depthIn: parseNum(depthIn),
      densityLbPerFt3: density,
    });
  }, [lengthFt, widthFt, depthIn, density]);

  const truckloads = useMemo(() => {
    return estimateTruckloads(result.weightTons, parseNum(truckCap));
  }, [result.weightTons, truckCap]);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Asphalt Calculator</Text>

      <LabeledInput label="Length (ft)" value={lengthFt} onChangeText={setLengthFt} />
      <LabeledInput label="Width (ft)" value={widthFt} onChangeText={setWidthFt} />
      <LabeledInput label="Depth (in)" value={depthIn} onChangeText={setDepthIn} />

      <Text style={styles.sectionTitle}>Mix Type</Text>
      <View style={styles.mixList}>
        {ASPHALT_MIXES.map(m => (
          <Pressable
            key={m.key}
            onPress={() => setMixKey(m.key)}
            style={[styles.mixItem, m.key === mixKey && styles.mixItemSelected]}
          >
            <Text style={[styles.mixLabel, m.key === mixKey && styles.mixLabelSelected]}>
              {m.label}
            </Text>
            {m.note && <Text style={styles.mixNote}>{m.note}</Text>}
          </Pressable>
        ))}
      </View>

      <LabeledInput
        label={`Density override (lb/ft³) — default ${mix.densityLbPerFt3}`}
        value={overrideDensity}
        onChangeText={setOverrideDensity}
        placeholder="Optional"
      />

      <Text style={styles.resultsTitle}>Results</Text>
      <View style={styles.resultsCard}>
        <ResultRow label="Area" value={`${result.areaFt2} ft²`} />
        <ResultRow label="Volume" value={`${result.volumeFt3} ft³  •  ${result.volumeYd3} yd³`} />
        <ResultRow label="Weight" value={`${result.weightTons} tons  •  ${result.weightLb} lb`} />
      </View>

      <Text style={styles.sectionTitle}>Truckloads (optional)</Text>
      <LabeledInput label="Truck capacity (tons)" value={truckCap} onChangeText={setTruckCap} />
      <View style={styles.resultsCard}>
        <ResultRow label="Estimated loads" value={`${truckloads}`} />
      </View>
    </ScrollView>
  );
}

function LabeledInput(props: { label: string; value: string; onChangeText: (s: string) => void; placeholder?: string }) {
  return (
    <View style={styles.inputGroup}>
      <Text style={styles.inputLabel}>{props.label}</Text>
      <TextInput
        value={props.value}
        onChangeText={props.onChangeText}
        placeholder={props.placeholder}
        keyboardType="numeric"
        style={styles.input}
      />
    </View>
  );
}

function ResultRow(props: { label: string; value: string }) {
  return (
    <View style={styles.resultRow}>
      <Text style={styles.resultLabel}>{props.label}</Text>
      <Text style={styles.resultValue}>{props.value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, gap: 12 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 10 },
  sectionTitle: { fontWeight: "700", marginTop: 12, fontSize: 15 },
  
  inputGroup: { marginTop: 10 },
  inputLabel: { fontWeight: "700", marginBottom: 6 },
  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10 },

  mixList: { marginTop: 8, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, overflow: "hidden" },
  mixItem: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#f1f5f9" },
  mixItemSelected: { backgroundColor: "#111827" },
  mixLabel: { fontWeight: "600", fontSize: 14 },
  mixLabelSelected: { color: "white", fontWeight: "800" },
  mixNote: { fontSize: 12, opacity: 0.7, marginTop: 2 },

  resultsTitle: { fontWeight: "800", marginTop: 14, fontSize: 16 },
  resultsCard: { marginTop: 8, padding: 12, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 12, backgroundColor: "#f8fafc", gap: 8 },
  resultRow: { flexDirection: "row", justifyContent: "space-between" },
  resultLabel: { fontWeight: "600" },
  resultValue: { fontWeight: "800" },
});
