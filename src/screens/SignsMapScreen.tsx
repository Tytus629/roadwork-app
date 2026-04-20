/**
 * SignsMapScreen — Shows signs near the user's GPS location.
 *
 * ORG SCOPING:
 * Uses useOrg() to get the current orgId and passes it to useSignsNear().
 * This ensures only signs belonging to the active organization are shown.
 * See workOrdersRepo.ts header "ORG ISOLATION" section for details.
 *
 * GPS WATCH:
 * Uses Geolocation.watchPosition with distanceFilter=10m so the list
 * updates as the user drives. The radius selector (2/5/10 mi) controls
 * the bounding box query in useSignsNear → listSignsNear.
 */
import React, { useEffect, useMemo, useState } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Geolocation from "@react-native-community/geolocation";
import { requestLocationPermission } from "../native/location";
import { useSignsNear } from "../hooks/useSignsNear";
import { getSignLabelById, getSignCategoryById } from "../utils/signTypeLookup";
import { useOrg } from "../state/OrgContext";
import type { SignWorkOrder } from "../db/workOrdersRepo";

type SignTypeFilterKey =
  | "stop"
  | "yield"
  | "speed_limit"
  | "warning"
  | "street_name"
  | "no_parking"
  | "one_way"
  | "school"
  | "railroad"
  | "other";

const SIGN_TYPE_FILTERS: Array<{ key: SignTypeFilterKey; label: string }> = [
  { key: "stop", label: "Stop" },
  { key: "yield", label: "Yield" },
  { key: "speed_limit", label: "Speed Limit" },
  { key: "warning", label: "Warning" },
  { key: "street_name", label: "Street Name" },
  { key: "no_parking", label: "No Parking" },
  { key: "one_way", label: "One Way" },
  { key: "school", label: "School" },
  { key: "railroad", label: "Railroad" },
  { key: "other", label: "Other" },
];

function normalizeSignText(value: unknown): string {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[\-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getSignTypeMatches(item: SignWorkOrder): Set<SignTypeFilterKey> {
  const lookupLabel = getSignLabelById(item.sd?.signTypeId ?? null);
  const lookupCategory = getSignCategoryById(item.sd?.signTypeId ?? null);

  const sourceText = [
    item.sd?.signTypeId,
    item.sd?.category,
    item.sd?.signCategory,
    item.sd?.signCode,
    item.sd?.signName,
    lookupLabel,
    lookupCategory,
  ]
    .map(normalizeSignText)
    .filter(Boolean)
    .join(" ");

  const matches = new Set<SignTypeFilterKey>();

  if (/\bstop\b/.test(sourceText)) matches.add("stop");
  if (/\byield\b/.test(sourceText)) matches.add("yield");
  if (/\bspeed\s+limit\b/.test(sourceText)) matches.add("speed_limit");
  if (/\bwarning\b/.test(sourceText)) matches.add("warning");
  if (/\bstreet\s+name\b/.test(sourceText)) matches.add("street_name");
  if (/\bno\s+parking\b/.test(sourceText)) matches.add("no_parking");
  if (/\bone\s+way\b/.test(sourceText)) matches.add("one_way");
  if (/\bschool\b/.test(sourceText)) matches.add("school");
  if (/\brail\s*road\b|\brailroad\b/.test(sourceText)) matches.add("railroad");

  if (matches.size === 0 || /\bother\b|\bunknown\b/.test(sourceText)) {
    matches.add("other");
  }

  return matches;
}

export default function SignsMapScreen() {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
  const [radiusMiles, setRadiusMiles] = useState(5);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [selectedTypeFilters, setSelectedTypeFilters] = useState<SignTypeFilterKey[]>([]);

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

  const items = useSignsNear(myLoc?.lat ?? null, myLoc?.lng ?? null, radiusMiles, orgId);

  const filteredItems = useMemo(() => {
    if (selectedTypeFilters.length === 0) return items;
    const selectedSet = new Set(selectedTypeFilters);
    return items.filter((item) => {
      const matched = getSignTypeMatches(item);
      for (const key of matched) {
        if (selectedSet.has(key)) return true;
      }
      return false;
    });
  }, [items, selectedTypeFilters]);

  useEffect(() => {
    if (!__DEV__) return;
    console.log("[SignsNearMe][filters]", {
      radiusMiles,
      selectedTypeFilters,
      countBefore: items.length,
      countAfter: filteredItems.length,
    });
  }, [radiusMiles, selectedTypeFilters, items.length, filteredItems.length]);

  function toggleTypeFilter(key: SignTypeFilterKey) {
    setSelectedTypeFilters((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

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
        <Text style={styles.subtitle}>{filteredItems.length} sign(s) in ~{radiusMiles} miles</Text>

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

        <Text style={styles.filterTitle}>Sign Type</Text>
        <View style={styles.chipRow}>
          {SIGN_TYPE_FILTERS.map((filter) => {
            const active = selectedTypeFilters.includes(filter.key);
            return (
              <TouchableOpacity
                key={filter.key}
                onPress={() => toggleTypeFilter(filter.key)}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {active ? `OK ${filter.label}` : filter.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {selectedTypeFilters.length > 0 ? (
          <TouchableOpacity onPress={() => setSelectedTypeFilters([])} style={styles.clearFiltersButton}>
            <Text style={styles.clearFiltersText}>Clear Filters</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <FlatList
        data={filteredItems}
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
            <Text style={styles.emptyText}>
              {selectedTypeFilters.length > 0 ? "No signs match selected type filters." : "No signs in range."}
            </Text>
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
  filterTitle: { marginTop: 12, fontWeight: "900" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  chip: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: { fontWeight: "800", color: "#111827" },
  chipTextActive: { color: "white" },
  clearFiltersButton: {
    marginTop: 2,
    alignSelf: "flex-start",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: "#f3f4f6",
  },
  clearFiltersText: { color: "#111827", fontWeight: "800" },
  listContent: { paddingHorizontal: 16, paddingVertical: 10 },
  listItem: { paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#eee" },
  listTitle: { fontWeight: "900" },
  listSubtitle: { marginTop: 4, color: "#666" },
  emptyState: { paddingTop: 14 },
  emptyContainer: { flex: 1, padding: 16, justifyContent: "center" },
  emptyTitle: { fontWeight: "900", fontSize: 16 },
  emptyText: { marginTop: 8, color: "#666" },
});
