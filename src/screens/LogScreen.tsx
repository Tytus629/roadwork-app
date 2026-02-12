import React from "react";
import { View, Text, StyleSheet, FlatList } from "react-native";
import { useAppSelector } from "../store/hooks";

export default function LogScreen() {
  const entries = useAppSelector(s => s.workLog.entries);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Log / Archive</Text>
      <Text style={styles.sub}>Local log entries: {entries.length}</Text>

      <FlatList
        data={entries}
        keyExtractor={(e) => e.id}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{item.action}</Text>
            <Text style={styles.cardSub}>{new Date(item.at).toLocaleString()}</Text>
            <Text style={styles.cardMsg}>{item.message}</Text>
            <Text style={styles.cardSub}>WorkItem: {item.workItemId}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={{ opacity: 0.6, marginTop: 12 }}>No log entries yet. Tap a marker and change status/priority.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 12, gap: 10 },
  title: { fontSize: 22, fontWeight: "900" },
  sub: { fontSize: 12, opacity: 0.7 },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0" },
  cardTitle: { fontSize: 14, fontWeight: "900" },
  cardSub: { fontSize: 12, opacity: 0.7, marginTop: 4 },
  cardMsg: { marginTop: 8, fontSize: 13 },
});
