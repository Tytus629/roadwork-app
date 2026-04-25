import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { listVehicleAssets } from "../api/vehicleMaintenance";
import type { VehicleAsset } from "../types/VehicleAsset";
import { useOrg } from "../state/OrgContext";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";

type StatusFilter = "all" | "active" | "in_service" | "out_of_service" | "retired";

const FILTERS: Array<{ key: StatusFilter; label: string }> = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "in_service", label: "In Service" },
  { key: "out_of_service", label: "Out of Service" },
  { key: "retired", label: "Retired" },
];

function assetPrimaryLabel(asset: VehicleAsset): string {
  const parts = [asset.unitNumber, asset.truckNumber].filter(Boolean);
  return parts.join(" / ") || "Vehicle Asset";
}

function assetMeta(asset: VehicleAsset): string {
  const bits = [
    [asset.make, asset.model].filter(Boolean).join(" "),
    asset.year != null ? String(asset.year) : null,
    asset.licensePlate,
    asset.vin,
  ].filter(Boolean);
  return bits.join(" • ");
}

export default function VehicleAssetsListScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const canView = hasRolePermission("viewVehicleAssets", role);
  const canEdit = hasRolePermission("editVehicleAssets", role);

  const [assets, setAssets] = useState<VehicleAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const load = useCallback(async () => {
    if (!orgId || !canView) return;
    setLoading(true);
    setError(null);
    try {
      const next = await listVehicleAssets({
        orgId,
        limit: 300,
        statuses: statusFilter === "all" ? undefined : [statusFilter],
      });
      setAssets(next);
    } catch (err: any) {
      setError(err?.message ?? "Failed to load vehicle assets.");
    } finally {
      setLoading(false);
    }
  }, [canView, orgId, statusFilter]);

  useEffect(() => {
    const unsub = navigation.addListener("focus", load);
    load();
    return unsub;
  }, [load, navigation]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return assets;
    return assets.filter((asset) => {
      const haystack = [
        asset.unitNumber,
        asset.truckNumber,
        asset.make,
        asset.model,
        asset.licensePlate,
        asset.vin,
        asset.serialNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [assets, query]);

  if (!canView) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyTitle}>Vehicle assets are restricted</Text>
        <Text style={styles.emptyHint}>{permissionDeniedMessage("viewVehicleAssets")}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Vehicle Assets</Text>
          <Text style={styles.subtitle}>Fleet records for mechanic and maintenance workflows.</Text>
        </View>
        {canEdit ? (
          <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate("VehicleAssetCreate")}>
            <Text style={styles.newBtnText}>+ New</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search by unit, make/model, plate, VIN"
          style={styles.searchInput}
        />
      </View>

      <FlatList
        horizontal
        data={FILTERS}
        keyExtractor={(item) => item.key}
        contentContainerStyle={styles.filterRow}
        showsHorizontalScrollIndicator={false}
        renderItem={({ item }) => {
          const selected = item.key === statusFilter;
          return (
            <TouchableOpacity
              style={[styles.filterPill, selected && styles.filterPillActive]}
              onPress={() => setStatusFilter(item.key)}
            >
              <Text style={[styles.filterPillText, selected && styles.filterPillTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          );
        }}
      />

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator />
          <Text style={styles.loadingText}>Loading vehicle assets...</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={load}>
            <Text style={styles.retryText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>No vehicle assets found</Text>
          <Text style={styles.emptyHint}>
            {query.trim() ? "Try a different search." : "Create the first vehicle asset for this organization."}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 24 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.row}
              onPress={() => navigation.navigate("VehicleAssetDetail", { vehicleAssetId: item.id })}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{assetPrimaryLabel(item)}</Text>
                <View style={styles.statusBadge}>
                  <Text style={styles.statusText}>{(item.status ?? "unknown").replace(/_/g, " ")}</Text>
                </View>
              </View>
              <Text style={styles.rowMeta}>{assetMeta(item) || "No additional metadata"}</Text>
            </TouchableOpacity>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff" },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    flexDirection: "row",
    gap: 12,
  },
  title: { fontSize: 20, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 4, fontSize: 13, color: "#64748b" },
  newBtn: {
    backgroundColor: "#111827",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  newBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
  searchWrap: { paddingHorizontal: 16, paddingTop: 12 },
  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
  },
  filterRow: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterPill: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: "#fff",
  },
  filterPillActive: {
    backgroundColor: "#e2e8f0",
    borderColor: "#94a3b8",
  },
  filterPillText: { color: "#334155", fontSize: 12, fontWeight: "600" },
  filterPillTextActive: { color: "#0f172a" },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  loadingText: { marginTop: 10, color: "#64748b" },
  errorText: { color: "#b91c1c", textAlign: "center" },
  retryBtn: {
    marginTop: 12,
    borderWidth: 1,
    borderColor: "#0f172a",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryText: { color: "#0f172a", fontWeight: "700" },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: "#334155", textAlign: "center" },
  emptyHint: { marginTop: 6, color: "#64748b", textAlign: "center" },
  row: {
    marginHorizontal: 16,
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    backgroundColor: "#fff",
  },
  rowTop: { flexDirection: "row", alignItems: "center" },
  rowTitle: { flex: 1, fontSize: 15, fontWeight: "700", color: "#0f172a", paddingRight: 8 },
  statusBadge: {
    backgroundColor: "#f1f5f9",
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
  },
  statusText: { fontSize: 11, fontWeight: "700", color: "#334155" },
  rowMeta: { marginTop: 5, fontSize: 13, color: "#64748b" },
});
