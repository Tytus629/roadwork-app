import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
} from "react-native";
import type { SignMaintenance, SignType, SignCondition } from "../types/workItem";

type Props = {
  value?: SignMaintenance | null;
  onChange: (v: Partial<SignMaintenance>) => void;
  onApplyPreset?: (label: string) => void;
};

const SIGN_TYPE_OPTIONS: { label: string; value: SignType }[] = [
  { label: "Stop", value: "stop" },
  { label: "Yield", value: "yield" },
  { label: "Speed Limit", value: "speed_limit" },
  { label: "Warning", value: "warning" },
  { label: "Street Name", value: "street_name" },
  { label: "No Parking", value: "no_parking" },
  { label: "Other", value: "other" },
];

const CONDITION_OPTIONS: { label: string; value: SignCondition }[] = [
  { label: "Good", value: "good" },
  { label: "Faded", value: "faded" },
  { label: "Damaged", value: "damaged" },
  { label: "Missing", value: "missing" },
  { label: "Knocked Down", value: "knocked_down" },
];

export function SignMaintenanceSection({ value, onChange, onApplyPreset }: Props) {
  if (!value) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Sign Details</Text>

      {/* Quick Presets */}
      <SignPresets onApply={onChange} onPresetApply={onApplyPreset} />

      {/* Sign Type Selector */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Sign Type</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.optionRow}
        >
          {SIGN_TYPE_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.optionButton,
                value.signType === opt.value && styles.optionButtonActive,
              ]}
              onPress={() => onChange({ signType: opt.value })}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  value.signType === opt.value && styles.optionButtonTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Condition Selector */}
      <View style={styles.fieldContainer}>
        <Text style={styles.label}>Condition</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.optionRow}
        >
          {CONDITION_OPTIONS.map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[
                styles.optionButton,
                value.condition === opt.value && styles.optionButtonActive,
              ]}
              onPress={() => onChange({ condition: opt.value })}
            >
              <Text
                style={[
                  styles.optionButtonText,
                  value.condition === opt.value && styles.optionButtonTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* Toggles */}
      <View style={styles.toggleContainer}>
        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Reflectivity Issue</Text>
          <Switch
            value={!!value.reflectivityIssue}
            onValueChange={(v) => onChange({ reflectivityIssue: v })}
            trackColor={{ false: "#ccc", true: "#81c784" }}
            thumbColor={value.reflectivityIssue ? "#4caf50" : "#999"}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Obstructed (trees, brush, etc.)</Text>
          <Switch
            value={!!value.obstructed}
            onValueChange={(v) => onChange({ obstructed: v })}
            trackColor={{ false: "#ccc", true: "#81c784" }}
            thumbColor={value.obstructed ? "#4caf50" : "#999"}
          />
        </View>

        <View style={styles.toggleRow}>
          <Text style={styles.toggleLabel}>Replacement Needed</Text>
          <Switch
            value={!!value.replacementNeeded}
            onValueChange={(v) => onChange({ replacementNeeded: v })}
            trackColor={{ false: "#ccc", true: "#ff7043" }}
            thumbColor={value.replacementNeeded ? "#ff5722" : "#999"}
          />
        </View>
      </View>
    </View>
  );
}

interface PresetDef {
  label: string;
  apply: Partial<SignMaintenance>;
}

const PRESETS: PresetDef[] = [
  {
    label: "🔴 Faded Stop",
    apply: {
      signType: "stop",
      condition: "faded",
      reflectivityIssue: true,
      replacementNeeded: true,
    },
  },
  {
    label: "⚠️ Knocked Down",
    apply: {
      condition: "knocked_down",
      replacementNeeded: true,
    },
  },
  {
    label: "🌳 Obstructed",
    apply: {
      obstructed: true,
    },
  },
];

function SignPresets({
  onApply,
  onPresetApply,
}: {
  onApply: (v: Partial<SignMaintenance>) => void;
  onPresetApply?: (label: string) => void;
}) {
  return (
    <View style={styles.presetRow}>
      <Text style={styles.presetTitle}>Quick Presets:</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.presetScroll}
      >
        {PRESETS.map((p) => (
          <TouchableOpacity
            key={p.label}
            style={styles.presetButton}
            onPress={() => {
              onApply(p.apply);
              onPresetApply?.(p.label);
            }}
          >
            <Text style={styles.presetButtonText}>{p.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f9f9f9",
    borderTopWidth: 1,
    borderTopColor: "#e0e0e0",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#333",
    marginBottom: 12,
  },
  fieldContainer: {
    marginBottom: 12,
  },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
    marginBottom: 8,
  },
  optionRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  optionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#e8e8e8",
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#bbb",
  },
  optionButtonActive: {
    backgroundColor: "#4caf50",
    borderColor: "#2e7d32",
  },
  optionButtonText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#333",
  },
  optionButtonTextActive: {
    color: "#fff",
  },
  toggleContainer: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#ddd",
  },
  toggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  toggleLabel: {
    fontSize: 13,
    fontWeight: "500",
    color: "#555",
    flex: 1,
  },
  presetRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#ddd",
  },
  presetTitle: {
    fontSize: 12,
    fontWeight: "600",
    color: "#666",
    marginRight: 8,
  },
  presetScroll: {
    flex: 1,
  },
  presetButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 5,
    backgroundColor: "#ff9800",
    marginRight: 6,
  },
  presetButtonText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
});
