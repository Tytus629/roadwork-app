import React, { useMemo, useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import SignsMapScreen from "./SignsMapScreen";
import SignsDueScreen from "./SignsDueScreen";

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
    <TouchableOpacity
      onPress={onPress}
      style={[
        styles.segButton,
        active && styles.segButtonActive
      ]}
    >
      <Text style={[styles.segButtonText, active && styles.segButtonTextActive]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export default function SignsHomeScreen() {
  const [mode, setMode] = useState<Mode>("near");

  const header = useMemo(() => {
    return (
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Signs</Text>
        <Text style={styles.headerSubtitle}>Near Me and Due views</Text>

        <View style={styles.segmentedControl}>
          <SegButton label="Near Me" active={mode === "near"} onPress={() => setMode("near")} />
          <SegButton label="Due" active={mode === "due"} onPress={() => setMode("due")} />
        </View>
      </View>
    );
  }, [mode]);

  return (
    <View style={styles.container}>
      {header}

      <View style={styles.content}>
        {mode === "near" ? <SignsMapScreen /> : <SignsDueScreen />}
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
  },
  headerTitle: {
    fontWeight: "800",
    fontSize: 18,
  },
  headerSubtitle: {
    marginTop: 4,
    color: "#666",
  },
  segmentedControl: {
    flexDirection: "row",
    gap: 10,
    marginTop: 12,
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
  content: {
    flex: 1,
  },
});
