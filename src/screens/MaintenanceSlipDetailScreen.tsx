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
import VehicleAssetSelector from "../components/VehicleAssetSelector";
import { useOrg } from "../state/OrgContext";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import { maintenanceSlipsRepo } from "../repositories/maintenanceSlipsRepo";
import { maintenanceSlipService } from "../services/maintenanceSlipService";
import { formatPersonDisplayName } from "../utils/userIdentity";
import {
  MAINTENANCE_SLIP_SEVERITIES,
  MAINTENANCE_SLIP_STATUSES,
  formatMaintenanceSlipSeverity,
  formatMaintenanceSlipStatus,
  type MaintenanceSlip,
  type MaintenanceSlipRequestType,
  type MaintenanceSlipSeverity,
  type MaintenanceSlipStatus,
  type MaintenanceSlipVehicleSnapshot,
} from "../types/MaintenanceSlip";
import type { VehicleAsset } from "../types/VehicleAsset";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";
import {
  buildMaintenanceReadingLabel,
  buildMaintenanceUnitLabel,
  defaultServiceRequest,
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

export default function MaintenanceSlipDetailScreen({ route }: any) {
  const { id } = route.params;
  const { orgId, role } = useOrg();
  const canView = hasRolePermission("viewMaintenanceSlip", role);
  const canEdit = hasRolePermission("editMaintenanceSlip", role);
  const tabBarHeight = useBottomTabBarHeight();
  const insets = useSafeAreaInsets();
  const [dbTick, setDbTick] = useState(0);
  const [slip, setSlip] = useState<MaintenanceSlip | null>(null);
  const [vehicleAssetId, setVehicleAssetId] = useState<string | null>(null);
  const [vehicleSnapshot, setVehicleSnapshot] = useState<MaintenanceSlipVehicleSnapshot | null>(null);
  const [equipmentType, setEquipmentType] = useState("");
  const [maintenanceCategory, setMaintenanceCategory] = useState("");
  const [issueTitle, setIssueTitle] = useState("");
  const [issueDescription, setIssueDescription] = useState("");
  const [severity, setSeverity] = useState<MaintenanceSlipSeverity>("medium");
  const [status, setStatus] = useState<MaintenanceSlipStatus>("open");
  const [requestType, setRequestType] = useState<MaintenanceSlipRequestType>("repair");
  const [requestedService, setRequestedService] = useState("");
  const [locationHint, setLocationHint] = useState("");
  const [preferredServiceDate, setPreferredServiceDate] = useState("");
  const [safetySensitive, setSafetySensitive] = useState<boolean | null>(null);
  const [vehicleOutOfService, setVehicleOutOfService] = useState<boolean | null>(null);
  const [statusNote, setStatusNote] = useState("");
  const [newNote, setNewNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  const load = useCallback(async () => {
    if (!orgId || !canView) return;
    const row = await maintenanceSlipsRepo.getById({ orgId, id });
    setSlip(row);
    if (!row) return;
    setVehicleAssetId(row.vehicleAssetId);
    setVehicleSnapshot(row.vehicleSnapshot);
    setEquipmentType(row.equipmentType ?? "");
    setMaintenanceCategory(row.maintenanceCategory ?? row.systemArea ?? "");
    setIssueTitle(row.issueTitle);
    setIssueDescription(row.issueDescription ?? "");
    setSeverity(row.severity);
    setStatus(row.status);
    setRequestType(row.serviceRequest?.requestType ?? "repair");
    setRequestedService(row.serviceRequest?.requestedService ?? "");
    setLocationHint(row.locationHint ?? row.serviceRequest?.reportedLocation ?? "");
    setPreferredServiceDate(formatDateInput(row.preferredServiceDate));
    setSafetySensitive(row.serviceRequest?.safetySensitive ?? null);
    setVehicleOutOfService(row.serviceRequest?.vehicleOutOfService ?? null);
  }, [canView, id, orgId]);

  useEffect(() => {
    load();
  }, [load, dbTick]);

  const creatorLabel = useMemo(() => {
    if (!slip) return "Unknown";
    return formatPersonDisplayName(slip as Record<string, unknown>, {
      nameKeys: ["createdByName"],
      displayNameKeys: ["createdByDisplayName"],
      emailKeys: ["createdByEmail"],
      uidKeys: ["createdByUid"],
      unknownLabel: "Unknown",
    });
  }, [slip]);

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

  async function saveDetails() {
    if (!slip || !orgId) return;
    if (!canEdit) {
      Alert.alert("Permission denied", permissionDeniedMessage("editMaintenanceSlip"));
      return;
    }
    if (!issueTitle.trim()) {
      Alert.alert("Missing summary", "A short problem summary is required.");
      return;
    }

    const snapshot = normalizeVehicleSnapshot(vehicleSnapshot);
    const unitLabel = buildMaintenanceUnitLabel(snapshot, slip.unitLabel);
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
      const next = await maintenanceSlipService.saveAndEnqueue({
        ...slip,
        vehicleAssetId,
        vehicleSource: vehicleAssetId ? "linked_asset" : "manual_entry",
        vehicleSnapshot: snapshot,
        unitLabel,
        equipmentType: equipmentType.trim() || null,
        maintenanceCategory: maintenanceCategory.trim() || null,
        systemArea: maintenanceCategory.trim() || null,
        issueTitle,
        issueDescription,
        locationHint,
        readingLabel: buildMaintenanceReadingLabel(snapshot),
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
        severity,
        status,
        updatedAt: Date.now(),
      });
      setSlip(next);
      Alert.alert("Saved", "Maintenance slip details updated.");
    } catch (error: any) {
      Alert.alert("Save failed", error?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function saveStatus(nextStatus: MaintenanceSlipStatus) {
    if (!slip || !orgId) return;
    if (!canEdit) {
      Alert.alert("Permission denied", permissionDeniedMessage("editMaintenanceSlip"));
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const updated = await maintenanceSlipService.updateStatusAndEnqueue({
        orgId,
        id: slip.id,
        status: nextStatus,
        noteBody: statusNote,
      });
      setSlip(updated);
      setStatus(updated.status);
      setStatusNote("");
    } catch (error: any) {
      Alert.alert("Status update failed", error?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  async function addNote() {
    if (!slip || !orgId) return;
    if (!canEdit) {
      Alert.alert("Permission denied", permissionDeniedMessage("editMaintenanceSlip"));
      return;
    }
    if (!newNote.trim()) {
      Alert.alert("Missing note", "Enter an update note before saving.");
      return;
    }
    if (saving) return;

    setSaving(true);
    try {
      const updated = await maintenanceSlipService.appendNoteAndEnqueue({
        orgId,
        id: slip.id,
        body: newNote,
      });
      setSlip(updated);
      setNewNote("");
    } catch (error: any) {
      Alert.alert("Note failed", error?.message ?? "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  if (!canView) {
    return (
      <View style={styles.loading}>
        <Text>{permissionDeniedMessage("viewMaintenanceSlip")}</Text>
      </View>
    );
  }

  if (!slip) {
    return (
      <View style={styles.loading}>
        <Text>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={{ paddingBottom: tabBarHeight + insets.bottom + 28 }}
    >
      <Text style={styles.title}>{slip.issueTitle}</Text>
      <Text style={styles.subtitle}>{slip.unitLabel}</Text>
      <Text style={styles.meta}>Created by {creatorLabel} • {new Date(slip.createdAt).toLocaleString()}</Text>

      <Section title="1. Vehicle" subtitle="Linked vehicle assets keep a historical snapshot on the slip. Clear the link only when you intentionally want a manual record.">
        <VehicleAssetSelector
          orgId={orgId}
          editable={canEdit}
          selectedAssetId={vehicleAssetId}
          selectedSnapshot={normalizedSnapshot}
          onSelect={applyAsset}
          onClear={clearLinkedAsset}
        />
        <InfoBanner kind={linkedAsset ? "linked" : "manual"}>
          {linkedAsset
            ? "This slip is linked to an org vehicle asset. The visible vehicle snapshot stays with the maintenance record for history."
            : "This slip is using manual vehicle details. You can link an org vehicle asset later if needed."}
        </InfoBanner>

        <Field label="Unit / Truck Number">
          <TextInput
            value={normalizedSnapshot?.unitNumber ?? ""}
            onChangeText={(value) => patchSnapshot({ unitNumber: value || null })}
            editable={canEdit && !linkedAsset}
            style={[styles.input, linkedAsset && styles.readOnlyInput]}
          />
        </Field>

        <RowFields>
          <Field label="Make">
            <TextInput
              value={normalizedSnapshot?.make ?? ""}
              onChangeText={(value) => patchSnapshot({ make: value || null })}
              editable={canEdit && !linkedAsset}
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Model">
            <TextInput
              value={normalizedSnapshot?.model ?? ""}
              onChangeText={(value) => patchSnapshot({ model: value || null })}
              editable={canEdit && !linkedAsset}
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>

        <RowFields>
          <Field label="Year">
            <TextInput
              value={normalizedSnapshot?.year != null ? String(normalizedSnapshot.year) : ""}
              onChangeText={(value) => patchSnapshot({ year: value ? Number(value) : null })}
              editable={canEdit && !linkedAsset}
              keyboardType="number-pad"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Vehicle Status">
            <TextInput
              value={normalizedSnapshot?.status ?? ""}
              onChangeText={(value) => patchSnapshot({ status: value || null })}
              editable={canEdit && !linkedAsset}
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>

        <RowFields>
          <Field label="Odometer">
            <TextInput
              value={normalizedSnapshot?.odometer != null ? String(normalizedSnapshot.odometer) : ""}
              onChangeText={(value) => patchSnapshot({ odometer: value ? Number(value) : null })}
              editable={canEdit && !linkedAsset}
              keyboardType="numeric"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
          <Field label="Engine Hours">
            <TextInput
              value={normalizedSnapshot?.engineHours != null ? String(normalizedSnapshot.engineHours) : ""}
              onChangeText={(value) => patchSnapshot({ engineHours: value ? Number(value) : null })}
              editable={canEdit && !linkedAsset}
              keyboardType="numeric"
              style={[styles.input, linkedAsset && styles.readOnlyInput]}
            />
          </Field>
        </RowFields>
      </Section>

      <Section title="2. Problem / Request" subtitle="Short summary plus a richer complaint/request structure for mechanics and fleet review.">
        <Field label="Short Summary">
          <TextInput value={issueTitle} onChangeText={setIssueTitle} editable={canEdit} style={styles.input} />
        </Field>

        <Field label="Requested Service">
          <TextInput value={requestedService} onChangeText={setRequestedService} editable={canEdit} style={styles.input} />
        </Field>

        <Field label="Detailed Complaint / Notes">
          <TextInput
            value={issueDescription}
            onChangeText={setIssueDescription}
            editable={canEdit}
            multiline
            style={[styles.input, styles.multiline]}
          />
        </Field>

        <Field label="Category">
          <TextInput value={maintenanceCategory} onChangeText={setMaintenanceCategory} editable={canEdit} style={styles.input} />
        </Field>

        <Field label="Request Type">
          <ChoiceRow
            options={REQUEST_TYPES}
            value={requestType}
            disabled={!canEdit || saving}
            onChange={(value) => setRequestType(value as MaintenanceSlipRequestType)}
            labelFor={(value) => value.replace(/_/g, " ")}
          />
        </Field>

        <Field label="Severity">
          <ChoiceRow
            options={MAINTENANCE_SLIP_SEVERITIES}
            value={severity}
            disabled={!canEdit || saving}
            onChange={(value) => setSeverity(value as MaintenanceSlipSeverity)}
            labelFor={(value) => formatMaintenanceSlipSeverity(value as MaintenanceSlipSeverity)}
          />
        </Field>
      </Section>

      <Section title="3. Request / Workflow" subtitle="Status, requested date, and workflow cues stay visible without mixing vehicle maintenance into road work-order permissions.">
        <Field label="Current Status">
          <ChoiceRow
            options={MAINTENANCE_SLIP_STATUSES}
            value={status}
            disabled={!canEdit || saving}
            onChange={(value) => setStatus(value as MaintenanceSlipStatus)}
            labelFor={(value) => formatMaintenanceSlipStatus(value as MaintenanceSlipStatus)}
          />
        </Field>

        <Field label="Status Note">
          <TextInput value={statusNote} onChangeText={setStatusNote} editable={canEdit} multiline style={[styles.input, styles.multilineCompact]} />
        </Field>

        <TouchableOpacity
          onPress={() => saveStatus(status)}
          disabled={!canEdit || saving}
          style={[styles.secondaryBtn, (!canEdit || saving) && styles.disabled]}
        >
          <Text style={styles.secondaryBtnText}>Save Status</Text>
        </TouchableOpacity>

        <Field label="Preferred Service Date">
          <TextInput value={preferredServiceDate} onChangeText={setPreferredServiceDate} editable={canEdit} style={styles.input} />
        </Field>

        <Field label="Reported Location / Context">
          <TextInput value={locationHint} onChangeText={setLocationHint} editable={canEdit} style={styles.input} />
        </Field>

        <Field label="Safety Sensitive">
          <BooleanChoice value={safetySensitive} onChange={setSafetySensitive} disabled={!canEdit || saving} />
        </Field>

        <Field label="Take Vehicle Out Of Service">
          <BooleanChoice value={vehicleOutOfService} onChange={setVehicleOutOfService} disabled={!canEdit || saving} />
        </Field>

        <TouchableOpacity
          onPress={saveDetails}
          disabled={!canEdit || saving}
          style={[styles.primaryBtn, (!canEdit || saving) && styles.disabled]}
        >
          <Text style={styles.primaryBtnText}>Save Details</Text>
        </TouchableOpacity>
      </Section>

      <Section title="4. Attachments / Notes" subtitle="Notes remain available for troubleshooting, findings, and closeout history.">
        <TextInput
          value={newNote}
          onChangeText={setNewNote}
          editable={canEdit}
          placeholder="Add shop findings, repair notes, or follow-up actions"
          multiline
          style={[styles.input, styles.multiline]}
        />
        <TouchableOpacity
          onPress={addNote}
          disabled={!canEdit || saving}
          style={[styles.secondaryBtn, (!canEdit || saving) && styles.disabled]}
        >
          <Text style={styles.secondaryBtnText}>Add Note</Text>
        </TouchableOpacity>

        {(slip.notes ?? []).length === 0 ? (
          <Text style={styles.emptyText}>No update notes yet.</Text>
        ) : (
          [...slip.notes].sort((a, b) => b.createdAt - a.createdAt).map((note) => (
            <View key={note.id} style={styles.noteCard}>
              <Text style={styles.noteMeta}>
                {note.kind === "status" ? "Status" : "Note"} • {formatPersonDisplayName(note as Record<string, unknown>, {
                  nameKeys: ["createdByName"],
                  displayNameKeys: ["createdByDisplayName"],
                  emailKeys: ["createdByEmail"],
                  uidKeys: ["createdByUid"],
                  unknownLabel: "Unknown",
                })} • {new Date(note.createdAt).toLocaleString()}
              </Text>
              <Text style={styles.noteBody}>{note.body}</Text>
            </View>
          ))
        )}
      </Section>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.fieldBlock}>
      <Text style={styles.fieldLabel}>{label}</Text>
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
            <Text style={[styles.choiceChipText, active && styles.choiceChipTextActive]}>{option.label}</Text>
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
  loading: { flex: 1, alignItems: "center", justifyContent: "center" },
  title: { fontSize: 24, fontWeight: "700", color: "#111827" },
  subtitle: { marginTop: 4, fontSize: 16, color: "#0f172a" },
  meta: { marginTop: 6, fontSize: 13, color: "#64748b" },
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
  multilineCompact: { minHeight: 72, textAlignVertical: "top" },
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
  infoBanner: { marginTop: 12, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  linkedBanner: { backgroundColor: "#eff6ff" },
  manualBanner: { backgroundColor: "#f8fafc" },
  infoBannerText: { color: "#334155", lineHeight: 18 },
  primaryBtn: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
    paddingVertical: 14,
  },
  primaryBtnText: { color: "#fff", fontWeight: "700", fontSize: 15 },
  secondaryBtn: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111827",
    alignItems: "center",
    paddingVertical: 12,
  },
  secondaryBtnText: { color: "#111827", fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },
  emptyText: { marginTop: 12, color: "#94a3b8" },
  noteCard: {
    marginTop: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 12,
    backgroundColor: "#f8fafc",
  },
  noteMeta: { fontSize: 12, color: "#64748b", marginBottom: 6 },
  noteBody: { fontSize: 14, color: "#111827" },
});