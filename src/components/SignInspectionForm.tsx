import React, { useState, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput, Switch } from "react-native";
import type { RetroMethod, InspectionResult, SignColorGroup, MeasuredRetro } from "../types/Sign";

/**
 * Sign Inspection Form Component
 * 
 * Comprehensive inspection sheet matching DOT/MUTCD inspection procedures.
 * Includes automatic grading logic for common scenarios.
 */

type InspectionFormData = {
  legible: boolean;
  damaged: boolean;
  missing: boolean;
  knockedDown: boolean;
  obstructed: boolean;
  faded: boolean;
  dirty: boolean;
  postLeaning?: boolean;
  heightOk?: boolean;
  retroMethod: RetroMethod;
  retroResult: InspectionResult;
  measuredRetro?: MeasuredRetro | null;
  actionReplace: boolean;
  actionRemove: boolean;
  actionAdjustHeight: boolean;
  note?: string;
  inspector?: string;
};

type Props = {
  onSubmit: (data: InspectionFormData) => void;
  onCancel: () => void;
};

const retroMethods: RetroMethod[] = [
  "visual_nighttime",
  "measured_retroreflectivity",
  "expected_sign_life",
  "other",
];

const results: InspectionResult[] = ["ok", "marginal", "replace"];
const colors: SignColorGroup[] = ["white", "yellow", "red", "green", "orange", "blue", "brown"];

export function SignInspectionForm({ onSubmit, onCancel }: Props) {
  const [form, setForm] = useState<InspectionFormData>({
    legible: true,
    damaged: false,
    missing: false,
    knockedDown: false,
    obstructed: false,
    faded: false,
    dirty: false,
    postLeaning: false,
    heightOk: true,
    retroMethod: "visual_nighttime",
    retroResult: "ok",
    actionReplace: false,
    actionRemove: false,
    actionAdjustHeight: false,
    note: "",
    inspector: "",
  });

  const [showMeasuredRetro, setShowMeasuredRetro] = useState(false);
  const [measuredRetro, setMeasuredRetro] = useState<MeasuredRetro>({
    units: "cd/lx/m2",
    backgroundColor: null,
    legendColor: null,
    backgroundRA: null,
    legendRA: null,
    meetsMinimum: null,
  });

  // Auto-grading logic
  useEffect(() => {
    // If missing or knocked down, default to "replace" and set actionReplace
    if (form.missing || form.knockedDown) {
      setForm((prev) => ({
        ...prev,
        retroResult: "replace",
        actionReplace: true,
      }));
    }
    // If faded and using visual nighttime inspection, default to "marginal"
    else if (form.faded && form.retroMethod === "visual_nighttime") {
      setForm((prev) => ({
        ...prev,
        retroResult: "marginal",
      }));
    }
  }, [form.missing, form.knockedDown, form.faded, form.retroMethod]);

  // Show measured retro inputs when method is "measured_retroreflectivity"
  useEffect(() => {
    setShowMeasuredRetro(form.retroMethod === "measured_retroreflectivity");
  }, [form.retroMethod]);

  const handleSubmit = () => {
    const data: InspectionFormData = {
      ...form,
      measuredRetro: showMeasuredRetro ? measuredRetro : null,
    };
    onSubmit(data);
  };

  const updateForm = (patch: Partial<InspectionFormData>) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.sectionTitle}>Physical Condition</Text>
      <View style={styles.checkboxGroup}>
        <CheckboxRow label="Legible" value={form.legible} onChange={(v) => updateForm({ legible: v })} />
        <CheckboxRow label="Damaged" value={form.damaged} onChange={(v) => updateForm({ damaged: v })} />
        <CheckboxRow label="Missing" value={form.missing} onChange={(v) => updateForm({ missing: v })} />
        <CheckboxRow label="Knocked Down" value={form.knockedDown} onChange={(v) => updateForm({ knockedDown: v })} />
        <CheckboxRow label="Obstructed" value={form.obstructed} onChange={(v) => updateForm({ obstructed: v })} />
        <CheckboxRow label="Faded" value={form.faded} onChange={(v) => updateForm({ faded: v })} />
        <CheckboxRow label="Dirty" value={form.dirty} onChange={(v) => updateForm({ dirty: v })} />
      </View>

      <Text style={styles.sectionTitle}>Support / Mounting</Text>
      <View style={styles.checkboxGroup}>
        <CheckboxRow label="Post Leaning" value={form.postLeaning || false} onChange={(v) => updateForm({ postLeaning: v })} />
        <CheckboxRow label="Height OK" value={form.heightOk || false} onChange={(v) => updateForm({ heightOk: v })} />
      </View>

      <Text style={styles.sectionTitle}>Retroreflectivity Assessment</Text>
      <Text style={styles.label}>Method</Text>
      <View style={styles.pickerRow}>
        {retroMethods.map((method) => (
          <Pressable
            key={method}
            style={[styles.pickerButton, form.retroMethod === method && styles.pickerButtonSelected]}
            onPress={() => updateForm({ retroMethod: method })}
          >
            <Text style={[styles.pickerButtonText, form.retroMethod === method && styles.pickerButtonTextSelected]}>
              {method.replace(/_/g, " ")}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Result</Text>
      <View style={styles.pickerRow}>
        {results.map((result) => (
          <Pressable
            key={result}
            style={[styles.pickerButton, form.retroResult === result && styles.pickerButtonSelected]}
            onPress={() => updateForm({ retroResult: result })}
          >
            <Text style={[styles.pickerButtonText, form.retroResult === result && styles.pickerButtonTextSelected]}>
              {result}
            </Text>
          </Pressable>
        ))}
      </View>

      {showMeasuredRetro && (
        <View style={styles.measuredRetroSection}>
          <Text style={styles.subSectionTitle}>Measured Retroreflectivity (RA Values)</Text>
          
          <Text style={styles.label}>Background Color</Text>
          <View style={styles.pickerRow}>
            {colors.map((color) => (
              <Pressable
                key={color}
                style={[styles.colorButton, measuredRetro.backgroundColor === color && styles.pickerButtonSelected]}
                onPress={() => setMeasuredRetro((prev) => ({ ...prev, backgroundColor: color }))}
              >
                <Text style={[styles.pickerButtonText, measuredRetro.backgroundColor === color && styles.pickerButtonTextSelected]}>
                  {color}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Legend Color</Text>
          <View style={styles.pickerRow}>
            {colors.map((color) => (
              <Pressable
                key={color}
                style={[styles.colorButton, measuredRetro.legendColor === color && styles.pickerButtonSelected]}
                onPress={() => setMeasuredRetro((prev) => ({ ...prev, legendColor: color }))}
              >
                <Text style={[styles.pickerButtonText, measuredRetro.legendColor === color && styles.pickerButtonTextSelected]}>
                  {color}
                </Text>
              </Pressable>
            ))}
          </View>

          <Text style={styles.label}>Background RA (cd/lx/m²)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={measuredRetro.backgroundRA?.toString() || ""}
            onChangeText={(text) => setMeasuredRetro((prev) => ({ ...prev, backgroundRA: parseFloat(text) || null }))}
            placeholder="Enter background RA value"
          />

          <Text style={styles.label}>Legend RA (cd/lx/m²)</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={measuredRetro.legendRA?.toString() || ""}
            onChangeText={(text) => setMeasuredRetro((prev) => ({ ...prev, legendRA: parseFloat(text) || null }))}
            placeholder="Enter legend RA value"
          />

          <CheckboxRow
            label="Meets Minimum MUTCD Requirement"
            value={measuredRetro.meetsMinimum || false}
            onChange={(v) => setMeasuredRetro((prev) => ({ ...prev, meetsMinimum: v }))}
          />
        </View>
      )}

      <Text style={styles.sectionTitle}>Actions Required</Text>
      <View style={styles.checkboxGroup}>
        <CheckboxRow label="Replace Sign" value={form.actionReplace} onChange={(v) => updateForm({ actionReplace: v })} />
        <CheckboxRow label="Remove Sign" value={form.actionRemove} onChange={(v) => updateForm({ actionRemove: v })} />
        <CheckboxRow label="Adjust Height" value={form.actionAdjustHeight} onChange={(v) => updateForm({ actionAdjustHeight: v })} />
      </View>

      <Text style={styles.sectionTitle}>Notes</Text>
      <TextInput
        style={styles.textArea}
        multiline
        numberOfLines={4}
        value={form.note}
        onChangeText={(text) => updateForm({ note: text })}
        placeholder="Add inspection notes..."
      />

      <Text style={styles.label}>Inspector</Text>
      <TextInput
        style={styles.input}
        value={form.inspector}
        onChangeText={(text) => updateForm({ inspector: text })}
        placeholder="Inspector name (optional)"
      />

      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
          <Text style={styles.buttonText}>Cancel</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.submitButton]} onPress={handleSubmit}>
          <Text style={styles.buttonText}>Save Inspection</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function CheckboxRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.checkboxRow}>
      <Text style={styles.checkboxLabel}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 20,
    marginBottom: 10,
  },
  subSectionTitle: {
    fontSize: 16,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 8,
  },
  label: {
    fontSize: 14,
    fontWeight: "500",
    marginTop: 12,
    marginBottom: 6,
  },
  checkboxGroup: {
    gap: 8,
  },
  checkboxRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  checkboxLabel: {
    fontSize: 16,
  },
  pickerRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  pickerButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f9f9f9",
  },
  pickerButtonSelected: {
    backgroundColor: "#007AFF",
    borderColor: "#007AFF",
  },
  pickerButtonText: {
    fontSize: 14,
    color: "#333",
  },
  pickerButtonTextSelected: {
    color: "#fff",
    fontWeight: "600",
  },
  colorButton: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#ccc",
    backgroundColor: "#f9f9f9",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  textArea: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#fff",
    minHeight: 100,
    textAlignVertical: "top",
  },
  measuredRetroSection: {
    backgroundColor: "#f5f5f5",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  buttonRow: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
    marginBottom: 32,
  },
  button: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: "#666",
  },
  submitButton: {
    backgroundColor: "#007AFF",
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
});
