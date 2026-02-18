import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Geolocation from "@react-native-community/geolocation";
import { requestLocationPermission } from "../native/location";
import { useSignsNear } from "../hooks/useSignsNear";
import { getSignLabelById, getSignCategoryById } from "../utils/signTypeLookup";

export default function SignsMapScreen() {
  const navigation = useNavigation<any>();
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let watchId: number | null = null;

    (async () => {
      const ok = await requestLocationPermission();
      if (!ok) return;

      watchId = Geolocation.watchPosition(
        (pos) => {
          setMyLoc({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        },
        () => {},
        { enableHighAccuracy: true, distanceFilter: 10, interval: 5000 } as any
      );
    })();

    return () => {
      if (watchId != null) Geolocation.clearWatch(watchId);
    };
  }, []);

  const items = useSignsNear(myLoc?.lat ?? null, myLoc?.lng ?? null, radiusMiles);

  if (!myLoc) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Location unavailable</Text>
        <Text style={styles.emptyText}>Enable GPS to see nearby signs.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Near Me</Text>
        <Text style={styles.subtitle}>{items.length} sign(s) in ~{radiusMiles} miles</Text>

        <View style={styles.radiusRow}>
          {[2, 5, 10].map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setRadiusMiles(m)}
              style={[styles.radiusButton, radiusMiles === m && styles.radiusButtonActive]}
            >
              <Text style={[styles.radiusText, radiusMiles === m && styles.radiusTextActive]}>
                {radiusMiles === m ? `OK ${m} mi` : `${m} mi`}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        data={items}
        keyExtractor={(x) => x.wo.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const label = getSignLabelById(item.sd?.signTypeId ?? null);
          const title = label ?? "Sign";

          const cat =
            item.sd?.category ??
            getSignCategoryById(item.sd?.signTypeId ?? null) ??
            "Unknown";

          const subtitle = `${cat} • ${item.sd?.condition ?? "Unknown"} • ${item.wo.priority}`;
          return (
            <TouchableOpacity
              onPress={() => navigation.navigate("WorkItemSheet", { id: item.wo.id })}
              style={styles.listItem}
            >
              <Text style={styles.listTitle}>{title}</Text>
              <Text style={styles.listSubtitle}>{subtitle}</Text>
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No signs in range.</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "white" },
  header: { padding: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  title: { fontWeight: "900", fontSize: 18 },
  subtitle: { marginTop: 4, color: "#666" },
  radiusRow: { flexDirection: "row", marginTop: 10, gap: 8 },
  radiusButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 16,
    borderColor: "#cbd5e1",
  },
  radiusButtonActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  radiusText: { fontWeight: "800", color: "#111827" },
  radiusTextActive: { color: "white" },
  listContent: { paddingHorizontal: 16, paddingVertical: 10 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  listTitle: { fontWeight: "900" },
  listSubtitle: { marginTop: 4, color: "#666" },
  emptyState: { paddingTop: 14 },
  emptyContainer: { flex: 1, padding: 16, justifyContent: "center" },
  emptyTitle: { fontWeight: "900", fontSize: 16 },
  emptyText: { marginTop: 8, color: "#666" },
});
