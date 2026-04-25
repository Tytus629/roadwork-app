import React, { useEffect, useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import Geolocation from "@react-native-community/geolocation";
import AssetBadge from "../components/AssetBadge";
import { requestLocationPermission } from "../native/location";
import { useAssetsNear } from "../hooks/useAssetsNear";
import { useOrg } from "../state/OrgContext";
import type { Asset } from "../types/Asset";
import { normalizeSignEntries } from "../utils/signAssetDetails";
import { getSignLabelById } from "../utils/signTypeLookup";
import { getAssetLayerKind } from "../utils/assetLayer";
import { assetTypeSortOrder, getAssetTypeLabel, type AssetTypeKey } from "../utils/assetTypes";

function resolveAssetFilterType(asset: Asset): AssetTypeKey {
  const layer = getAssetLayerKind(asset);
  if (layer === "delineator") return "sign";
  if (layer === "bridge") return "bridge";
  if (layer === "culvert") return "culvert";
  if (layer === "guardrail") return "guardrail";
  return "sign";
}

function getAssetTitle(asset: Asset): string {
  const assetType = resolveAssetFilterType(asset);
  if (assetType === "sign") {
    const signEntries = normalizeSignEntries((asset.details as Record<string, any> | null) ?? null);
    const first = signEntries[0] ?? null;
    const byLookup = getSignLabelById(first?.signTypeId ?? asset.subtype ?? null);
    return first?.signLabel || byLookup || asset.subtype || "Sign";
  }
  if (asset.subtype) return asset.subtype;
  return getAssetTypeLabel(assetType);
}

function getAssetSubtitle(asset: Asset): string {
  const typeLabel = getAssetTypeLabel(resolveAssetFilterType(asset));
  const updated = asset.updatedAt ? new Date(asset.updatedAt).toLocaleDateString() : "Unknown";
  return `${typeLabel} • ${asset.status} • Updated ${updated}`;
}

type Props = {
  selectedTypes: AssetTypeKey[];
};

export default function AssetsNearScreen({ selectedTypes }: Props) {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
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
        { enableHighAccuracy: true, distanceFilter: 10, interval: 5000 } as any,
      );
    })();

    return () => {
      if (watchId != null) Geolocation.clearWatch(watchId);
    };
  }, []);

  const items = useAssetsNear(myLoc?.lat ?? null, myLoc?.lng ?? null, radiusMiles, orgId);

  const filteredItems = useMemo(() => {
    const selected = new Set(selectedTypes);
    return items
      .filter((asset) => selected.has(resolveAssetFilterType(asset)))
      .sort((left, right) => {
        const typeOrder = assetTypeSortOrder(resolveAssetFilterType(left)) - assetTypeSortOrder(resolveAssetFilterType(right));
        if (typeOrder !== 0) return typeOrder;
        return (right.updatedAt ?? 0) - (left.updatedAt ?? 0);
      });
  }, [items, selectedTypes]);

  if (!myLoc) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>Location unavailable</Text>
        <Text style={styles.emptyText}>Enable GPS to see nearby assets.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Near Me</Text>
        <Text style={styles.subtitle}>{filteredItems.length} asset(s) in ~{radiusMiles} miles</Text>

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
        data={filteredItems}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => navigation.navigate("AssetDetail", { assetId: item.id })}
            style={styles.card}
          >
            <AssetBadge asset={item} />
            <View style={styles.cardBody}>
              <Text style={styles.cardTitle}>{getAssetTitle(item)}</Text>
              <Text style={styles.cardSubtitle}>{getAssetSubtitle(item)}</Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No assets match the selected type filters in this range.</Text>
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
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  cardBody: { flex: 1, gap: 4 },
  cardTitle: { fontWeight: "900", color: "#111827" },
  cardSubtitle: { color: "#666" },
  emptyState: { paddingTop: 14 },
  emptyContainer: { flex: 1, padding: 16, justifyContent: "center" },
  emptyTitle: { fontWeight: "900", fontSize: 16 },
  emptyText: { marginTop: 8, color: "#666" },
});