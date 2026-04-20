/**
 * GuardrailDetailsEditor.tsx
 *
 * Guardrail-specific details form for the Work Item sheet.
 * Renders numeric stepper/text inputs for replacement parts needed,
 * plus an "Other Label" field (visible when Other > 0).
 *
 * All values are buffered locally and committed via onSave callback.
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import type { GuardrailDetails, GuardrailParts } from "../types/workItem";

// ── Constants ────────────────────────────────────────────────────────────

const PART_FIELDS: { key: keyof GuardrailParts; label: string }[] = [
  { key: "posts", label: "Posts" },
  { key: "blocks", label: "Blocks" },
  { key: "rail", label: "Rail" },
  { key: "bolts", label: "Bolts" },
  { key: "terminals", label: "Terminals" },
  { key: "crashCushions", label: "Crash Cushions" },
  { key: "endCaps", label: "End Caps" },
  { key: "reflectors", label: "Reflectors" },
  { key: "other", label: "Other" },
];

const MAX_COUNT = 9999;

const ACTION_OPTIONS = [
  "Reset Posts",
  "Replace Rail",
  "Replace Terminal",
  "Replace End Cap",
  "Install Reflectors",
  "Tighten Hardware",
  "Crash Cushion Repair",
  "Full Section Replace",
] as const;

// ── Helpers ──────────────────────────────────────────────────────────────

function parsePartValue(text: string): number | undefined {
  if (text.trim() === "") return undefined;
  const n = Number(text);
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) return undefined;
  return n;
}

function formatPartValue(v: number | undefined): string {
  return v != null ? String(v) : "";
}

function validateField(text: string): string | null {
  if (text.trim() === "") return null; // blank is valid (no entry)
  const n = Number(text);
  if (isNaN(n)) return "Must be a number";
  if (!Number.isInteger(n)) return "Whole numbers only";
  if (n < 0) return "Must be 0 or greater";
  if (n > MAX_COUNT) return `Max ${MAX_COUNT}`;
  return null;
}

/**
 * Build a cleaned GuardrailDetails object, omitting empty branches.
 * Returns undefined if everything is empty.
 */
export function buildGuardrailDetails(
  parts: Record<string, number | undefined>,
  otherLabel: string,
  actionNeeded?: string | null,
): GuardrailDetails | undefined {
  // Build parts, omitting undefined values
  const cleanParts: Record<string, number> = {};
  let hasParts = false;
  for (const { key } of PART_FIELDS) {
    const v = parts[key];
    if (v != null && v > 0) {
      cleanParts[key] = v;
      hasParts = true;
    }
  }

  const hasOtherLabel = otherLabel.trim().length > 0;
  const normalizedActionNeeded = String(actionNeeded ?? "").trim() || null;

  if (!hasParts && !hasOtherLabel && !normalizedActionNeeded) return undefined;

  const result: GuardrailDetails = {};
  if (hasParts) result.parts = cleanParts as GuardrailParts;
  if (hasOtherLabel) result.otherLabel = otherLabel.trim();
  if (normalizedActionNeeded) result.actionNeeded = normalizedActionNeeded;
  return result;
}

// ── Props ────────────────────────────────────────────────────────────────

type Props = {
  /** Current saved details (for preloading on open/edit) */
  initialDetails: GuardrailDetails | undefined | null;
  /** Called when user taps Save; receives cleaned details or undefined if empty */
  onSave: (details: GuardrailDetails | undefined) => void;
  /** True while a save is in-flight */
  saving?: boolean;
  /** When true, pushes updates on every change (used for draft work orders). */
  autoSaveOnChange?: boolean;
};

// ── Component ────────────────────────────────────────────────────────────

export default function GuardrailDetailsEditor({ initialDetails, onSave, saving, autoSaveOnChange }: Props) {
  // Raw text state for each part field (allows blank display)
  const [partTexts, setPartTexts] = useState<Record<string, string>>({});
  const [otherLabel, setOtherLabel] = useState("");
  const [actionNeeded, setActionNeeded] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string | null>>({});

  // Hydrate from initialDetails
  useEffect(() => {
    const p = initialDetails?.parts ?? {};
    const texts: Record<string, string> = {};
    for (const { key } of PART_FIELDS) {
      texts[key] = formatPartValue((p as any)[key]);
    }
    setPartTexts(texts);
    setOtherLabel(initialDetails?.otherLabel ?? "");
    setActionNeeded(String(initialDetails?.actionNeeded ?? "").trim() || null);
    setDirty(false);
    setErrors({});
  }, [initialDetails]);

  const hasErrors = Object.values(errors).some(e => e != null);

  const otherCount = parsePartValue(partTexts.other ?? "") ?? 0;

  const emitAutoSave = useCallback(
    (nextPartTexts: Record<string, string>, nextOtherLabel: string) => {
      if (!autoSaveOnChange) return;
      const parts: Record<string, number | undefined> = {};
      for (const { key } of PART_FIELDS) {
        parts[key] = parsePartValue(nextPartTexts[key] ?? "");
      }
      onSave(buildGuardrailDetails(parts, nextOtherLabel, actionNeeded));
    },
    [actionNeeded, autoSaveOnChange, onSave],
  );

  const handlePartChange = useCallback((key: string, text: string) => {
    // Allow only digits (or empty)
    const cleaned = text.replace(/[^0-9]/g, "");
    setPartTexts(prev => {
      const next = { ...prev, [key]: cleaned };
      emitAutoSave(next, otherLabel);
      return next;
    });
    setErrors(prev => ({ ...prev, [key]: validateField(cleaned) }));
    setDirty(true);
  }, [emitAutoSave, otherLabel]);

  const adjustPart = useCallback((key: string, delta: number) => {
    setPartTexts(prev => {
      const cur = parsePartValue(prev[key] ?? "") ?? 0;
      const next = Math.max(0, Math.min(MAX_COUNT, cur + delta));
      const nextTexts = { ...prev, [key]: next > 0 ? String(next) : "" };
      emitAutoSave(nextTexts, otherLabel);
      return nextTexts;
    });
    setErrors(prev => ({ ...prev, [key]: null }));
    setDirty(true);
  }, [emitAutoSave, otherLabel]);

  const handleSave = useCallback(() => {
    if (hasErrors) return;
    const parts: Record<string, number | undefined> = {};
    for (const { key } of PART_FIELDS) {
      parts[key] = parsePartValue(partTexts[key] ?? "");
    }
    const details = buildGuardrailDetails(parts, otherLabel, actionNeeded);
    onSave(details);
    setDirty(false);
  }, [actionNeeded, hasErrors, partTexts, otherLabel, onSave]);

  const selectActionNeeded = useCallback((nextAction: string | null) => {
    const normalized = String(nextAction ?? "").trim() || null;
    setActionNeeded(normalized);
    setDirty(true);
    if (!autoSaveOnChange) return;

    const parts: Record<string, number | undefined> = {};
    for (const { key } of PART_FIELDS) {
      parts[key] = parsePartValue(partTexts[key] ?? "");
    }
    onSave(buildGuardrailDetails(parts, otherLabel, normalized));
  }, [autoSaveOnChange, onSave, otherLabel, partTexts]);

  return (
    <View>
      <Text style={s.sectionTitle}>Guardrail Repair Details</Text>
      <View style={s.container}>
        <Text style={s.subHeading}>Replacement Parts Needed</Text>
        <Text style={s.subHeadingHint}>Enter quantities needed for this repair.</Text>

        {PART_FIELDS.map(({ key, label }) => (
          <View key={key}>
            <View style={s.partRow}>
              <Text style={s.partLabel}>{label}</Text>
              <View style={s.partControls}>
                <TouchableOpacity
                  onPress={() => adjustPart(key, -1)}
                  style={s.stepBtn}
                >
                  <Text style={s.stepBtnText}>−</Text>
                </TouchableOpacity>
                <TextInput
                  value={partTexts[key] ?? ""}
                  onChangeText={t => handlePartChange(key, t)}
                  keyboardType="number-pad"
                  placeholder="—"
                  maxLength={4}
                  style={[s.partInput, errors[key] ? s.partInputError : null]}
                  selectTextOnFocus
                />
                <TouchableOpacity
                  onPress={() => adjustPart(key, 1)}
                  style={s.stepBtn}
                >
                  <Text style={s.stepBtnText}>+</Text>
                </TouchableOpacity>
              </View>
            </View>
            {errors[key] ? (
              <Text style={s.errorText}>{errors[key]}</Text>
            ) : null}
          </View>
        ))}

        {/* Other Label — only shown when Other > 0 */}
        {otherCount > 0 && (
          <View style={s.otherLabelRow}>
            <Text style={s.fieldLabel}>Other Label</Text>
            <TextInput
              value={otherLabel}
              onChangeText={t => {
                setOtherLabel(t);
                setDirty(true);
                emitAutoSave(partTexts, t);
              }}
              placeholder="Describe other part…"
              style={s.textInput}
              maxLength={100}
            />
          </View>
        )}

        <Text style={s.subHeading}>Action Needed</Text>
        <View style={s.actionRow}>
          <TouchableOpacity
            onPress={() => selectActionNeeded(null)}
            style={[s.actionChip, !actionNeeded && s.actionChipActive]}
          >
            <Text style={[s.actionChipText, !actionNeeded && s.actionChipTextActive]}>None</Text>
          </TouchableOpacity>
          {ACTION_OPTIONS.map((option) => (
            <TouchableOpacity
              key={option}
              onPress={() => selectActionNeeded(option)}
              style={[s.actionChip, actionNeeded === option && s.actionChipActive]}
            >
              <Text style={[s.actionChipText, actionNeeded === option && s.actionChipTextActive]}>
                {option}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Save / status */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={hasErrors || saving}
          style={[
            s.saveBtn,
            !dirty && !hasErrors && s.savedBtn,
            hasErrors && s.disabledBtn,
          ]}
        >
          <Text
            style={[
              s.saveBtnText,
              !dirty && !hasErrors && s.savedBtnText,
            ]}
          >
            {saving
              ? "Saving…"
              : hasErrors
                ? "Fix errors to save"
                : dirty
                  ? "Save Guardrail Repair Details"
                  : "Saved ✓"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 24,
    marginBottom: 10,
  },
  container: {
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
  },
  subHeading: {
    fontWeight: "700",
    fontSize: 14,
    color: "#374151",
    marginBottom: 4,
  },
  subHeadingHint: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  actionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
  },
  actionChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "white",
  },
  actionChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  actionChipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  actionChipTextActive: {
    color: "white",
  },
  partRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  partLabel: {
    fontWeight: "700",
    fontSize: 14,
    color: "#374151",
    flex: 1,
  },
  partControls: {
    flexDirection: "row",
    alignItems: "center",
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  stepBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
  },
  partInput: {
    width: 56,
    height: 36,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    textAlign: "center",
    fontWeight: "800",
    fontSize: 15,
    color: "#111827",
    marginHorizontal: 6,
    backgroundColor: "white",
    paddingVertical: 0,
  },
  partInputError: {
    borderColor: "#dc2626",
    borderWidth: 2,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
    marginBottom: 2,
  },
  otherLabelRow: {
    marginTop: 12,
  },
  fieldLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
    marginBottom: 6,
  },
  textInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 14,
    backgroundColor: "white",
  },
  saveBtn: {
    marginTop: 14,
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  savedBtn: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
  },
  disabledBtn: {
    backgroundColor: "#f3f4f6",
    borderColor: "#d1d5db",
  },
  saveBtnText: {
    fontWeight: "900",
    fontSize: 14,
    color: "white",
  },
  savedBtnText: {
    color: "#065f46",
  },
});
