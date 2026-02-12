import React, { useMemo, useState } from "react";
import { Modal, View, Text, StyleSheet, Pressable } from "react-native";
import type { WorkType } from "../types/workItem";
import { WORK_ORDER_TYPE_OPTIONS, formatWorkType } from "../constants/workOrderTypes";

type Props = {
  visible: boolean;
  onCancel: () => void;
  onUseCurrentLocation: (type: WorkType) => void;
  onPickLocation: (type: WorkType, mode: "point" | "line") => void;
};

export default function CreateWizardModal({ visible, onCancel, onUseCurrentLocation, onPickLocation }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [type, setType] = useState<WorkType>("pothole");
  const [geometryMode, setGeometryMode] = useState<"point" | "line">("point");

  const header = useMemo(() => {
    if (step === 1) return "Create • Choose Type";
    if (step === 2) return "Create • Choose Location";
    return "Create • Choose Geometry";
  }, [step]);

  function closeAndReset() {
    setStep(1);
    setType("pothole");
    setGeometryMode("point");
    onCancel();
  }

  function handleCurrentLocation() {
    onUseCurrentLocation(type);
    setStep(1);
    setGeometryMode("point");
  }

  function handlePickLocation() {
    setStep(3); // Show geometry mode selection
  }

  function handleGeometryModeSelected(mode: "point" | "line") {
    onPickLocation(type, mode);
    setStep(1);
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

          {step === 1 && (
            <>
              <Text style={styles.hint}>Pick what you're creating.</Text>
              <View style={styles.grid}>
                {WORK_ORDER_TYPE_OPTIONS.map(({ key: t, label }) => (
                  <Pressable
                    key={t}
                    onPress={() => {
                      setType(t);
                      setStep(2);
                    }}
                    style={[styles.pill, type === t && styles.pillOn]}
                  >
                    <Text style={[styles.pillText, type === t && styles.pillTextOn]}>{label}</Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}

          {step === 2 && (
            <>
              <Text style={styles.hint}>Use your current GPS location or pick a location on the map.</Text>
              <View style={styles.row}>
                <Pressable onPress={handleCurrentLocation} style={styles.bigChoice}>
                  <Text style={styles.bigChoiceText}>Current Location</Text>
                  <Text style={styles.small}>Use GPS now</Text>
                </Pressable>
                <Pressable onPress={handlePickLocation} style={styles.bigChoice}>
                  <Text style={styles.bigChoiceText}>Pick Location</Text>
                  <Text style={styles.small}>Tap map to place</Text>
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
                <Pressable onPress={() => handleGeometryModeSelected("point")} style={styles.bigChoice}>
                  <Text style={styles.bigChoiceText}>Point</Text>
                  <Text style={styles.small}>Single tap location</Text>
                </Pressable>
                <Pressable onPress={() => handleGeometryModeSelected("line")} style={styles.bigChoice}>
                  <Text style={styles.bigChoiceText}>Line</Text>
                  <Text style={styles.small}>Draw multi-point line</Text>
                </Pressable>
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

  pill: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" },
  pillOn: { backgroundColor: "#111827", borderColor: "#111827" },
  pillText: { fontSize: 12, fontWeight: "800" },
  pillTextOn: { color: "white" },

  bigChoice: { flex: 1, padding: 14, borderRadius: 14, borderWidth: 1, borderColor: "#cbd5e1", gap: 6, backgroundColor: "#f8fafc" },
  bigChoiceText: { fontWeight: "900", fontSize: 16 },
  small: { fontSize: 12, opacity: 0.7, color: "#334155" },

  footer: { marginTop: 10 },
  footerRow: { flexDirection: "row", justifyContent: "space-between", gap: 10, marginTop: 10 },
  primary: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" },
  primaryText: { color: "white", fontWeight: "900" },
  secondary: { flex: 1, padding: 12, borderRadius: 12, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0", alignItems: "center" },
  secondaryText: { fontWeight: "900" },
});
