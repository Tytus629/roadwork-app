/**
 * ========================================
 * CreateWizardModal.tsx
 * ========================================
 * 
 * PURPOSE:
 * - Multi-step modal wizard for creating new work orders and assets from the map
 * - Guides user through create target, type, location method, and geometry mode
 * - Appears when user taps the "Create" FAB on MapScreen
 * 
 * USER FLOW:
 * Step 1: Choose Item
 *   - User selects Work Order or Asset (if role allows both)
 *
 * Step 2: Choose Type
 *   - User selects work order type or asset type
 *   - Tapping a type button proceeds to Step 2
 * 
 * Step 3: Choose Location
 *   - "Current Location": Creates work order at GPS position immediately
 *   - "Pick Location": Proceeds to Step 3 (geometry mode selection)
 * 
 * Step 4: Choose Geometry (only if "Pick Location" selected)
 *   - "Point": User taps once on map to place a single point
 *   - "Line": User taps multiple times on map to draw a polyline
 * 
 * INTEGRATION WITH MAPSCREEN:
 * - onUseCurrentLocation / onUseCurrentLocationAsset: Called when user chooses "Current Location"
 *   → MapScreen immediately creates work order at GPS position
 * - onPickLocation / onPickLocationAsset: Called when user chooses Point/Line mode
 *   → MapScreen enters "staging" mode (crosshair appears, awaits user taps)
 * 
 * WHY STEPS?
 * - Choose create target first when both capabilities are available.
 * - Type selection determines work-order category or asset family.
 * - Location step splits GPS location vs manual placement.
 * - Geometry step is only shown when needed for manual placement.
 * 
 * STATE MANAGEMENT:
 * - step: Current wizard step (0, 1, 2, or 3)
 * - type / assetType: Selected create type for the active target
 * - geometryMode: point | line (only used internally, not critical)
 * - All state resets on modal close/completion
 * 
 * DESIGN DECISIONS:
 * - No "Next" button: Selections immediately advance to next step (faster UX)
 * - Back buttons: User can revisit previous steps to change choices
 * - Close button: Cancels wizard and resets state
 * - Visual progression: Header shows current step ("Create • Choose Type")
 * 
 * PROPS:
 * - visible: Boolean to show/hide modal
 * - onCancel: Called when user closes modal without completing
 * - onUseCurrentLocation: Called when user chooses GPS location (with type)
 * - onPickLocation: Called when user chooses manual placement (with type and geometry mode)
 * 
 * FUTURE ENHANCEMENTS:
 * - Could add "Recent Types" for faster access to commonly used types
 * - Could remember last selected type per user preference
 * - Could add preview map showing where GPS location is before confirming
 */

import React, { useEffect, useMemo, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import type { WorkType } from "../types/workItem";
import { WORK_ORDER_TYPE_OPTIONS, getWorkOrderTypeColor } from "../constants/workOrderTypes";
import { useColorblindModePreference } from "../settings/colorblindMode";
import { useWorkOrderTypeVisibilityPreference } from "../settings/workOrderTypeVisibility";

export type AssetCreateType = "sign" | "culvert" | "guardrail" | "delineator" | "bridge";

const ASSET_TYPE_OPTIONS: ReadonlyArray<{ key: AssetCreateType; label: string }> = [
  { key: "sign", label: "Sign" },
  { key: "culvert", label: "Culvert" },
  { key: "guardrail", label: "Guardrail" },
  { key: "delineator", label: "Delineator" },
  { key: "bridge", label: "Bridge" },
] as const;

const ASSET_TYPE_COLORS: Record<AssetCreateType, string> = {
  sign: "#2563eb",
  culvert: "#111827",
  guardrail: "#6b7280",
  delineator: "#f97316",
  bridge: "#0f766e",
};

type CreateTarget = "work_order" | "asset";

type Props = {
  visible: boolean;
  canCreateWorkOrder: boolean;
  canCreateAsset: boolean;
  onCancel: () => void;
  onUseCurrentLocation: (type: WorkType) => void;
  onPickLocation: (type: WorkType, mode: "point" | "line") => void;
  onUseCurrentLocationAsset: (type: AssetCreateType) => void;
  onPickLocationAsset: (type: AssetCreateType, mode: "point" | "line" | "bridge_corners") => void;
};

export default function CreateWizardModal({
  visible,
  canCreateWorkOrder,
  canCreateAsset,
  onCancel,
  onUseCurrentLocation,
  onPickLocation,
  onUseCurrentLocationAsset,
  onPickLocationAsset,
}: Props) {
  const colorblindMode = useColorblindModePreference();
  const workOrderTypeVisibility = useWorkOrderTypeVisibilityPreference();
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [target, setTarget] = useState<CreateTarget>("work_order");
  const [type, setType] = useState<WorkType>("pavement_repair");
  const [assetType, setAssetType] = useState<AssetCreateType>("sign");
  const [_geometryMode, setGeometryMode] = useState<"point" | "line" | "bridge_corners">("point");
  const isWorkOrderCulvertType = target === "work_order" && type === "culvert";
  const isBridgeAssetType = target === "asset" && assetType === "bridge";
  const isLinearAssetType =
    target === "asset" && (assetType === "culvert" || assetType === "guardrail");
  const visibleWorkOrderTypeOptions = useMemo(
    () => WORK_ORDER_TYPE_OPTIONS.filter((option) => !!workOrderTypeVisibility[option.key]),
    [workOrderTypeVisibility],
  );
  const isCurrentLocationDisabled = isWorkOrderCulvertType || isLinearAssetType || isBridgeAssetType;
  const allowPointGeometry = target === "asset" ? !isLinearAssetType : !isWorkOrderCulvertType;
  const allowLineGeometry = target === "asset" ? isLinearAssetType : true;
  const allowBridgeCornersGeometry = target === "asset" && isBridgeAssetType;

  useEffect(() => {
    if (!visible) return;

    if (canCreateWorkOrder && canCreateAsset) {
      setTarget("work_order");
      setStep(0);
      return;
    }

    if (canCreateAsset) {
      setTarget("asset");
      setStep(1);
      return;
    }

    setTarget("work_order");
    setStep(1);
  }, [canCreateAsset, canCreateWorkOrder, visible]);

  const header = useMemo(() => {
    if (step === 0) return "Create • Choose Item";
    if (step === 1) return "Create • Choose Type";
    if (step === 2) return "Create • Choose Location";
    return "Create • Choose Geometry";
  }, [step]);

  useEffect(() => {
    if (target !== "work_order") return;
    if (!visibleWorkOrderTypeOptions.length) return;
    if (visibleWorkOrderTypeOptions.some((option) => option.key === type)) return;
    setType(visibleWorkOrderTypeOptions[0].key);
  }, [target, type, visibleWorkOrderTypeOptions]);

  function closeAndReset() {
    setStep(canCreateWorkOrder && canCreateAsset ? 0 : 1);
    setTarget(canCreateAsset && !canCreateWorkOrder ? "asset" : "work_order");
    setType("pavement_repair");
    setAssetType("sign");
    setGeometryMode("point");
    onCancel();
  }

  function handleCurrentLocation() {
    if (target === "asset") {
      onUseCurrentLocationAsset(assetType);
    } else {
      onUseCurrentLocation(type);
    }

    setStep(canCreateWorkOrder && canCreateAsset ? 0 : 1);
    setGeometryMode("point");
  }

  function handlePickLocation() {
    if (isCurrentLocationDisabled) {
      if (target === "asset") {
        onPickLocationAsset(assetType, isBridgeAssetType ? "bridge_corners" : "line");
      } else {
        onPickLocation(type, "line");
      }
      setStep(canCreateWorkOrder && canCreateAsset ? 0 : 1);
      setGeometryMode("point");
      return;
    }

    setStep(3);
  }

  function handleGeometryModeSelected(mode: "point" | "line" | "bridge_corners") {
    if (target === "asset") {
      onPickLocationAsset(assetType, mode);
    } else {
      onPickLocation(type, mode);
    }
    setStep(canCreateWorkOrder && canCreateAsset ? 0 : 1);
    setGeometryMode("point");
  }

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={closeAndReset}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.topRow}>
            <Text style={styles.title}>{header}</Text>
            <Pressable onPress={closeAndReset} style={styles.closeBtn}>
              <Text style={styles.closeText}>Close</Text>
            </Pressable>
          </View>

          {step === 0 && (
            <>
              <Text style={styles.hint}>Create a work order or an asset.</Text>
              <View style={styles.row}>
                {canCreateWorkOrder && (
                  <Pressable
                    onPress={() => {
                      setTarget("work_order");
                      setStep(1);
                    }}
                    style={styles.bigChoice}
                  >
                    <Text style={styles.bigChoiceText}>Work Order</Text>
                    <Text style={styles.small}>Track work and status</Text>
                  </Pressable>
                )}
                {canCreateAsset && (
                  <Pressable
                    onPress={() => {
                      setTarget("asset");
                      setStep(1);
                    }}
                    style={styles.bigChoice}
                  >
                    <Text style={styles.bigChoiceText}>Asset</Text>
                    <Text style={styles.small}>Add to asset inventory</Text>
                  </Pressable>
                )}
              </View>
            </>
          )}

          {step === 1 && (
            <>
              <Text style={styles.hint}>Pick what you're creating.</Text>
              <View style={styles.grid}>
                {target === "work_order"
                  ? visibleWorkOrderTypeOptions.map(({ key: t, label }) => (
                      <Pressable
                        key={t}
                        onPress={() => {
                          setType(t);
                          setStep(2);
                        }}
                        style={[
                          styles.pill,
                          {
                            borderColor: getWorkOrderTypeColor(t, { colorblindMode }),
                            backgroundColor: type === t ? getWorkOrderTypeColor(t, { colorblindMode }) : "#ffffff",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            {
                              color: type === t ? "#ffffff" : getWorkOrderTypeColor(t, { colorblindMode }),
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))
                  : ASSET_TYPE_OPTIONS.map(({ key: t, label }) => (
                      <Pressable
                        key={t}
                        onPress={() => {
                          setAssetType(t);
                          setStep(2);
                        }}
                        style={[
                          styles.pill,
                          {
                            borderColor: ASSET_TYPE_COLORS[t],
                            backgroundColor: assetType === t ? ASSET_TYPE_COLORS[t] : "#ffffff",
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.pillText,
                            {
                              color: assetType === t ? "#ffffff" : ASSET_TYPE_COLORS[t],
                            },
                          ]}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
              </View>

              {target === "work_order" && visibleWorkOrderTypeOptions.length === 0 && (
                <Text style={styles.hint}>No work-order types are visible. Enable at least one type in Settings.</Text>
              )}

              {canCreateWorkOrder && canCreateAsset && (
                <View style={styles.footerRow}>
                  <Pressable onPress={() => setStep(0)} style={styles.secondary}>
                    <Text style={styles.secondaryText}>Back</Text>
                  </Pressable>
                </View>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.hint}>
                {isCurrentLocationDisabled
                  ? target === "work_order"
                    ? "Culvert inlet/outlet capture needs line mode. Pick two map points (inlet first, outlet second)."
                    : isBridgeAssetType
                      ? "Bridge capture needs corner mode. Pick four map corners in order."
                      : "Linear assets use line mode. Pick two or more map points."
                  : "Use your current GPS location or pick a location on the map."}
              </Text>
              <View style={styles.row}>
                <Pressable
                  onPress={handleCurrentLocation}
                  style={[styles.bigChoice, isCurrentLocationDisabled && styles.bigChoiceDisabled]}
                  disabled={isCurrentLocationDisabled}
                >
                  <Text style={styles.bigChoiceText}>Current Location</Text>
                  <Text style={styles.small}>
                    {isCurrentLocationDisabled ? "Unavailable for line-only create" : "Use GPS now"}
                  </Text>
                </Pressable>
                <Pressable onPress={handlePickLocation} style={styles.bigChoice}>
                  <Text style={styles.bigChoiceText}>
                    {isCurrentLocationDisabled ? (isBridgeAssetType ? "Pick Corners" : "Pick Line") : "Pick Location"}
                  </Text>
                  <Text style={styles.small}>
                    {isCurrentLocationDisabled
                      ? isBridgeAssetType
                        ? "Corner mode (4 taps)"
                        : "Line mode (2+ taps)"
                      : "Tap map to place"}
                  </Text>
                </Pressable>
              </View>

              <View style={styles.footerRow}>
                <Pressable onPress={() => setStep(1)} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
              </View>
            </>
          )}

          {step === 3 && (
            <>
              <Text style={styles.hint}>Create a point or draw a line on the map.</Text>
              <View style={styles.row}>
                {allowLineGeometry && (
                  <Pressable onPress={() => handleGeometryModeSelected("line")} style={styles.bigChoice}>
                    <Text style={styles.bigChoiceText}>Line</Text>
                    <Text style={styles.small}>Draw multi-point line</Text>
                  </Pressable>
                )}
                {allowPointGeometry && (
                  <Pressable onPress={() => handleGeometryModeSelected("point")} style={styles.bigChoice}>
                    <Text style={styles.bigChoiceText}>Point</Text>
                    <Text style={styles.small}>Single tap location</Text>
                  </Pressable>
                )}
                {allowBridgeCornersGeometry && (
                  <Pressable onPress={() => handleGeometryModeSelected("bridge_corners")} style={styles.bigChoice}>
                    <Text style={styles.bigChoiceText}>Bridge Corners</Text>
                    <Text style={styles.small}>Capture 4 ordered corners</Text>
                  </Pressable>
                )}
              </View>

              <View style={styles.footerRow}>
                <Pressable onPress={() => setStep(2)} style={styles.secondary}>
                  <Text style={styles.secondaryText}>Back</Text>
                </Pressable>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.35)", justifyContent: "flex-end" },
  sheet: { backgroundColor: "white", borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 14, gap: 10, maxHeight: "85%" },
  topRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  title: { fontSize: 16, fontWeight: "900" },
  closeBtn: { paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: "#f1f5f9" },
  closeText: { fontWeight: "900" },

  hint: { opacity: 0.7, fontSize: 12 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  row: { flexDirection: "row", gap: 10, marginTop: 10 },

  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  pillText: { fontSize: 12, fontWeight: "800" },

  bigChoice: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#cbd5e1", gap: 6, backgroundColor: "#f8fafc" },
  bigChoiceDisabled: { opacity: 0.55 },
  bigChoiceText: { fontWeight: "900", fontSize: 16 },
  small: { fontSize: 12, opacity: 0.7, color: "#334155" },

  footer: { marginTop: 10 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 10 },
  primary: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" },
  primaryText: { color: "white", fontWeight: "900" },
  secondary: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" },
  secondaryText: { fontWeight: "900" },
});
