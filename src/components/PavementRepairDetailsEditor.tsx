import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SimpleSelect } from "./ui/SimpleSelect";
import type { PavementRepairDetails } from "../types/workItem";
import {
  getPavementPreset,
  normalizePavementRepairDetails,
  PAVEMENT_ISSUE_CATEGORY_OPTIONS,
  PAVEMENT_LANE_POSITION_OPTIONS,
  PAVEMENT_PRESETS,
  PAVEMENT_REPAIR_METHOD_OPTIONS,
  PAVEMENT_SURFACE_TYPE_OPTIONS,
  type PavementPresetKey,
  validatePavementRepairDetails,
} from "../workOrders/pavementDetails";

type Props = {
  initialDetails: PavementRepairDetails | undefined | null;
  onSave: (details: PavementRepairDetails | undefined) => void;
  saving?: boolean;
  autoSaveOnChange?: boolean;
};

function repairMethodHelperText(method: PavementRepairDetails["repairMethod"]): string | null {
  if (method === "cold_mix") return "Cold Mix: temporary or quick patch.";
  if (method === "grind_inlay") {
    return "Grind & Inlay: surface repair over a measured area.";
  }
  if (method === "full_depth_patch") {
    return "Full-Depth Patch: deeper structural repair.";
  }
  if (method === "digout_rebuild") {
    return "Digout / Rebuild: likely base failure.";
  }
  return null;
}

export default function PavementRepairDetailsEditor({
  initialDetails,
  onSave,
  saving,
  autoSaveOnChange,
}: Props) {
  const didLogMountRef = useRef(false);
  const [details, setDetails] = useState<PavementRepairDetails>({});
  const [dirty, setDirty] = useState(false);
  const lastHydratedKeyRef = useRef<string | null>(null);
  const lastAutoSavedKeyRef = useRef<string | null>(null);

  const normalizedIncoming = useMemo(
    () => normalizePavementRepairDetails(initialDetails) ?? {},
    [initialDetails],
  );
  const normalizedIncomingKey = useMemo(
    () => JSON.stringify(normalizedIncoming ?? null),
    [normalizedIncoming],
  );

  useEffect(() => {
    if (__DEV__ && !didLogMountRef.current) {
      didLogMountRef.current = true;
      console.log("[PavementRepairDetailsEditor] first-render", {
        autoSaveOnChange: !!autoSaveOnChange,
        incomingKey: normalizedIncomingKey,
      });
    }
  }, [autoSaveOnChange, normalizedIncomingKey]);

  useEffect(() => {
    if (lastHydratedKeyRef.current === normalizedIncomingKey) return;

    if (__DEV__) {
      console.log("[PavementRepairDetailsEditor] prop-sync", {
        from: lastHydratedKeyRef.current,
        to: normalizedIncomingKey,
      });
    }

    lastHydratedKeyRef.current = normalizedIncomingKey;
    setDetails((prev) => {
      const prevKey = JSON.stringify(normalizePavementRepairDetails(prev) ?? null);
      if (prevKey === normalizedIncomingKey) return prev;
      return normalizedIncoming;
    });
    setDirty(false);
    lastAutoSavedKeyRef.current = normalizedIncomingKey;
  }, [normalizedIncoming, normalizedIncomingKey]);

  const validationErrors = useMemo(() => validatePavementRepairDetails(details), [details]);
  const normalizedDetails = useMemo(
    () => normalizePavementRepairDetails(details),
    [details],
  );
  const normalizedDetailsKey = useMemo(
    () => JSON.stringify(normalizedDetails ?? null),
    [normalizedDetails],
  );

  const methodHint = repairMethodHelperText(details.repairMethod);
  const pairHint =
    (details.issueCategory && !details.repairMethod) ||
    (!details.issueCategory && details.repairMethod)
      ? "Tip: set both Problem Type and Repair Method for clearer planning reports."
      : null;

  const setDetail = useCallback(
    <K extends keyof PavementRepairDetails>(key: K, value: PavementRepairDetails[K]) => {
      setDetails((prev) => ({ ...prev, [key]: value }));
      setDirty(true);
    },
    [],
  );

  function applyPreset(key: PavementPresetKey) {
    const preset = getPavementPreset(key);
    setDetails((prev) => ({
      ...prev,
      ...preset,
    }));
    setDirty(true);
  }

  function onRepairMethodChange(value: PavementRepairDetails["repairMethod"] | null) {
    setDetails((prev) => {
      const next: PavementRepairDetails = {
        ...prev,
        repairMethod: value,
      };
      if (value === "cold_mix") {
        next.temporaryRepair = true;
      }
      return next;
    });
    setDirty(true);
  }

  function handleSave() {
    const errors = validatePavementRepairDetails(normalizedDetails);
    if (errors.length) return;
    lastAutoSavedKeyRef.current = normalizedDetailsKey;
    if (__DEV__) {
      console.log("[PavementRepairDetailsEditor] manual-save", {
        key: normalizedDetailsKey,
      });
    }
    onSave(normalizedDetails);
    setDirty(false);
  }

  useEffect(() => {
    if (!autoSaveOnChange) return;
    if (!dirty) return;

    const errors = validatePavementRepairDetails(normalizedDetails);
    if (errors.length) return;

    const saveKey = normalizedDetailsKey;
    if (lastAutoSavedKeyRef.current === saveKey) return;
    lastAutoSavedKeyRef.current = saveKey;

    if (__DEV__) {
      console.log("[PavementRepairDetailsEditor] auto-save", {
        key: saveKey,
      });
    }

    onSave(normalizedDetails);
  }, [autoSaveOnChange, dirty, normalizedDetails, normalizedDetailsKey, onSave]);

  return (
    <View>
      <Text style={s.sectionTitle}>Repair Details</Text>
      <View style={s.container}>
        <Text style={s.subHeading}>Quick Presets</Text>
        <View style={s.presetRow}>
          {PAVEMENT_PRESETS.map((preset) => (
            <TouchableOpacity
              key={preset.key}
              style={s.presetBtn}
              onPress={() => applyPreset(preset.key)}
            >
              <Text style={s.presetBtnText}>{preset.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.subHeading}>Problem + Method</Text>

        <SimpleSelect
          label="Problem Type"
          value={details.issueCategory ?? null}
          options={PAVEMENT_ISSUE_CATEGORY_OPTIONS}
          placeholder="N/A"
          allowNone
          noneLabel="N/A"
          onChange={(v) => setDetail("issueCategory", v)}
        />

        <SimpleSelect
          label="Repair Method"
          value={details.repairMethod ?? null}
          options={PAVEMENT_REPAIR_METHOD_OPTIONS}
          placeholder="N/A"
          allowNone
          noneLabel="N/A"
          onChange={onRepairMethodChange}
        />

        {!!methodHint && <Text style={s.helperText}>{methodHint}</Text>}
        {!!pairHint && <Text style={s.tipText}>{pairHint}</Text>}

        <SimpleSelect
          label="Surface Type"
          value={details.surfaceType ?? null}
          options={PAVEMENT_SURFACE_TYPE_OPTIONS}
          placeholder="N/A"
          allowNone
          noneLabel="N/A"
          onChange={(v) => setDetail("surfaceType", v)}
        />

        <SimpleSelect
          label="Lane Position"
          value={details.lanePosition ?? null}
          options={PAVEMENT_LANE_POSITION_OPTIONS}
          placeholder="N/A"
          allowNone
          noneLabel="N/A"
          onChange={(v) => setDetail("lanePosition", v)}
        />

        {validationErrors.length > 0 && (
          <View style={s.errorsBox}>
            {validationErrors.map((err) => (
              <Text key={err} style={s.errorText}>
                - {err}
              </Text>
            ))}
          </View>
        )}

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || validationErrors.length > 0}
          style={[
            s.saveBtn,
            !dirty && validationErrors.length === 0 && s.savedBtn,
            validationErrors.length > 0 && s.disabledBtn,
          ]}
        >
          <Text style={[s.saveBtnText, !dirty && validationErrors.length === 0 && s.savedBtnText]}>
            {saving
              ? "Saving..."
              : validationErrors.length > 0
                ? "Fix errors to save"
                : dirty
                  ? "Save Repair Details"
                  : "Saved"}
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
    marginTop: 10,
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  presetBtn: {
    borderWidth: 1,
    borderColor: "#93c5fd",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#eff6ff",
  },
  presetBtnText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d4ed8",
  },
  helperText: {
    marginTop: 6,
    fontSize: 12,
    color: "#1f2937",
    fontWeight: "600",
  },
  tipText: {
    marginTop: 6,
    fontSize: 12,
    color: "#6b7280",
  },
  errorsBox: {
    marginTop: 12,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#fecaca",
    backgroundColor: "#fef2f2",
  },
  errorText: {
    color: "#991b1b",
    fontWeight: "600",
    fontSize: 12,
    marginTop: 2,
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
    borderColor: "#9ca3af",
    backgroundColor: "#e5e7eb",
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
