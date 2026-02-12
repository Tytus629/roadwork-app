import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";

function Row({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation<any>();

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>More</Text>
        <Text style={styles.headerSubtitle}>
          Logs, tools, and settings
        </Text>
      </View>

      <Row
        title="Log / Archive"
        subtitle="Audit trail and completed items"
        onPress={() => navigation.navigate("LogArchive")}
      />
      <Row
        title="Signs Due"
        subtitle="Items needing attention"
        onPress={() => navigation.navigate("SignsDue")}
      />
      <Row
        title="Tools"
        subtitle="Field calculators and utilities"
        onPress={() => navigation.navigate("Tools")}
      />
      <Row
        title="Settings"
        subtitle="Notifications, preferences, and app info"
        onPress={() => navigation.navigate("Settings")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontWeight: "800",
    fontSize: 18,
  },
  headerSubtitle: {
    marginTop: 6,
    color: "#666",
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  rowSubtitle: {
    marginTop: 4,
    color: "#666",
  },
});
