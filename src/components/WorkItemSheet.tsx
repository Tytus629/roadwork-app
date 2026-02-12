import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Switch,
  Alert,
  Modal,
  StyleSheet,
} from "react-native";
import type { Priority, WorkStatus } from "../db/types";
import { SIGN_TYPES } from "../constants/signTypes";
import { useWorkOrder } from "../hooks/useWorkOrder";
import { getSignDetailsByWorkOrderId } from "../db/workOrdersRepo";
import { updateWorkOrder, updateSignDetails, removeWorkOrder } from "../services/workOrdersService";
import { formatWorkType } from "../constants/workOrderTypes";

type Props = {
  workItemId: string | null;
  onClose: () => void;
};

const STATUS: WorkStatus[] = ["Needs", "In Progress", "Done", "Deferred"];
const PRIORITY: Priority[] = ["Low", "Medium", "High", "Urgent"];
const SIGN_CONDITION = ["Good", "Faded", "Damaged", "Missing"] as const;
const SIGN_ACTION = ["Replace", "Repair", "Clean", "Install"] as const;

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? `✅ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

export default function WorkItemSheet({ workItemId, onClose }: Props) {
  const wo = useWorkOrder(workItemId);
  const [noteDraft, setNoteDraft] = useState("");
  const [signDetails, setSignDetails] = useState<ReturnType<typeof getSignDetailsByWorkOrderId>>(null);

  // Load sign details when work order changes
  useEffect(() => {
    if (!wo || wo.type !== "sign") {
      setSignDetails(null);
      return;
    }
    const details = getSignDetailsByWorkOrderId(wo.id);
    setSignDetails(details);
  }, [wo?.id, wo?.type, wo?.updatedAt]);

  // Update note draft when work order loads
  useEffect(() => {
    if (!wo) return;
    setNoteDraft(wo.note ?? "");
  }, [wo?.id]);

  if (!workItemId) {
    return null;
  }

  if (!wo) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Loading…</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const isSign = wo.type.toLowerCase() === "sign";

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>{formatWorkType(wo.type as any)}</Text>
            <Text style={styles.subtitle}>
              Created: {new Date(wo.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          {/* STATUS */}
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS.map((s) => (
              <Chip
                key={s}
                label={s}
                active={wo.status === s}
                onPress={() => updateWorkOrder({ id: wo.id, status: s })}
              />
            ))}
          </View>

          {/* PRIORITY */}
          <Text style={styles.sectionTitle}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITY.map((p) => (
              <Chip
                key={p}
                label={p}
                active={wo.priority === p}
                onPress={() => updateWorkOrder({ id: wo.id, priority: p })}
              />
            ))}
          </View>

          {/* NOTE */}
          <Text style={styles.sectionTitle}>Note</Text>
          <TextInput
            value={noteDraft}
            onChangeText={setNoteDraft}
            placeholder="Add a note…"
            multiline
            style={styles.noteInput}
          />
          <TouchableOpacity
            onPress={() => updateWorkOrder({ id: wo.id, note: noteDraft })}
            style={styles.saveButton}
          >
            <Text style={styles.saveButtonText}>Save Note</Text>
          </TouchableOpacity>

          {/* SIGN DETAILS */}
          {isSign && (
            <>
              <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Sign Details</Text>

              <Text style={styles.subSectionTitle}>Sign Type</Text>
              <View style={styles.signTypePicker}>
                {SIGN_TYPES.map((st) => {
                  const active = (signDetails?.signTypeId ?? null) === st.id;
                  return (
                    <TouchableOpacity
                      key={st.id}
                      onPress={() =>
                        updateSignDetails({
                          workOrderId: wo.id,
                          signTypeId: st.id,
                          category: st.category,
                        })
                      }
                      style={styles.signTypeRow}
                    >
                      <Text style={[styles.signTypeLabel, active && styles.signTypeLabelActive]}>
                        {active ? `✅ ${st.label}` : st.label}
                      </Text>
                      <Text style={styles.signTypeCategory}>{st.category}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.subSectionTitle}>Condition</Text>
              <View style={styles.chipRow}>
                {SIGN_CONDITION.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={(signDetails?.condition ?? null) === c}
                    onPress={() => updateSignDetails({ workOrderId: wo.id, condition: c })}
                  />
                ))}
              </View>

              <Text style={styles.subSectionTitle}>Action Needed</Text>
              <View style={styles.chipRow}>
                {SIGN_ACTION.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    active={(signDetails?.action ?? null) === a}
                    onPress={() => updateSignDetails({ workOrderId: wo.id, action: a })}
                  />
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Reflectivity Issue</Text>
                <Switch
                  value={(signDetails?.reflectivityIssue ?? 0) === 1}
                  onValueChange={(v) =>
                    updateSignDetails({ workOrderId: wo.id, reflectivityIssue: v })
                  }
                />
              </View>
            </>
          )}

          {/* DELETE */}
          <TouchableOpacity
            onPress={() => {
              Alert.alert("Delete Work Order?", "This cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                {
                  text: "Delete",
                  style: "destructive",
                  onPress: () => {
                    removeWorkOrder(wo.id);
                    onClose();
                  },
                },
              ]);
            }}
            style={styles.deleteButton}
          >
            <Text style={styles.deleteButtonText}>Delete Work Order</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: "#6b7280",
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#374151",
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 10,
  },
  subSectionTitle: {
    fontSize: 14,
    fontWeight: "800",
    marginTop: 16,
    marginBottom: 10,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 16,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  chipText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
  },
  chipTextActive: {
    color: "white",
  },
  noteInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
    fontSize: 15,
  },
  saveButton: {
    marginTop: 10,
    padding: 14,
    borderWidth: 1,
    borderColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  saveButtonText: {
    fontWeight: "800",
    fontSize: 15,
    color: "white",
  },
  signTypePicker: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    overflow: "hidden",
  },
  signTypeRow: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  signTypeLabel: {
    fontWeight: "600",
    fontSize: 15,
    color: "#374151",
  },
  signTypeLabelActive: {
    fontWeight: "900",
    color: "#111827",
  },
  signTypeCategory: {
    fontSize: 13,
    color: "#6b7280",
  },
  switchRow: {
    marginTop: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  switchLabel: {
    fontWeight: "800",
    fontSize: 15,
  },
  deleteButton: {
    marginTop: 32,
    marginBottom: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: "#dc2626",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "white",
  },
  deleteButtonText: {
    fontWeight: "900",
    fontSize: 15,
    color: "#dc2626",
  },
});
