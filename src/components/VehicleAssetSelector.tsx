import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { listVehicleAssets } from "../api/vehicleMaintenance";
import type { MaintenanceSlipVehicleSnapshot } from "../types/MaintenanceSlip";
import type { VehicleAsset } from "../types/VehicleAsset";
import { describeVehicleSnapshot, vehicleSnapshotFromAsset } from "../utils/vehicleMaintenance";

function describeAssetMeta(asset: VehicleAsset): string {
  const parts = [
    asset.make,
    asset.model,
    asset.year != null ? String(asset.year) : null,
    asset.licensePlate,
    asset.status ? String(asset.status).replace(/_/g, " ") : null,
  ].filter(Boolean);
  return parts.join(" • ");
}

export default function VehicleAssetSelector({
  orgId,
  editable,
  selectedAssetId,
  selectedSnapshot,
  onSelect,
  onClear,
}: {
  orgId: string | null;
  editable: boolean;
  selectedAssetId: string | null;
  selectedSnapshot: MaintenanceSlipVehicleSnapshot | null;
  onSelect: (asset: VehicleAsset) => void;
  onClear: () => void;
}) {
  const [assets, setAssets] = useState<VehicleAsset[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!orgId || !editable) return;

    setLoading(true);
    setError(null);
    listVehicleAssets({ orgId, limit: 150 })
      .then((rows) => {
        if (!cancelled) setAssets(rows);
      })
      .catch((err: any) => {
        if (!cancelled) {
          setError(err?.message ?? "Unable to load vehicle assets.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [editable, orgId]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const rows = needle
      ? assets.filter((asset) => {
          const haystack = [
            asset.unitNumber,
            asset.truckNumber,
            asset.make,
            asset.model,
            asset.licensePlate,
            asset.vin,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(needle);
        })
      : assets;
    return rows.slice(0, 10);
  }, [assets, query]);

  const linkedLabel = describeVehicleSnapshot(selectedSnapshot);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>Select Existing Vehicle Asset</Text>
      <Text style={styles.helper}>
        Pick a vehicle from this org to auto-fill the slip snapshot, or leave it unlinked and use manual entry.
      </Text>

      {selectedAssetId ? (
        <View style={styles.selectedCard}>
          <Text style={styles.selectedTitle}>{linkedLabel}</Text>
          <Text style={styles.selectedMeta}>Linked to org vehicle asset</Text>
          {editable ? (
            <View style={styles.actionRow}>
              <TouchableOpacity onPress={() => setExpanded((value) => !value)} style={styles.secondaryBtn}>
                <Text style={styles.secondaryBtnText}>{expanded ? "Hide Asset Search" : "Change Asset"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onClear} style={styles.ghostBtn}>
                <Text style={styles.ghostBtnText}>Clear Link, Keep Snapshot</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      ) : null}

      {editable ? (
        <View style={styles.searchBlock}>
          {!selectedAssetId ? (
            <TouchableOpacity onPress={() => setExpanded((value) => !value)} style={styles.secondaryBtn}>
              <Text style={styles.secondaryBtnText}>{expanded ? "Hide Asset Search" : "Browse Org Vehicle Assets"}</Text>
            </TouchableOpacity>
          ) : null}

          {expanded || !selectedAssetId ? (
            <>
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search by unit, truck number, make, model, or plate"
                style={styles.input}
              />
              {loading ? <ActivityIndicator style={styles.loading} /> : null}
              {error ? <Text style={styles.error}>{error}</Text> : null}
              {!loading && !error && filtered.length === 0 ? (
                <Text style={styles.empty}>No matching vehicle assets. Manual entry stays available.</Text>
              ) : null}
              {filtered.map((asset) => {
                const snapshot = vehicleSnapshotFromAsset(asset);
                return (
                  <TouchableOpacity
                    key={asset.id}
                    onPress={() => {
                      onSelect(asset);
                      setExpanded(false);
                      setQuery("");
                    }}
                    style={styles.resultCard}
                  >
                    <Text style={styles.resultTitle}>{describeVehicleSnapshot(snapshot)}</Text>
                    <Text style={styles.resultMeta}>{describeAssetMeta(asset) || "Vehicle asset"}</Text>
                  </TouchableOpacity>
                );
              })}
            </>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: 10 },
  label: { marginBottom: 6, fontSize: 15, fontWeight: "700", color: "#111827" },
  helper: { color: "#64748b", fontSize: 13, lineHeight: 18 },
  selectedCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#bfdbfe",
    backgroundColor: "#eff6ff",
    padding: 12,
  },
  selectedTitle: { fontSize: 15, fontWeight: "700", color: "#0f172a" },
  selectedMeta: { marginTop: 4, color: "#1d4ed8", fontSize: 13 },
  actionRow: { marginTop: 10, gap: 8 },
  searchBlock: { marginTop: 12 },
  input: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  loading: { marginTop: 12 },
  error: { marginTop: 10, color: "#b91c1c" },
  empty: { marginTop: 10, color: "#64748b" },
  resultCard: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "#fff",
  },
  resultTitle: { fontSize: 14, fontWeight: "700", color: "#111827" },
  resultMeta: { marginTop: 4, color: "#64748b", fontSize: 13 },
  secondaryBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111827",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: "#111827", fontWeight: "700" },
  ghostBtn: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    paddingVertical: 10,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  ghostBtnText: { color: "#334155", fontWeight: "600" },
});