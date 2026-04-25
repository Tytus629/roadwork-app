import React, { useMemo, useState } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import AssetBadge from "../components/AssetBadge";
import { useAssetsDue } from "../hooks/useAssetsDue";
import { useOrg } from "../state/OrgContext";
import type { Asset } from "../types/Asset";
import { normalizeSignEntries } from "../utils/signAssetDetails";
import { getSignLabelById } from "../utils/signTypeLookup";
import { getAssetLayerKind } from "../utils/assetLayer";
import { assetTypeSortOrder, getAssetTypeLabel, type AssetTypeKey } from "../utils/assetTypes";
import type { AssetInspectionDueMode } from "../repositories/assetsRepo";

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

function getLastInspectionLabel(asset: Asset): string {
  if (typeof asset.lastInspectionAt === "number" && Number.isFinite(asset.lastInspectionAt)) {
    return new Date(asset.lastInspectionAt).toLocaleDateString();
  }
  return "Never";
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{active ? `OK ${label}` : label}</Text>
    </TouchableOpacity>
  );
}

type Props = {
  selectedTypes?: AssetTypeKey[];
};

export default function AssetsDueScreen({ selectedTypes = ["sign", "culvert", "guardrail", "bridge"] }: Props) {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
  const [mode, setMode] = useState<AssetInspectionDueMode>("overdue_default");
  const items = useAssetsDue(mode, orgId);

  const filteredItems = useMemo(() => {
    const selected = new Set(selectedTypes);
    return items
      .filter((asset) => selected.has(resolveAssetFilterType(asset)))
      .sort((left, right) => {
        const typeOrder = assetTypeSortOrder(resolveAssetFilterType(left)) - assetTypeSortOrder(resolveAssetFilterType(right));
        if (typeOrder !== 0) return typeOrder;
        const leftInspection = left.lastInspectionAt ?? 0;
        const rightInspection = right.lastInspectionAt ?? 0;
        return leftInspection - rightInspection;
      });
  }, [items, selectedTypes]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Inspection</Text>
        <Text style={styles.subtitle}>{filteredItems.length} asset(s) need review</Text>

        <Text style={styles.filterTitle}>Window</Text>
        <View style={styles.chipRow}>
          <Chip label="Overdue (2y)" active={mode === "overdue_default"} onPress={() => setMode("overdue_default")} />
          <Chip label="Overdue 30d" active={mode === "overdue_30d"} onPress={() => setMode("overdue_30d")} />
          <Chip label="Overdue 1y" active={mode === "overdue_1y"} onPress={() => setMode("overdue_1y")} />
          <Chip label="Overdue 5y" active={mode === "overdue_5y"} onPress={() => setMode("overdue_5y")} />
          <Chip label="Never inspected" active={mode === "never_inspected"} onPress={() => setMode("never_inspected")} />
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
              <Text style={styles.cardSubtitle}>
                {getAssetTypeLabel(resolveAssetFilterType(item))} • Last inspected: {getLastInspectionLabel(item)}
              </Text>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No assets match the selected type filters for this inspection window.</Text>
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
  filterTitle: { marginTop: 12, fontWeight: "900" },
  chipRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 10 },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#d1d5db",
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: { fontWeight: "700", fontSize: 13, color: "#374151" },
  chipTextActive: { color: "white" },
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
  emptyText: { color: "#666" },
});