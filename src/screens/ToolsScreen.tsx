import React from "react";
import { View, Text, StyleSheet, Pressable, ScrollView } from "react-native";
import { useNavigation } from "@react-navigation/native";

export default function ToolsScreen() {
  const navigation = useNavigation() as any;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Tools</Text>
      <Text style={styles.subtitle}>Field calculation and measurement tools</Text>

      <View style={styles.grid}>
        <Pressable
          onPress={() => navigation.navigate("AsphaltCalculator")}
          style={styles.toolCard}
        >
          <Text style={styles.toolIcon}>🛣️</Text>
          <Text style={styles.toolTitle}>Asphalt Calculator</Text>
          <Text style={styles.toolDescription}>
            Calculate tons and truckloads for paving jobs
          </Text>
        </Pressable>

        <Pressable
          onPress={() => navigation.navigate("MeasureDistance")}
          style={styles.toolCard}
        >
          <Text style={styles.toolIcon}>📏</Text>
          <Text style={styles.toolTitle}>GPS Distance Measure</Text>
          <Text style={styles.toolDescription}>
            Measure distance between two GPS points
          </Text>
        </Pressable>
      </View>

      <View style={styles.infoBox}>
        <Text style={styles.infoText}>
          ℹ️ All tools work offline and do not require network connectivity.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, gap: 16 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 14, opacity: 0.7, marginTop: -8 },

  grid: { marginTop: 8, gap: 12 },

  toolCard: {
    padding: 16,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 16,
    backgroundColor: "#f8fafc",
    gap: 8,
  },
  toolIcon: { fontSize: 32 },
  toolTitle: { fontSize: 18, fontWeight: "800" },
  toolDescription: { fontSize: 13, opacity: 0.7, lineHeight: 18 },

  infoBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#dbeafe",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  infoText: { fontSize: 13, opacity: 0.9 },
});
