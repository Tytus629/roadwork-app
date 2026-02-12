import React from "react";
import { View, Text, Pressable, TextInput, StyleSheet } from "react-native";
import type { WorkItem, PostMaterial, SignInspectionLite as SignInspectionLiteType } from "../types/workItem";

type Props = {
  item: WorkItem;
  onUpdate: (inspection: SignInspectionLiteType) => void;
};

function clamp1to10(n: number): number {
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
}

function ScoreRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label} (1–10)</Text>
      <View style={styles.scoreControls}>
        <Pressable
          onPress={() => onChange(clamp1to10(value - 1))}
          style={styles.scoreButton}
        >
          <Text style={styles.scoreButtonText}>−</Text>
        </Pressable>
        <View style={styles.scoreValue}>
          <Text style={styles.scoreValueText}>{value}</Text>
        </View>
        <Pressable
          onPress={() => onChange(clamp1to10(value + 1))}
          style={styles.scoreButton}
        >
          <Text style={styles.scoreButtonText}>+</Text>
        </Pressable>
      </View>
    </View>
  );
}

export function SignInspectionLite({ item, onUpdate }: Props) {
  const inspection = item.signInspectionLite ?? {
    reflectivity: 5,
    delamination: 5,
    appearance: 5,
    postCondition: 5,
    postMaterial: "metal" as PostMaterial,
    notes: null,
  };

  const updateField = (patch: Partial<SignInspectionLiteType>) => {
    onUpdate({ ...inspection, ...patch });
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Sign Inspection (1–10 Scales)</Text>

      <ScoreRow
        label="Reflectivity"
        value={inspection.reflectivity}
        onChange={(v) => updateField({ reflectivity: v })}
      />

      <ScoreRow
        label="Delamination"
        value={inspection.delamination}
        onChange={(v) => updateField({ delamination: v })}
      />

      <ScoreRow
        label="Appearance"
        value={inspection.appearance}
        onChange={(v) => updateField({ appearance: v })}
      />

      <ScoreRow
        label="Post Condition"
        value={inspection.postCondition}
        onChange={(v) => updateField({ postCondition: v })}
      />

      <View style={styles.materialSection}>
        <Text style={styles.materialLabel}>Post Material</Text>
        <View style={styles.materialButtons}>
          {(["wood", "metal", "other"] as const).map((material) => (
            <Pressable
              key={material}
              onPress={() => updateField({ postMaterial: material })}
              style={[
                styles.materialButton,
                inspection.postMaterial === material && styles.materialButtonSelected,
              ]}
            >
              <Text
                style={[
                  styles.materialButtonText,
                  inspection.postMaterial === material && styles.materialButtonTextSelected,
                ]}
              >
                {material === "wood" ? "Wood" : material === "metal" ? "Metal" : "Other"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.notesSection}>
        <Text style={styles.notesLabel}>Notes</Text>
        <TextInput
          value={inspection.notes ?? ""}
          onChangeText={(text) => updateField({ notes: text })}
          placeholder="Optional inspection notes..."
          placeholderTextColor="#94a3b8"
          multiline
          numberOfLines={3}
          style={styles.notesInput}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 16,
    backgroundColor: "#f8fafc",
  },
  title: {
    fontSize: 16,
    fontWeight: "800",
    marginBottom: 12,
  },
  scoreRow: {
    marginTop: 12,
  },
  scoreLabel: {
    fontWeight: "700",
    marginBottom: 8,
  },
  scoreControls: {
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  scoreButton: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    backgroundColor: "white",
    minWidth: 44,
    alignItems: "center",
  },
  scoreButtonText: {
    fontSize: 20,
    fontWeight: "700",
  },
  scoreValue: {
    flex: 1,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 10,
    padding: 12,
    alignItems: "center",
    backgroundColor: "white",
  },
  scoreValueText: {
    fontSize: 18,
    fontWeight: "900",
  },
  materialSection: {
    marginTop: 16,
  },
  materialLabel: {
    fontWeight: "700",
    marginBottom: 8,
  },
  materialButtons: {
    flexDirection: "row",
    gap: 10,
  },
  materialButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 999,
    backgroundColor: "white",
  },
  materialButtonSelected: {
    backgroundColor: "#1f2937",
    borderColor: "#1f2937",
  },
  materialButtonText: {
    fontWeight: "700",
    color: "#1f2937",
  },
  materialButtonTextSelected: {
    color: "white",
  },
  notesSection: {
    marginTop: 16,
  },
  notesLabel: {
    fontWeight: "700",
    marginBottom: 8,
  },
  notesInput: {
    borderWidth: 1,
    borderColor: "#d0d5dd",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 80,
    backgroundColor: "white",
    textAlignVertical: "top",
  },
});
