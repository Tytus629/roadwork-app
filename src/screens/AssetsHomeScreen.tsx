import React, { useMemo, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import AssetsNearScreen from "./AssetsNearScreen";
import AssetsDueScreen from "./AssetsDueScreen";
import { ASSET_TYPE_FILTER_OPTIONS, ASSET_TYPE_KEYS, getAssetTypeLabel, type AssetTypeKey } from "../utils/assetTypes";

type Mode = "near" | "due";

function SegButton({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.segButton, active && styles.segButtonActive]}>
      <Text style={[styles.segButtonText, active && styles.segButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function AssetsHomeScreen() {
  const [mode, setMode] = useState<Mode>("near");
  const [selectedTypes, setSelectedTypes] = useState<AssetTypeKey[]>([...ASSET_TYPE_KEYS]);

  function toggleType(type: AssetTypeKey) {
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((value) => value !== type) : [...prev, type],
    );
  }

  const selectedSummary = useMemo(() => {
    if (selectedTypes.length === ASSET_TYPE_KEYS.length) return "All asset types";
    if (selectedTypes.length === 0) return "No asset types selected";
    return selectedTypes.map((type) => getAssetTypeLabel(type, { plural: true })).join(", ");
  }, [selectedTypes]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Assets</Text>
        <Text style={styles.headerSubtitle}>Nearby and inspection views across asset types</Text>

        <View style={styles.segmentedControl}>
          <SegButton label="Near Me" active={mode === "near"} onPress={() => setMode("near")} />
          <SegButton label="Inspection" active={mode === "due"} onPress={() => setMode("due")} />
        </View>

        <Text style={styles.filterTitle}>Asset Types</Text>
        <Text style={styles.filterSubtitle}>{selectedSummary}</Text>
        <View style={styles.chipRow}>
          {ASSET_TYPE_FILTER_OPTIONS.map((option) => {
            const active = selectedTypes.includes(option.value);
            return (
              <TouchableOpacity
                key={option.value}
                onPress={() => toggleType(option.value)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {active ? `OK ${option.label}` : option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedTypes.length !== ASSET_TYPE_KEYS.length ? (
          <TouchableOpacity onPress={() => setSelectedTypes([...ASSET_TYPE_KEYS])} style={styles.resetButton}>
            <Text style={styles.resetButtonText}>Show All Asset Types</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.content}>
        {mode === "near" ? (
          <AssetsNearScreen selectedTypes={selectedTypes} />
        ) : (
          <AssetsDueScreen selectedTypes={selectedTypes} />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    padding: 12,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    gap: 8,
  },
  headerTitle: {
    fontWeight: "800",
    fontSize: 18,
  },
  headerSubtitle: {
    color: "#666",
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  segButton: {
    flex: 1,
    paddingVertical: 10,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  segButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  segButtonText: {
    fontWeight: "700",
    color: "#111827",
  },
  segButtonTextActive: {
    color: "white",
  },
  filterTitle: {
    marginTop: 2,
    fontWeight: "900",
    color: "#111827",
  },
  filterSubtitle: {
    color: "#64748b",
    fontSize: 12,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 2,
  },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: { fontWeight: "800", color: "#111827" },
  chipTextActive: { color: "white" },
  resetButton: {
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  resetButtonText: {
    color: "#111827",
    fontWeight: "800",
  },
  content: {
    flex: 1,
  },
});