import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { CulvertDetails } from "../types/workItem";

type Props = {
  initialDetails: CulvertDetails | undefined | null;
  onSave: (details: CulvertDetails | undefined) => void;
  saving?: boolean;
  autoSaveOnChange?: boolean;
  hasLineGeometry?: boolean;
};

type CulvertToggleKey =
  | "plugged"
  | "endsCrushed"
  | "separationNeedsRepair"
  | "inletBlocked"
  | "outletBlocked"
  | "standingWater"
  | "needsJetting"
  | "erosionAroundEnds"
  | "underminingPresent"
  | "needsReplacement";

const PRIMARY_TOGGLES: Array<{ key: CulvertToggleKey; label: string }> = [
  { key: "plugged", label: "Plugged" },
  { key: "endsCrushed", label: "Ends Crushed" },
  { key: "separationNeedsRepair", label: "Separation Needs Repair" },
];

const SUPPORTING_TOGGLES: Array<{ key: CulvertToggleKey; label: string }> = [
  { key: "inletBlocked", label: "Inlet Blocked" },
  { key: "outletBlocked", label: "Outlet Blocked" },
  { key: "standingWater", label: "Standing Water" },
  { key: "needsJetting", label: "Needs Jetting" },
  { key: "erosionAroundEnds", label: "Erosion Around Ends" },
  { key: "underminingPresent", label: "Undermining Present" },
  { key: "needsReplacement", label: "Needs Replacement" },
];

const ACTION_OPTIONS = [
  "Jet / Flush",
  "Dig Out Blockage",
  "Repair Ends",
  "Repair Separation",
  "Erosion Control",
  "Replace Culvert",
  "CCTV Inspect",
] as const;

function inferIssue(details: CulvertDetails): CulvertDetails["issue"] | undefined {
  if (details.plugged) return "plugged";
  if (details.endsCrushed) return "ends_crushed";
  if (details.separationNeedsRepair) return "separation_needs_repair";
  return details.issue;
}

function normalizeCulvertDetails(
  input: CulvertDetails | undefined | null,
  hasLineGeometry: boolean,
): CulvertDetails {
  const normalizedActionNeeded = String(input?.actionNeeded ?? "").trim() || null;
  const next: CulvertDetails = {
    plugged: !!input?.plugged,
    endsCrushed: !!input?.endsCrushed,
    separationNeedsRepair: !!input?.separationNeedsRepair,
    inletBlocked: !!input?.inletBlocked,
    outletBlocked: !!input?.outletBlocked,
    standingWater: !!input?.standingWater,
    needsJetting: !!input?.needsJetting,
    erosionAroundEnds: !!input?.erosionAroundEnds,
    underminingPresent: !!input?.underminingPresent,
    needsReplacement: !!input?.needsReplacement,
    captureInletOutletFromLine:
      typeof input?.captureInletOutletFromLine === "boolean"
        ? input.captureInletOutletFromLine
        : hasLineGeometry,
    actionNeeded: normalizedActionNeeded,
  };

  // Backward-compat: map older single-issue records to explicit flags.
  if (input?.issue === "plugged") next.plugged = true;
  if (input?.issue === "ends_crushed") next.endsCrushed = true;
  if (input?.issue === "separation_needs_repair") next.separationNeedsRepair = true;

  next.issue = inferIssue({ ...input, ...next });
  return next;
}

function buildCulvertDetails(
  details: CulvertDetails,
  hasLineGeometry: boolean,
): CulvertDetails | undefined {
  const normalizedActionNeeded = String(details.actionNeeded ?? "").trim() || null;
  const cleaned: CulvertDetails = {
    plugged: !!details.plugged,
    endsCrushed: !!details.endsCrushed,
    separationNeedsRepair: !!details.separationNeedsRepair,
    inletBlocked: !!details.inletBlocked,
    outletBlocked: !!details.outletBlocked,
    standingWater: !!details.standingWater,
    needsJetting: !!details.needsJetting,
    erosionAroundEnds: !!details.erosionAroundEnds,
    underminingPresent: !!details.underminingPresent,
    needsReplacement: !!details.needsReplacement,
    captureInletOutletFromLine: hasLineGeometry
      ? !!details.captureInletOutletFromLine
      : undefined,
    actionNeeded: normalizedActionNeeded,
  };

  cleaned.issue = inferIssue(cleaned);

  const hasAnyFlag = Object.values(cleaned).some((v) => v === true);
  const hasCaptureSetting =
    hasLineGeometry && typeof cleaned.captureInletOutletFromLine === "boolean";
  if (!hasAnyFlag && !cleaned.issue && !hasCaptureSetting && !cleaned.actionNeeded) return undefined;
  return cleaned;
}

function ToggleChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && s.chipTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function CulvertDetailsEditor({
  initialDetails,
  onSave,
  saving,
  autoSaveOnChange,
  hasLineGeometry = false,
}: Props) {
  const [details, setDetails] = useState<CulvertDetails>({});
  const [dirty, setDirty] = useState(false);
  const lastAutoSavedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    setDetails(normalizeCulvertDetails(initialDetails, hasLineGeometry));
    setDirty(false);
    lastAutoSavedKeyRef.current = null;
  }, [hasLineGeometry, initialDetails]);

  const saveReady = useMemo(
    () => buildCulvertDetails(details, hasLineGeometry),
    [details, hasLineGeometry],
  );
  const saveReadyKey = useMemo(() => JSON.stringify(saveReady ?? null), [saveReady]);

  const toggle = useCallback((key: CulvertToggleKey) => {
    setDetails((prev) => {
      const next = {
        ...prev,
        [key]: !prev[key],
      };
      next.issue = inferIssue(next);
      return next;
    });
    setDirty(true);
  }, []);

  const toggleCaptureInletOutlet = useCallback(() => {
    if (!hasLineGeometry) return;
    setDetails((prev) => ({
      ...prev,
      captureInletOutletFromLine: !prev.captureInletOutletFromLine,
    }));
    setDirty(true);
  }, [hasLineGeometry]);

  const selectActionNeeded = useCallback((action: string | null) => {
    setDetails((prev) => ({ ...prev, actionNeeded: action }));
    setDirty(true);
  }, []);

  function handleSave() {
    onSave(saveReady);
    setDirty(false);
  }

  useEffect(() => {
    if (!autoSaveOnChange) return;
    if (!dirty) return;

    if (lastAutoSavedKeyRef.current === saveReadyKey) return;
    lastAutoSavedKeyRef.current = saveReadyKey;

    onSave(saveReady);
  }, [autoSaveOnChange, dirty, onSave, saveReady, saveReadyKey]);

  return (
    <View>
      <Text style={s.sectionTitle}>Culvert Condition</Text>
      <View style={s.container}>
        <Text style={s.subHeading}>Primary Findings</Text>
        <View style={s.chipRow}>
          {PRIMARY_TOGGLES.map((item) => (
            <ToggleChip
              key={item.key}
              label={item.label}
              active={!!details[item.key]}
              onPress={() => toggle(item.key)}
            />
          ))}
        </View>

        <Text style={s.subHeading}>Additional Checks</Text>
        <View style={s.chipRow}>
          {SUPPORTING_TOGGLES.map((item) => (
            <ToggleChip
              key={item.key}
              label={item.label}
              active={!!details[item.key]}
              onPress={() => toggle(item.key)}
            />
          ))}
        </View>

        <Text style={s.subHeading}>Inlet / Outlet Geometry</Text>
        <Text style={s.helperText}>
          {hasLineGeometry
            ? "Use the first two line points as inlet and outlet for this culvert asset."
            : "Create this work order as a line (2+ points) if you want to capture inlet and outlet."}
        </Text>
        <TouchableOpacity
          onPress={toggleCaptureInletOutlet}
          disabled={!hasLineGeometry}
          style={[
            s.geometryToggle,
            details.captureInletOutletFromLine && s.geometryToggleOn,
            !hasLineGeometry && s.geometryToggleDisabled,
          ]}
        >
          <Text
            style={[
              s.geometryToggleText,
              details.captureInletOutletFromLine && s.geometryToggleTextOn,
            ]}
          >
            {details.captureInletOutletFromLine
              ? "Capture Inlet/Outlet: ON"
              : "Capture Inlet/Outlet: OFF"}
          </Text>
        </TouchableOpacity>

        <Text style={s.subHeading}>Action Needed</Text>
        <View style={s.chipRow}>
          <ActionChip
            label="None"
            active={!details.actionNeeded}
            onPress={() => selectActionNeeded(null)}
          />
          {ACTION_OPTIONS.map((action) => (
            <ActionChip
              key={action}
              label={action}
              active={details.actionNeeded === action}
              onPress={() => selectActionNeeded(action)}
            />
          ))}
        </View>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving}
          style={[s.saveBtn, !dirty && s.savedBtn]}
        >
          <Text style={[s.saveBtnText, !dirty && s.savedBtnText]}>
            {saving ? "Saving..." : dirty ? "Save Culvert Details" : "Saved"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

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
    marginTop: 8,
    marginBottom: 8,
  },
  helperText: {
    marginTop: -2,
    marginBottom: 8,
    fontSize: 12,
    color: "#6b7280",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  chipTextActive: {
    color: "white",
  },
  geometryToggle: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  geometryToggleOn: {
    borderColor: "#4b5563",
    backgroundColor: "#e5e7eb",
  },
  geometryToggleDisabled: {
    opacity: 0.55,
  },
  geometryToggleText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#334155",
  },
  geometryToggleTextOn: {
    color: "#111827",
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
  saveBtnText: {
    color: "white",
    fontWeight: "800",
  },
  savedBtn: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
  },
  savedBtnText: {
    color: "#065f46",
  },
});
