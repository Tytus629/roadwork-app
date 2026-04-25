import React, { useMemo, useState } from "react";
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
import { createVehicleAsset } from "../api/vehicleMaintenance";
import { useOrg } from "../state/OrgContext";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";
import type { VehicleAssetStatus } from "../types/VehicleAsset";

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

export default function VehicleAssetCreateScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const canEdit = hasRolePermission("editVehicleAssets", role);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();

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
  const [saving, setSaving] = useState(false);

  const canSave = useMemo(() => unitNumber.trim().length > 0 && !saving, [saving, unitNumber]);

  async function onSave() {
    if (!canEdit) {
      Alert.alert("Permission denied", permissionDeniedMessage("editVehicleAssets"));
      return;
    }
    if (!orgId) {
      Alert.alert("Missing organization", "Select an organization before creating vehicle assets.");
      return;
    }
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
      const asset = await createVehicleAsset({
        orgId,
        asset: {
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

      navigation.replace("VehicleAssetDetail", { vehicleAssetId: asset.id });
    } catch (err: any) {
      Alert.alert("Save failed", err?.message ?? "Unable to create vehicle asset.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom + 24 }}
    >
      <Text style={styles.title}>New Vehicle Asset</Text>
      <Text style={styles.subtitle}>Create a fleet record used in vehicle-maintenance workflows.</Text>

      <Field label="Unit Number" required>
        <TextInput value={unitNumber} onChangeText={setUnitNumber} style={styles.input} placeholder="Unit 204" />
      </Field>

      <Field label="Truck / Secondary ID">
        <TextInput value={truckNumber} onChangeText={setTruckNumber} style={styles.input} placeholder="Truck 12" />
      </Field>

      <RowFields>
        <Field label="Make">
          <TextInput value={make} onChangeText={setMake} style={styles.input} placeholder="Ford" />
        </Field>
        <Field label="Model">
          <TextInput value={model} onChangeText={setModel} style={styles.input} placeholder="F-550" />
        </Field>
      </RowFields>

      <RowFields>
        <Field label="Year">
          <TextInput value={year} onChangeText={setYear} style={styles.input} keyboardType="number-pad" placeholder="2022" />
        </Field>
        <Field label="Status">
          <View style={styles.statusWrap}>
            {STATUSES.map((candidate) => {
              const selected = candidate === status;
              return (
                <TouchableOpacity
                  key={candidate}
                  style={[styles.statusPill, selected && styles.statusPillActive]}
                  onPress={() => setStatus(candidate)}
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
        <TextInput value={vin} onChangeText={setVin} style={styles.input} autoCapitalize="characters" />
      </Field>

      <RowFields>
        <Field label="Serial Number">
          <TextInput value={serialNumber} onChangeText={setSerialNumber} style={styles.input} />
        </Field>
        <Field label="License Plate">
          <TextInput value={licensePlate} onChangeText={setLicensePlate} style={styles.input} autoCapitalize="characters" />
        </Field>
      </RowFields>

      <RowFields>
        <Field label="In-Service Date">
          <TextInput
            value={inServiceDate}
            onChangeText={setInServiceDate}
            style={styles.input}
            placeholder="2026-04-20"
          />
        </Field>
        <Field label="Odometer">
          <TextInput
            value={odometer}
            onChangeText={setOdometer}
            style={styles.input}
            keyboardType="numeric"
            placeholder="128450"
          />
        </Field>
      </RowFields>

      <Field label="Engine Hours">
        <TextInput
          value={engineHours}
          onChangeText={setEngineHours}
          style={styles.input}
          keyboardType="numeric"
          placeholder="1840"
        />
      </Field>

      <Field label="Notes">
        <TextInput
          value={notes}
          onChangeText={setNotes}
          style={[styles.input, styles.notesInput]}
          multiline
          textAlignVertical="top"
          placeholder="Optional service notes, assignment context, or caveats"
        />
      </Field>

      <TouchableOpacity
        style={[styles.saveBtn, !canSave && styles.saveBtnDisabled]}
        onPress={onSave}
        disabled={!canSave}
      >
        <Text style={styles.saveText}>{saving ? "Saving..." : "Create Vehicle Asset"}</Text>
      </TouchableOpacity>
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
  title: { marginTop: 16, fontSize: 22, fontWeight: "700", color: "#0f172a" },
  subtitle: { marginTop: 6, marginBottom: 14, color: "#64748b", fontSize: 13 },
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
});
