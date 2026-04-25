import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getVehicleAssetDetail, updateVehicleAsset } from "../api/vehicleMaintenance";
import type { VehicleAsset, VehicleAssetStatus } from "../types/VehicleAsset";
import { useOrg } from "../state/OrgContext";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";

const STATUSES: VehicleAssetStatus[] = ["active", "in_service", "out_of_service", "retired"];

function cleanString(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function toNumberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatDateInput(value: number | null): string {
  if (value == null) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function VehicleAssetDetailScreen({ route }: any) {
  const { vehicleAssetId } = route.params as { vehicleAssetId: string };
  const { orgId, role } = useOrg();
  const canView = hasRolePermission("viewVehicleAssets", role);
  const canEdit = hasRolePermission("editVehicleAssets", role);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

  const [asset, setAsset] = useState<VehicleAsset | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const [unitNumber, setUnitNumber] = useState("");
  const [truckNumber, setTruckNumber] = useState("");
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [inServiceDate, setInServiceDate] = useState("");
  const [status, setStatus] = useState<VehicleAssetStatus>("active");
  const [odometer, setOdometer] = useState("");
  const [engineHours, setEngineHours] = useState("");
  const [notes, setNotes] = useState("");

  const hydrate = useCallback((next: VehicleAsset) => {
    setAsset(next);
    setUnitNumber(next.unitNumber ?? "");
    setTruckNumber(next.truckNumber ?? "");
    setMake(next.make ?? "");
    setModel(next.model ?? "");
    setYear(next.year != null ? String(next.year) : "");
    setVin(next.vin ?? "");
    setSerialNumber(next.serialNumber ?? "");
    setLicensePlate(next.licensePlate ?? "");
    setInServiceDate(formatDateInput(next.inServiceDate));
    setStatus((next.status ?? "active") as VehicleAssetStatus);
    setOdometer(next.odometer != null ? String(next.odometer) : "");
    setEngineHours(next.engineHours != null ? String(next.engineHours) : "");
    setNotes(next.notes ?? "");
  }, []);

  const load = useCallback(async () => {
    if (!orgId || !vehicleAssetId || !canView) return;
    setLoading(true);
    try {
      const detail = await getVehicleAssetDetail({ orgId, vehicleAssetId });
      hydrate(detail);
    } catch (err: any) {
      Alert.alert("Load failed", err?.message ?? "Unable to load vehicle asset.");
    } finally {
      setLoading(false);
    }
  }, [canView, hydrate, orgId, vehicleAssetId]);

  useEffect(() => {
    load();
  }, [load]);

  const canSave = useMemo(() => canEdit && unitNumber.trim().length > 0 && !saving, [canEdit, saving, unitNumber]);

  async function onSave() {
    if (!canEdit) {
      Alert.alert("Permission denied", permissionDeniedMessage("editVehicleAssets"));
      return;
    }
    if (!orgId || !vehicleAssetId) return;
    if (!unitNumber.trim()) {
      Alert.alert("Missing unit", "Unit number is required.");
      return;
    }

    const yearNum = toNumberOrNull(year);
    if (year.trim() && yearNum == null) {
      Alert.alert("Invalid year", "Year must be numeric.");
      return;
    }
    const odometerNum = toNumberOrNull(odometer);
    if (odometer.trim() && odometerNum == null) {
      Alert.alert("Invalid odometer", "Odometer must be numeric.");
      return;
    }
    const engineHoursNum = toNumberOrNull(engineHours);
    if (engineHours.trim() && engineHoursNum == null) {
      Alert.alert("Invalid engine hours", "Engine hours must be numeric.");
      return;
    }

    const inServiceTs = inServiceDate.trim() ? Date.parse(inServiceDate.trim()) : null;
    if (inServiceDate.trim() && Number.isNaN(inServiceTs ?? NaN)) {
      Alert.alert("Invalid in-service date", "Use a valid date such as 2026-04-20.");
      return;
    }

    setSaving(true);
    try {
      const updated = await updateVehicleAsset({
        orgId,
        vehicleAssetId,
        patch: {
          unitNumber: unitNumber.trim(),
          truckNumber: cleanString(truckNumber),
          make: cleanString(make),
          model: cleanString(model),
          year: yearNum,
          vin: cleanString(vin),
          serialNumber: cleanString(serialNumber),
          licensePlate: cleanString(licensePlate),
          inServiceDate: inServiceTs == null ? null : inServiceTs,
          status,
          odometer: odometerNum,
          engineHours: engineHoursNum,
          notes: cleanString(notes),
        },
      });
      hydrate(updated);
      Alert.alert("Saved", "Vehicle asset updated.");
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Unable to update vehicle asset.");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockedTitle}>Vehicle assets are restricted</Text>
        <Text style={styles.blockedHint}>{permissionDeniedMessage("viewVehicleAssets")}</Text>
      </View>
    );
  }

  if (loading && !asset) {
    return (
      <View style={styles.centered}>
        <Text>Loading vehicle asset...</Text>
      </View>
    );
  }

  if (!asset) {
    return (
      <View style={styles.centered}>
        <Text style={styles.blockedTitle}>Vehicle asset not found</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom + 24 }}
    >
      <Text style={styles.title}>Vehicle Asset</Text>
      <Text style={styles.subtitle}>ID: {asset.id}</Text>

      <Field label="Unit Number" required>
        <TextInput value={unitNumber} onChangeText={setUnitNumber} style={styles.input} editable={canEdit} />
      </Field>

      <Field label="Truck / Secondary ID">
        <TextInput value={truckNumber} onChangeText={setTruckNumber} style={styles.input} editable={canEdit} />
      </Field>

      <RowFields>
        <Field label="Make">
          <TextInput value={make} onChangeText={setMake} style={styles.input} editable={canEdit} />
        </Field>
        <Field label="Model">
          <TextInput value={model} onChangeText={setModel} style={styles.input} editable={canEdit} />
        </Field>
      </RowFields>

      <RowFields>
        <Field label="Year">
          <TextInput value={year} onChangeText={setYear} style={styles.input} keyboardType="number-pad" editable={canEdit} />
        </Field>
        <Field label="Status">
          <View style={styles.statusWrap}>
            {STATUSES.map((candidate) => {
              const selected = candidate === status;
              return (
                <TouchableOpacity
                  key={candidate}
                  style={[styles.statusPill, selected && styles.statusPillActive]}
                  onPress={() => canEdit && setStatus(candidate)}
                  disabled={!canEdit}
                >
                  <Text style={[styles.statusText, selected && styles.statusTextActive]}>
                    {candidate.replace(/_/g, " ")}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Field>
      </RowFields>

      <Field label="VIN">
        <TextInput value={vin} onChangeText={setVin} style={styles.input} editable={canEdit} autoCapitalize="characters" />
      </Field>

      <RowFields>
        <Field label="Serial Number">
          <TextInput value={serialNumber} onChangeText={setSerialNumber} style={styles.input} editable={canEdit} />
        </Field>
        <Field label="License Plate">
          <TextInput value={licensePlate} onChangeText={setLicensePlate} style={styles.input} editable={canEdit} autoCapitalize="characters" />
        </Field>
      </RowFields>

      <RowFields>
        <Field label="In-Service Date">
          <TextInput
            value={inServiceDate}
            onChangeText={setInServiceDate}
            style={styles.input}
            editable={canEdit}
            placeholder="2026-04-20"
          />
        </Field>
        <Field label="Odometer">
          <TextInput value={odometer} onChangeText={setOdometer} style={styles.input} keyboardType="numeric" editable={canEdit} />
        </Field>
      </RowFields>

      <Field label="Engine Hours">
        <TextInput value={engineHours} onChangeText={setEngineHours} style={styles.input} keyboardType="numeric" editable={canEdit} />
      </Field>

      <Field label="Notes">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notesInput]}
          editable={canEdit}
          multiline
          textAlignVertical="top"
        />
      </Field>

      {canEdit ? (
        <TouchableOpacity style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]} onPress={onSave} disabled={!canSave}>
          <Text style={styles.saveText}>{saving ? "Saving..." : "Save Changes"}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.readOnlyNote}>Read-only: {permissionDeniedMessage("editVehicleAssets")}</Text>
      )}
    </ScrollView>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? " *" : ""}
      </Text>
      {children}
    </View>
  );
}

function RowFields({ children }: { children: React.ReactNode }) {
  return <View style={styles.row}>{children}</View>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", paddingHorizontal: 16 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  blockedTitle: { fontSize: 16, fontWeight: "700", color: "#334155", textAlign: "center" },
  blockedHint: { marginTop: 6, color: "#64748b", textAlign: "center" },
  title: { marginTop: 16, fontSize: 22, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 4, marginBottom: 14, color: "#64748b", fontSize: 12 },
  row: { flexDirection: "row", gap: 10 },
  field: { marginBottom: 12, flex: 1 },
  label: { marginBottom: 6, fontSize: 13, color: "#334155", fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    backgroundColor: "#fff",
  },
  notesInput: { minHeight: 96 },
  statusWrap: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  statusPill: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  statusPillActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  statusText: { fontSize: 12, color: "#334155", fontWeight: "600" },
  statusTextActive: { color: "#fff" },
  saveBtn: {
    marginTop: 12,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: "#111827",
    paddingVertical: 13,
    alignItems: "center",
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  readOnlyNote: { marginTop: 10, color: "#64748b" },
});
