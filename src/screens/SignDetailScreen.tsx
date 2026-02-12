import React, { useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Modal, Alert } from "react-native";
import type { SignAsset, SignInspection } from "../types/Sign";
import { useSignsContext } from "../state/SignsContext";
import { SignInspectionForm } from "../components/SignInspectionForm";
import { persistAuditLog } from "../utils/audit";

/**
 * Sign Detail Screen
 * 
 * Displays sign asset information, inspection history, and allows adding new inspections.
 */

type Props = {
  sign: SignAsset | null;
  onClose: () => void;
};

export function SignDetailScreen({ sign, onClose }: Props) {
  const { addInspection, inspectionsBySign } = useSignsContext();
  const [showInspectionForm, setShowInspectionForm] = useState(false);

  if (!sign) return null;

  const inspections = inspectionsBySign[sign.id] || [];

  const handleNewInspection = (formData: any) => {
    addInspection(sign.id, formData);
    
    // Log audit event
    persistAuditLog(sign.id, "sign_inspection_added", {
      result: formData.retroResult,
      method: formData.retroMethod,
    }).catch((e) => console.warn("[SignDetail] Failed to log inspection:", e));

    setShowInspectionForm(false);
    Alert.alert("Success", "Inspection saved successfully");
  };

  const formatDate = (ts: number | null | undefined) => {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleDateString();
  };

  const getDaysUntilDue = (dueAt: number | null | undefined) => {
    if (!dueAt) return null;
    const days = Math.ceil((dueAt - Date.now()) / (1000 * 60 * 60 * 24));
    return days;
  };

  const daysUntilDue = getDaysUntilDue(sign.nextDueAt);
  const isOverdue = daysUntilDue !== null && daysUntilDue < 0;
  const isDueSoon = daysUntilDue !== null && daysUntilDue >= 0 && daysUntilDue <= 30;

  return (
    <Modal visible={true} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Sign Details</Text>
          <Pressable onPress={onClose}>
            <Text style={styles.closeButton}>✕</Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content}>
          {/* Sign Info Section */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Sign Information</Text>
            <InfoRow label="Type" value={sign.signType.replace(/_/g, " ")} />
            {sign.mutcdCode && <InfoRow label="MUTCD Code" value={sign.mutcdCode} />}
            {sign.message && <InfoRow label="Message" value={sign.message} />}
            <InfoRow label="Location" value={`${sign.lat.toFixed(6)}, ${sign.lng.toFixed(6)}`} />
            {sign.bearingDeg && <InfoRow label="Bearing" value={`${sign.bearingDeg}°`} />}
            {sign.installedAt && <InfoRow label="Installed" value={formatDate(sign.installedAt)} />}
            {sign.sheetingType && <InfoRow label="Sheeting Type" value={sign.sheetingType} />}
            {sign.colorGroup && <InfoRow label="Color Group" value={sign.colorGroup} />}
          </View>

          {/* Last Inspection Summary */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inspection Status</Text>
            <InfoRow label="Last Inspection" value={formatDate(sign.lastInspectionAt)} />
            <InfoRow 
              label="Last Result" 
              value={sign.lastResult || "N/A"} 
              valueStyle={getResultStyle(sign.lastResult)} 
            />
            <InfoRow 
              label="Next Due" 
              value={
                daysUntilDue !== null 
                  ? isOverdue 
                    ? `${Math.abs(daysUntilDue)} days overdue` 
                    : `${daysUntilDue} days`
                  : "Not scheduled"
              }
              valueStyle={isOverdue ? styles.overdueText : isDueSoon ? styles.dueSoonText : undefined}
            />
          </View>

          {/* New Inspection Button */}
          <Pressable style={styles.newInspectionButton} onPress={() => setShowInspectionForm(true)}>
            <Text style={styles.newInspectionButtonText}>➕ New Inspection</Text>
          </Pressable>

          {/* Inspection History */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Inspection History ({inspections.length})</Text>
            {inspections.length === 0 ? (
              <Text style={styles.emptyText}>No inspections yet</Text>
            ) : (
              inspections.map((inspection) => (
                <InspectionCard key={inspection.id} inspection={inspection} />
              ))
            )}
          </View>
        </ScrollView>

        {/* Inspection Form Modal */}
        {showInspectionForm && (
          <Modal visible={true} animationType="slide">
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>New Inspection</Text>
              <Pressable onPress={() => setShowInspectionForm(false)}>
                <Text style={styles.closeButton}>✕</Text>
              </Pressable>
            </View>
            <SignInspectionForm
              onSubmit={handleNewInspection}
              onCancel={() => setShowInspectionForm(false)}
            />
          </Modal>
        )}
      </View>
    </Modal>
  );
}

function InfoRow({ label, value, valueStyle }: { label: string; value: string; valueStyle?: any }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueStyle]}>{value}</Text>
    </View>
  );
}

function InspectionCard({ inspection }: { inspection: SignInspection }) {
  const formatDateTime = (ts: number) => {
    return new Date(ts).toLocaleString();
  };

  const issues = [];
  if (inspection.damaged) issues.push("Damaged");
  if (inspection.missing) issues.push("Missing");
  if (inspection.knockedDown) issues.push("Knocked Down");
  if (inspection.obstructed) issues.push("Obstructed");
  if (inspection.faded) issues.push("Faded");
  if (inspection.dirty) issues.push("Dirty");
  if (!inspection.legible) issues.push("Not Legible");

  const actions = [];
  if (inspection.actionReplace) actions.push("Replace");
  if (inspection.actionRemove) actions.push("Remove");
  if (inspection.actionAdjustHeight) actions.push("Adjust Height");

  return (
    <View style={styles.inspectionCard}>
      <View style={styles.inspectionHeader}>
        <Text style={styles.inspectionDate}>{formatDateTime(inspection.ts)}</Text>
        <Text style={[styles.inspectionResult, getResultStyle(inspection.retroResult)]}>
          {inspection.retroResult.toUpperCase()}
        </Text>
      </View>
      
      {inspection.inspector && (
        <Text style={styles.inspectorText}>Inspector: {inspection.inspector}</Text>
      )}
      
      <Text style={styles.methodText}>Method: {inspection.retroMethod.replace(/_/g, " ")}</Text>
      
      {issues.length > 0 && (
        <Text style={styles.issuesText}>Issues: {issues.join(", ")}</Text>
      )}
      
      {actions.length > 0 && (
        <Text style={styles.actionsText}>Actions: {actions.join(", ")}</Text>
      )}
      
      {inspection.note && (
        <Text style={styles.noteText}>{inspection.note}</Text>
      )}
      
      {inspection.measuredRetro && (
        <View style={styles.measuredRetroBox}>
          <Text style={styles.measuredRetroTitle}>Measured RA Values:</Text>
          {inspection.measuredRetro.backgroundColor && (
            <Text style={styles.measuredRetroText}>
              Background ({inspection.measuredRetro.backgroundColor}): {inspection.measuredRetro.backgroundRA} cd/lx/m²
            </Text>
          )}
          {inspection.measuredRetro.legendColor && (
            <Text style={styles.measuredRetroText}>
              Legend ({inspection.measuredRetro.legendColor}): {inspection.measuredRetro.legendRA} cd/lx/m²
            </Text>
          )}
          {inspection.measuredRetro.meetsMinimum !== null && (
            <Text style={[styles.measuredRetroText, inspection.measuredRetro.meetsMinimum ? styles.passText : styles.failText]}>
              Meets Minimum: {inspection.measuredRetro.meetsMinimum ? "Yes" : "No"}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

function getResultStyle(result: string | null | undefined) {
  if (!result) return undefined;
  switch (result) {
    case "ok":
      return styles.resultOk;
    case "marginal":
      return styles.resultMarginal;
    case "replace":
      return styles.resultReplace;
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
  closeButton: {
    fontSize: 28,
    color: "#666",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  infoLabel: {
    fontSize: 16,
    color: "#666",
  },
  infoValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  overdueText: {
    color: "#d32f2f",
    fontWeight: "bold",
  },
  dueSoonText: {
    color: "#f57c00",
    fontWeight: "bold",
  },
  newInspectionButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: "center",
    marginBottom: 24,
  },
  newInspectionButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 16,
    color: "#999",
    fontStyle: "italic",
  },
  inspectionCard: {
    backgroundColor: "#f9f9f9",
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
  },
  inspectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  inspectionDate: {
    fontSize: 14,
    fontWeight: "600",
  },
  inspectionResult: {
    fontSize: 14,
    fontWeight: "bold",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  resultOk: {
    backgroundColor: "#4caf50",
    color: "#fff",
  },
  resultMarginal: {
    backgroundColor: "#ff9800",
    color: "#fff",
  },
  resultReplace: {
    backgroundColor: "#f44336",
    color: "#fff",
  },
  inspectorText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  methodText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  issuesText: {
    fontSize: 14,
    color: "#d32f2f",
    marginTop: 4,
  },
  actionsText: {
    fontSize: 14,
    color: "#1976d2",
    marginTop: 4,
  },
  noteText: {
    fontSize: 14,
    color: "#333",
    marginTop: 8,
    fontStyle: "italic",
  },
  measuredRetroBox: {
    backgroundColor: "#e3f2fd",
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  measuredRetroTitle: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 4,
  },
  measuredRetroText: {
    fontSize: 12,
    color: "#333",
  },
  passText: {
    color: "#4caf50",
    fontWeight: "600",
  },
  failText: {
    color: "#f44336",
    fontWeight: "600",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
  },
});
