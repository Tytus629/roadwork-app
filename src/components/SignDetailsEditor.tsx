/**
 * SignDetailsEditor.tsx
 *
 * Sign-specific details form for the Work Item sheet.
 * Renders a preset picker, required signType field, and optional
 * fields (MUTCD Code, Size, Material, Mount/Support/Sheeting Type,
 * Legend, Side of Road, Note).
 *
 * All values are buffered locally and committed via onSave callback.
 * Saves into the canonical `details` JSON blob (not the sign_details table).
 */

import React, { useCallback, useEffect, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Modal,
  StyleSheet,
} from "react-native";
import type { SignDetailsInfo, SideOfRoad } from "../types/workItem";

// ── Preset definitions ──────────────────────────────────────────────────

type SignPresetDef = {
  key: string;
  label: string;
  legend?: string;
  mutcd?: string;
};

const SIGN_PRESETS: SignPresetDef[] = [
  { key: "STOP", label: "Stop", legend: "STOP", mutcd: "R1-1" },
  { key: "YIELD", label: "Yield", legend: "YIELD", mutcd: "R1-2" },
  { key: "SPEED_LIMIT", label: "Speed Limit", legend: "SPEED LIMIT" },
  { key: "ONE_WAY", label: "One Way", legend: "ONE WAY" },
  { key: "DO_NOT_ENTER", label: "Do Not Enter", legend: "DO NOT ENTER", mutcd: "R5-1" },
  { key: "WRONG_WAY", label: "Wrong Way", legend: "WRONG WAY", mutcd: "R5-1a" },
  { key: "NO_PARKING", label: "No Parking", legend: "NO PARKING" },
  { key: "STREET_NAME", label: "Street Name" },
  { key: "CHEVRON", label: "Chevron", mutcd: "W1-8" },
  { key: "OBJECT_MARKER", label: "Object Marker" },
  { key: "DELINEATOR", label: "Delineator" },
  { key: "CUSTOM", label: "Custom" },
];

const SIDE_OF_ROAD_OPTIONS: { label: string; value: SideOfRoad }[] = [
  { label: "Right", value: "right" },
  { label: "Left", value: "left" },
  { label: "Median", value: "median" },
  { label: "Overhead", value: "overhead" },
  { label: "Unknown", value: "unknown" },
];

// ── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a cleaned SignDetailsInfo object, omitting blank optional fields.
 * Returns undefined if signType is blank.
 */
export function buildSignDetailsInfo(
  fields: {
    signType: string;
    MUTCDCode: string;
    size: string;
    material: string;
    mountType: string;
    supportType: string;
    sheetingType: string;
    legend: string;
    sideOfRoad: SideOfRoad | "";
    note: string;
  },
): SignDetailsInfo | undefined {
  const signType = fields.signType.trim();
  if (!signType) return undefined;

  const result: SignDetailsInfo = { signType };
  if (fields.MUTCDCode.trim()) result.MUTCDCode = fields.MUTCDCode.trim();
  if (fields.size.trim()) result.size = fields.size.trim();
  if (fields.material.trim()) result.material = fields.material.trim();
  if (fields.mountType.trim()) result.mountType = fields.mountType.trim();
  if (fields.supportType.trim()) result.supportType = fields.supportType.trim();
  if (fields.sheetingType.trim()) result.sheetingType = fields.sheetingType.trim();
  if (fields.legend.trim()) result.legend = fields.legend.trim();
  if (fields.sideOfRoad) result.sideOfRoad = fields.sideOfRoad;
  if (fields.note.trim()) result.note = fields.note.trim();
  return result;
}

// ── Props ────────────────────────────────────────────────────────────────

type Props = {
  /** Current saved details (for preloading on open/edit) */
  initialDetails: SignDetailsInfo | undefined | null;
  /** Called when user taps Save; receives cleaned details or undefined if empty/invalid */
  onSave: (details: SignDetailsInfo | undefined) => void;
  /** True while a save is in-flight */
  saving?: boolean;
};

// ── Component ────────────────────────────────────────────────────────────

export default function SignDetailsEditor({ initialDetails, onSave, saving }: Props) {
  const [signType, setSignType] = useState("");
  const [MUTCDCode, setMUTCDCode] = useState("");
  const [size, setSize] = useState("");
  const [material, setMaterial] = useState("");
  const [mountType, setMountType] = useState("");
  const [supportType, setSupportType] = useState("");
  const [sheetingType, setSheetingType] = useState("");
  const [legend, setLegend] = useState("");
  const [sideOfRoad, setSideOfRoad] = useState<SideOfRoad | "">("");
  const [note, setNote] = useState("");
  const [dirty, setDirty] = useState(false);
  const [signTypeError, setSignTypeError] = useState<string | null>(null);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);

  // Hydrate from initialDetails
  useEffect(() => {
    setSignType(initialDetails?.signType ?? "");
    setMUTCDCode(initialDetails?.MUTCDCode ?? "");
    setSize(initialDetails?.size ?? "");
    setMaterial(initialDetails?.material ?? "");
    setMountType(initialDetails?.mountType ?? "");
    setSupportType(initialDetails?.supportType ?? "");
    setSheetingType(initialDetails?.sheetingType ?? "");
    setLegend(initialDetails?.legend ?? "");
    setSideOfRoad(initialDetails?.sideOfRoad ?? "");
    setNote(initialDetails?.note ?? "");
    setDirty(false);
    setSignTypeError(null);
  }, [initialDetails]);

  // Find matching preset for current signType (for highlight in picker)
  const matchedPreset = SIGN_PRESETS.find(
    p => p.key === signType || p.label.toLowerCase() === signType.toLowerCase(),
  );

  const handleSelectPreset = useCallback((preset: SignPresetDef) => {
    setSignType(preset.label);
    if (preset.legend) setLegend(preset.legend);
    if (preset.mutcd) setMUTCDCode(preset.mutcd);
    setDirty(true);
    setSignTypeError(null);
    setPresetPickerOpen(false);
  }, []);

  const markDirty = useCallback(() => {
    setDirty(true);
  }, []);

  const handleSave = useCallback(() => {
    const trimmed = signType.trim();
    if (!trimmed) {
      setSignTypeError("Sign Type is required");
      return;
    }
    setSignTypeError(null);

    const details = buildSignDetailsInfo({
      signType,
      MUTCDCode,
      size,
      material,
      mountType,
      supportType,
      sheetingType,
      legend,
      sideOfRoad,
      note,
    });
    onSave(details);
    setDirty(false);
  }, [signType, MUTCDCode, size, material, mountType, supportType, sheetingType, legend, sideOfRoad, note, onSave]);

  return (
    <View>
      <Text style={s.sectionTitle}>Sign Info</Text>
      <View style={s.container}>

        {/* ── Preset Picker ── */}
        <TouchableOpacity
          onPress={() => setPresetPickerOpen(true)}
          style={s.presetButton}
        >
          <Text style={s.presetButtonText}>
            {matchedPreset ? `Preset: ${matchedPreset.label}` : "Choose Sign Preset…"}
          </Text>
        </TouchableOpacity>

        <Modal
          visible={presetPickerOpen}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setPresetPickerOpen(false)}
        >
          <View style={s.modalContainer}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Sign Preset</Text>
              <TouchableOpacity onPress={() => setPresetPickerOpen(false)} style={s.modalCloseBtn}>
                <Text style={s.modalCloseBtnText}>X</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.modalScroll} contentContainerStyle={s.modalContent}>
              {SIGN_PRESETS.map(p => (
                <TouchableOpacity
                  key={p.key}
                  onPress={() => handleSelectPreset(p)}
                  style={[
                    s.presetRow,
                    matchedPreset?.key === p.key && s.presetRowActive,
                  ]}
                >
                  <Text style={[
                    s.presetRowText,
                    matchedPreset?.key === p.key && s.presetRowTextActive,
                  ]}>
                    {p.label}
                  </Text>
                  {p.mutcd ? (
                    <Text style={s.presetMutcd}>{p.mutcd}</Text>
                  ) : null}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </Modal>

        {/* ── Sign Type (required) ── */}
        <Text style={s.fieldLabel}>
          Sign Type <Text style={s.required}>*</Text>
        </Text>
        <TextInput
          value={signType}
          onChangeText={t => {
            setSignType(t);
            if (t.trim()) setSignTypeError(null);
            markDirty();
          }}
          placeholder="e.g. Stop, Speed Limit, Custom…"
          style={[s.textInput, signTypeError ? s.inputError : null]}
          maxLength={100}
        />
        {signTypeError ? <Text style={s.errorText}>{signTypeError}</Text> : null}

        {/* ── MUTCD Code ── */}
        <Text style={s.fieldLabel}>MUTCD Code</Text>
        <TextInput
          value={MUTCDCode}
          onChangeText={t => { setMUTCDCode(t); markDirty(); }}
          placeholder="e.g. R1-1"
          style={s.textInput}
          maxLength={20}
        />

        {/* ── Legend ── */}
        <Text style={s.fieldLabel}>Legend</Text>
        <TextInput
          value={legend}
          onChangeText={t => { setLegend(t); markDirty(); }}
          placeholder="e.g. STOP, SPEED LIMIT 35"
          style={s.textInput}
          maxLength={200}
        />

        {/* ── Size ── */}
        <Text style={s.fieldLabel}>Size</Text>
        <TextInput
          value={size}
          onChangeText={t => { setSize(t); markDirty(); }}
          placeholder='e.g. 30"x30", 24"x30"'
          style={s.textInput}
          maxLength={50}
        />

        {/* ── Material ── */}
        <Text style={s.fieldLabel}>Material</Text>
        <TextInput
          value={material}
          onChangeText={t => { setMaterial(t); markDirty(); }}
          placeholder="e.g. Aluminum, Plywood"
          style={s.textInput}
          maxLength={50}
        />

        {/* ── Mount Type ── */}
        <Text style={s.fieldLabel}>Mount Type</Text>
        <TextInput
          value={mountType}
          onChangeText={t => { setMountType(t); markDirty(); }}
          placeholder="e.g. Post-mounted, Overhead"
          style={s.textInput}
          maxLength={50}
        />

        {/* ── Support Type ── */}
        <Text style={s.fieldLabel}>Support Type</Text>
        <TextInput
          value={supportType}
          onChangeText={t => { setSupportType(t); markDirty(); }}
          placeholder="e.g. U-Channel, Wood, Telespar"
          style={s.textInput}
          maxLength={50}
        />

        {/* ── Sheeting Type ── */}
        <Text style={s.fieldLabel}>Sheeting Type</Text>
        <TextInput
          value={sheetingType}
          onChangeText={t => { setSheetingType(t); markDirty(); }}
          placeholder="e.g. DG, HIP, Diamond Grade"
          style={s.textInput}
          maxLength={50}
        />

        {/* ── Side of Road ── */}
        <Text style={s.fieldLabel}>Side of Road</Text>
        <View style={s.chipRow}>
          {SIDE_OF_ROAD_OPTIONS.map(o => (
            <TouchableOpacity
              key={o.value}
              onPress={() => {
                setSideOfRoad(prev => prev === o.value ? "" : o.value);
                markDirty();
              }}
              style={[s.chip, sideOfRoad === o.value && s.chipActive]}
            >
              <Text style={[s.chipText, sideOfRoad === o.value && s.chipTextActive]}>
                {o.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Note ── */}
        <Text style={s.fieldLabel}>Sign Note</Text>
        <TextInput
          value={note}
          onChangeText={t => { setNote(t); markDirty(); }}
          placeholder="Additional notes…"
          multiline
          style={s.noteInput}
          maxLength={1000}
        />

        {/* ── Save ── */}
        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[
            s.saveBtn,
            !dirty && !signTypeError && s.savedBtn,
          ]}
        >
          <Text
            style={[
              s.saveBtnText,
              !dirty && !signTypeError && s.savedBtnText,
            ]}
          >
            {saving
              ? "Saving…"
              : dirty
                ? "Save Sign Details"
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
  presetButton: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "white",
    marginBottom: 12,
  },
  presetButtonText: {
    fontWeight: "700",
    fontSize: 14,
    color: "#374151",
  },
  // ── Modal (preset picker) ──
  modalContainer: {
    flex: 1,
    backgroundColor: "white",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "900",
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  modalCloseBtnText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
  },
  modalScroll: {
    flex: 1,
  },
  modalContent: {
    padding: 16,
  },
  presetRow: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
    borderRadius: 8,
    marginBottom: 4,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  presetRowActive: {
    backgroundColor: "#111827",
  },
  presetRowText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#374151",
  },
  presetRowTextActive: {
    color: "white",
  },
  presetMutcd: {
    fontSize: 13,
    color: "#6b7280",
  },
  // ── Fields ──
  fieldLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
    marginTop: 12,
    marginBottom: 6,
  },
  required: {
    color: "#dc2626",
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
  inputError: {
    borderColor: "#dc2626",
    borderWidth: 2,
  },
  errorText: {
    color: "#dc2626",
    fontSize: 12,
    fontWeight: "600",
    marginTop: 4,
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    padding: 10,
    minHeight: 70,
    textAlignVertical: "top",
    fontSize: 14,
    backgroundColor: "white",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
  },
  chipTextActive: {
    color: "white",
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
  saveBtnText: {
    fontWeight: "900",
    fontSize: 14,
    color: "white",
  },
  savedBtnText: {
    color: "#065f46",
  },
});
