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
import VehicleAssetSelector from "../components/VehicleAssetSelector";
import { useOrg } from "../state/OrgContext";
import { makeClientId } from "../repositories/repoUtils";
import { maintenanceSlipService } from "../services/maintenanceSlipService";
import {
  MAINTENANCE_SLIP_SEVERITIES,
  formatMaintenanceSlipSeverity,
  type MaintenanceSlipRequestType,
  type MaintenanceSlipSeverity,
  type MaintenanceSlipVehicleSnapshot,
} from "../types/MaintenanceSlip";
import type { VehicleAsset } from "../types/VehicleAsset";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";
import {
  buildMaintenanceReadingLabel,
  buildMaintenanceUnitLabel,
  defaultServiceRequest,
  describeVehicleSnapshot,
  formatDateInput,
  parseDateInputToEpoch,
  normalizeVehicleSnapshot,
  vehicleSnapshotFromAsset,
} from "../utils/vehicleMaintenance";

const REQUEST_TYPES: MaintenanceSlipRequestType[] = [
  "inspection",
  "service",
  "repair",
  "breakdown",
  "other",
];

export default function MaintenanceSlipCreateScreen({ navigation }: any) {
  const { orgId, role } = useOrg();
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const canCreate = hasRolePermission("createMaintenanceSlip", role);

  const [vehicleAssetId, setVehicleAssetId] = useState<string | null>(null);
  const [vehicleSnapshot, setVehicleSnapshot] = useState<MaintenanceSlipVehicleSnapshot | null>(null);
  const [equipmentType, setEquipmentType] = useState("");
  const [maintenanceCategory, setMaintenanceCategory] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState<MaintenanceSlipSeverity>("medium");
  const [requestType, setRequestType] = useState<MaintenanceSlipRequestType>("repair");
  const [requestedService, setRequestedService] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [preferredServiceDate, setPreferredServiceDate] = useState("");
  const [safetySensitive, setSafetySensitive] = useState<boolean | null>(null);
  const [vehicleOutOfService, setVehicleOutOfService] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  const linkedAsset = Boolean(vehicleAssetId);
  const normalizedSnapshot = useMemo(() => normalizeVehicleSnapshot(vehicleSnapshot), [vehicleSnapshot]);

  function patchSnapshot(patch: Partial<MaintenanceSlipVehicleSnapshot>) {
    setVehicleSnapshot((current) => ({
      unitNumber: current?.unitNumber ?? null,
      truckNumber: current?.truckNumber ?? null,
      make: current?.make ?? null,
      model: current?.model ?? null,
      year: current?.year ?? null,
      status: current?.status ?? null,
      odometer: current?.odometer ?? null,
      engineHours: current?.engineHours ?? null,
      vin: current?.vin ?? null,
      serialNumber: current?.serialNumber ?? null,
      licensePlate: current?.licensePlate ?? null,
      ...patch,
    }));
  }

  function applyAsset(asset: VehicleAsset) {
    setVehicleAssetId(asset.id);
    setVehicleSnapshot(vehicleSnapshotFromAsset(asset));
    setEquipmentType((current) => current || "vehicle");
  }

  function clearLinkedAsset() {
    setVehicleAssetId(null);
  }

  async function save() {
    if (!canCreate) {
      Alert.alert("Permission denied", permissionDeniedMessage("createMaintenanceSlip"));
      return;
    }
    if (!orgId) {
      Alert.alert("Missing organization", "Join or select an organization before creating a slip.");
      return;
    }
    if (!issueTitle.trim()) {
      Alert.alert("Missing summary", "A short problem summary is required.");
      return;
    }

    const snapshot = normalizeVehicleSnapshot(vehicleSnapshot);
    const unitLabel = buildMaintenanceUnitLabel(snapshot, null);
    if (!vehicleAssetId && (!snapshot || unitLabel === "Vehicle")) {
      Alert.alert("Missing vehicle", "Select an existing vehicle asset or enter manual vehicle details.");
      return;
    }

    const preferredServiceDateMs = parseDateInputToEpoch(preferredServiceDate);
    if (preferredServiceDate.trim() && preferredServiceDateMs == null) {
      Alert.alert("Invalid date", "Preferred service date must be a valid date like 2026-04-19.");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const now = Date.now();
      const readingLabel = buildMaintenanceReadingLabel(snapshot);
      const slip = await maintenanceSlipService.createAndEnqueue({
        id: makeClientId("maintenance"),
        orgId,
        vehicleAssetId,
        vehicleSource: vehicleAssetId ? "linked_asset" : "manual_entry",
        vehicleSnapshot: snapshot,
        unitLabel,
        equipmentType: equipmentType.trim() || null,
        maintenanceCategory: maintenanceCategory.trim() || null,
        systemArea: maintenanceCategory.trim() || null,
        issueTitle: issueTitle.trim(),
        issueDescription: issueDescription.trim() || null,
        locationHint: locationHint.trim() || null,
        readingLabel,
        preferredServiceDate: preferredServiceDateMs,
        serviceRequest: defaultServiceRequest({
          requestType,
          requestedService,
          complaint: issueDescription,
          reportedLocation: locationHint,
          safetySensitive,
          vehicleOutOfService,
          reportedOdometer: snapshot?.odometer ?? null,
          reportedEngineHours: snapshot?.engineHours ?? null,
        }),
        status: "open",
        severity,
        createdAt: now,
        updatedAt: now,
        assignedToUid: null,
        assignedToName: null,
        assignedToEmail: null,
        notes: [],
        lastStatusChangedAt: now,
        lastStatusChangedByUid: null,
        lastStatusChangedByDisplayName: null,
        lastStatusChangedByEmail: null,
        resolvedAt: null,
        resolvedByUid: null,
        resolvedByDisplayName: null,
        resolvedByEmail: null,
      });
      navigation.replace("MaintenanceSlipDetail", { id: slip.id });
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom + 28 }}
    >
      <Text style={styles.title}>New Vehicle Maintenance Slip</Text>
      <Text style={styles.subtitle}>RTA-style request flow for fleet, shop, and mechanic work without crossing into road work orders.</Text>

      <Section title="1. Vehicle" subtitle="Link an existing org vehicle asset first, or continue with manual vehicle entry.">
        <VehicleAssetSelector
          orgId={orgId}
          editable={canCreate}
          selectedAssetId={vehicleAssetId}
          selectedSnapshot={normalizedSnapshot}
          onSelect={applyAsset}
          onClear={clearLinkedAsset}
        />
        <InfoBanner kind={linkedAsset ? "linked" : "manual"}>
          {linkedAsset
            ? "Vehicle fields are auto-filled from the selected asset. Clear the link if this request should become a manual entry."
            : "No vehicle asset linked. Manual vehicle details entered below will travel with the slip snapshot."}
        </InfoBanner>

        <Field label="Unit / Truck Number" required>
          <TextInput
            value={normalizedSnapshot?.unitNumber ?? ""}
            onChangeText={(value) => patchSnapshot({ unitNumber: value || null })}
            editable={canCreate && !linkedAsset}
            placeholder="Unit 204 / Truck 12"
            style={[styles.input, linkedAsset && styles.readOnlyInput]}
          />
        </Field>

        <Field label="Secondary Vehicle ID">
          <TextInput
            value={normalizedSnapshot?.truckNumber ?? ""}
            onChangeText={(value) => patchSnapshot({ truckNumber: value || null })}
            editable={canCreate && !linkedAsset}
            placeholder="Fleet number, trailer number, or alternate unit"
            style={[styles.input, linkedAsset && styles.readOnlyInput]}
          />
        </Field>

        <RowFields>
          <Field label="Make">
            <TextInput
              value={normalizedSnapshot?.make ?? ""}
              onChangeText={(value) => patchSnapshot({ make: value || null })}
              editable={canCreate && !linkedAsset}
              placeholder="Ford"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={normalizedSnapshot?.model ?? ""}
              onChangeText={(value) => patchSnapshot({ model: value || null })}
              editable={canCreate && !linkedAsset}
              placeholder="F-550"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>

        <RowFields>
          <Field label="Year">
            <TextInput
              value={normalizedSnapshot?.year != null ? String(normalizedSnapshot.year) : ""}
              onChangeText={(value) => patchSnapshot({ year: value ? Number(value) : null })}
              editable={canCreate && !linkedAsset}
              placeholder="2022"
              keyboardType="number-pad"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Vehicle Status">
            <TextInput
              value={normalizedSnapshot?.status ?? ""}
              onChangeText={(value) => patchSnapshot({ status: value || null })}
              editable={canCreate && !linkedAsset}
              placeholder="in_service"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>

        <RowFields>
          <Field label="Odometer">
            <TextInput
              value={normalizedSnapshot?.odometer != null ? String(normalizedSnapshot.odometer) : ""}
              onChangeText={(value) => patchSnapshot({ odometer: value ? Number(value) : null })}
              editable={canCreate && !linkedAsset}
              placeholder="142311"
              keyboardType="numeric"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Engine Hours">
            <TextInput
              value={normalizedSnapshot?.engineHours != null ? String(normalizedSnapshot.engineHours) : ""}
              onChangeText={(value) => patchSnapshot({ engineHours: value ? Number(value) : null })}
              editable={canCreate && !linkedAsset}
              placeholder="4820"
              keyboardType="numeric"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>
      </Section>

      <Section title="2. Problem / Request" subtitle="Capture the complaint in a fleet-service format that mechanics can act on quickly.">
        <Field label="Short Summary" required>
          <TextInput
            value={issueTitle}
            onChangeText={setIssueTitle}
            editable={canCreate}
            placeholder="Brake light out, PTO not engaging, hydraulic leak"
            style={styles.input}
          />
        </Field>

        <Field label="Requested Service">
          <TextInput
            value={requestedService}
            onChangeText={setRequestedService}
            editable={canCreate}
            placeholder="Diagnose warning light, replace mirror, inspect leak"
            style={styles.input}
          />
        </Field>

        <Field label="Detailed Complaint / Notes">
          <TextInput
            value={issueDescription}
            onChangeText={setIssueDescription}
            editable={canCreate}
            placeholder="Describe the symptom, when it happens, and whether the unit should stay in service."
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label="Category">
          <TextInput
            value={maintenanceCategory}
            onChangeText={setMaintenanceCategory}
            editable={canCreate}
            placeholder="Electrical, brakes, hydraulics, body, PM"
            style={styles.input}
          />
        </Field>

        <Field label="Request Type">
          <ChoiceRow
            options={REQUEST_TYPES}
            value={requestType}
            disabled={!canCreate}
            onChange={(value) => setRequestType(value as MaintenanceSlipRequestType)}
            labelFor={(value) => value.replace(/_/g, " ")}
          />
        </Field>

        <Field label="Severity">
          <ChoiceRow
            options={MAINTENANCE_SLIP_SEVERITIES}
            value={severity}
            disabled={!canCreate}
            onChange={(value) => setSeverity(value as MaintenanceSlipSeverity)}
            labelFor={(value) => formatMaintenanceSlipSeverity(value as MaintenanceSlipSeverity)}
          />
        </Field>
      </Section>

      <Section title="3. Request / Workflow" subtitle="Keep the request practical for crews, operators, mechanics, and fleet managers.">
        <Field label="Reported By">
          <TextInput value="You" editable={false} style={[styles.input, styles.readOnlyInput]} />
        </Field>

        <Field label="Created Date">
          <TextInput value={new Date().toLocaleString()} editable={false} style={[styles.input, styles.readOnlyInput]} />
        </Field>

        <Field label="Status">
          <TextInput value="Open" editable={false} style={[styles.input, styles.readOnlyInput]} />
        </Field>

        <Field label="Preferred Service Date">
          <TextInput
            value={preferredServiceDate}
            onChangeText={setPreferredServiceDate}
            editable={canCreate}
            placeholder={formatDateInput(Date.now())}
            style={styles.input}
          />
        </Field>

        <Field label="Location / Context">
          <TextInput
            value={locationHint}
            onChangeText={setLocationHint}
            editable={canCreate}
            placeholder="Shop yard, route shoulder, or operator note"
            style={styles.input}
          />
        </Field>

        <Field label="Safety Sensitive">
          <BooleanChoice value={safetySensitive} onChange={setSafetySensitive} disabled={!canCreate} />
        </Field>

        <Field label="Take Vehicle Out Of Service">
          <BooleanChoice value={vehicleOutOfService} onChange={setVehicleOutOfService} disabled={!canCreate} />
        </Field>
      </Section>

      <Section title="4. Attachments" subtitle="Photo and file uploads can follow the current maintenance contract later without blocking this request flow.">
        <Text style={styles.placeholderText}>No attachment picker was added in this pass. The form keeps space for future repair-history and closeout growth.</Text>
      </Section>

      <TouchableOpacity
        disabled={saving || !canCreate}
        onPress={save}
        style={[styles.saveBtn, (saving || !canCreate) && styles.disabled]}
      >
        <Text style={styles.saveBtnText}>
          {!canCreate ? "Not allowed for this role" : saving ? "Saving…" : "Create Maintenance Slip"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {subtitle ? <Text style={styles.sectionSubtitle}>{subtitle}</Text> : null}
      {children}
    </View>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}{required ? " *" : ""}</Text>
      {children}
    </View>
  );
}

function RowFields({ children }: { children: React.ReactNode }) {
  return <View style={styles.rowFields}>{children}</View>;
}

function ChoiceRow({
  options,
  value,
  disabled,
  onChange,
  labelFor,
}: {
  options: readonly string[];
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  labelFor: (value: string) => string;
}) {
  return (
    <View style={styles.choiceRow}>
      {options.map((option) => {
        const active = option === value;
        return (
          <TouchableOpacity
            key={option}
            disabled={disabled}
            onPress={() => onChange(option)}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
          >
            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
              {labelFor(option)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function BooleanChoice({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  disabled: boolean;
}) {
  return (
    <View style={styles.choiceRow}>
      {[
        { key: "unknown", label: "Not Set", value: null },
        { key: "yes", label: "Yes", value: true },
        { key: "no", label: "No", value: false },
      ].map((option) => {
        const active = option.value === value;
        return (
          <TouchableOpacity
            key={option.key}
            disabled={disabled}
            onPress={() => onChange(option.value as boolean | null)}
            style={[styles.choiceChip, active && styles.choiceChipActive]}
          >
            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function InfoBanner({ kind, children }: { kind: "linked" | "manual"; children: React.ReactNode }) {
  return (
    <View style={[styles.infoBanner, kind === "linked" ? styles.linkedBanner : styles.manualBanner]}>
      <Text style={styles.infoBannerText}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#fff", padding: 16 },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 6, fontSize: 14, color: "#64748b", lineHeight: 20 },
  sectionBlock: { marginTop: 24 },
  sectionTitle: { fontSize: 18, fontWeight: "700", color: "#111827" },
  sectionSubtitle: { marginTop: 4, color: "#64748b", lineHeight: 18 },
  fieldBlock: { marginTop: 16, flex: 1 },
  fieldLabel: { marginBottom: 6, fontSize: 14, fontWeight: "700", color: "#111827" },
  rowFields: { flexDirection: "row", gap: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#111827",
    backgroundColor: "#fff",
  },
  readOnlyInput: { backgroundColor: "#f8fafc", color: "#475569" },
  multiline: { minHeight: 110, textAlignVertical: "top" },
  choiceRow: { flexDirection: "row", flexWrap: "wrap" },
  choiceChip: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  choiceChipActive: { borderColor: "#111827", backgroundColor: "#111827" },
  choiceChipText: { color: "#374151", fontWeight: "600", fontSize: 13, textTransform: "capitalize" },
  choiceChipTextActive: { color: "#fff" },
  infoBanner: {
    marginTop: 12,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  linkedBanner: { backgroundColor: "#eff6ff" },
  manualBanner: { backgroundColor: "#f8fafc" },
  infoBannerText: { color: "#334155", lineHeight: 18 },
  placeholderText: { color: "#64748b", lineHeight: 19 },
  saveBtn: {
    marginTop: 28,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    paddingVertical: 14,
  },
  saveBtnText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
});