/**
 * WorkItemSheet.tsx
 * 
 * PURPOSE:
 * Modal sheet for viewing and editing work order details.
 * Appears when user taps a pin on the map or opens a work order from list views.
 * 
 * KEY FEATURES:
 * - Edit status (Needs/In Progress/Done/Deferred) and priority (Low/Medium/High/Urgent)
 * - For Sign work orders: Sign type picker, condition, action needed, reflectivity issues
 * - Notes field with manual save button
 * - Delete work order confirmation
 * 
 * DATA FLOW:
 * 1. Receives workItemId prop (not full object - prevents stale data)
 * 2. useWorkOrder hook fetches live data from SQLite
 * 3. For signs: getSignDetailsByWorkOrderId fetches separate sign_details table
 * 4. All edits call service functions (updateWorkOrder, updateSignDetails)
 * 5. Service functions emit DbEvents → hooks re-fetch → UI updates
 * 6. Manual "Save Note" button for notes (prevents save-on-every-keystroke)
 * 
 * WHY SEPARATE SIGN DETAILS TABLE:
 * - Work orders table is generic (all work types)
 * - sign_details table has sign-specific fields (signTypeId, condition, etc.)
 * - LEFT JOIN in queries combines them when needed
 * - Keeps schema clean and extensible for other work types
 * 
 * REACTIVITY:
 * - Subscribes to DbEvents (global event emitter)
 * - When ANY database change happens, dbTick increments
 * - useEffect dependencies on dbTick trigger re-fetch
 * - This ensures sheet always shows latest data, even if edited elsewhere
 * 
 * UI ORDER (per user request):
 * 1. Status chips
 * 2. Priority chips
 * 3. Sign Details section (if work order is a Sign)
 *    - Sign Type picker modal
 *    - Condition chips
 *    - Action Needed chips
 *    - Reflectivity Issue toggle
 * 4. Note text area (at bottom, below sign details)
 * 5. Delete button
 */

import React, { useEffect, useMemo, useState } from "react";
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
import { SignTypePickerModal } from "./SignTypePickerModal";
import { SignPickerModal } from "./SignPickerModal";
import type { SignCatalogItem } from "../constants/signCatalog";
import { getSignTypeById } from "../utils/signTypeLookup";
import { useWorkOrder } from "../hooks/useWorkOrder";
import { getSignDetailsByWorkOrderId } from "../db/workOrdersRepo";
import { updateWorkOrder, updateSignDetails, removeWorkOrder } from "../services/workOrdersService";
import { formatWorkType } from "../constants/workOrderTypes";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import { focusMapOnWorkOrder } from "../state/MapFocusEvents";
import { useNavigation } from "@react-navigation/native";
import type { WorkType } from "../types/workItem";
import { getWorkOrderCenter } from "../utils/workOrderGeo";

export type DraftWorkOrder = {
  type: WorkType;
  point?: { lat: number; lng: number };
  points?: { lat: number; lng: number }[];
  status: WorkStatus;
  priority: Priority;
  note?: string | null;
  signDetails?: {
    signTypeId?: string | null;
    category?: string | null;
    condition?: string | null;
    action?: string | null;
    reflectivityIssue?: boolean;

    // MUTCD Sign Catalog fields
    signCategory?: string | null;
    signCode?: string | null;
    signName?: string | null;
    
    // Inspection sheet fields
    inspectionVisible?: boolean;
    reflectivityScore?: number | null;
    delaminationScore?: number | null;
    appearanceScore?: number | null;
    postMaterial?: "Wood" | "Steel" | null;
    postConditionScore?: number | null;
  };
};

type Props = {
  onClose: () => void;
} & (
  | { mode: "existing"; workItemId: string }
  | { mode: "draft"; draftWorkOrder: DraftWorkOrder; onCreateDraft: (draft: DraftWorkOrder) => void }
);

// Dropdown options for status/priority
const STATUS: WorkStatus[] = ["Needs", "In Progress", "Done", "Deferred"];
const PRIORITY: Priority[] = ["Low", "Medium", "High", "Urgent"];
const SIGN_CONDITION = ["Good", "Faded", "Damaged", "Missing"] as const;
const SIGN_ACTION = ["Replace", "Repair", "Clean", "Install"] as const;

/**
 * Chip component: Toggle-able button with active state
 * Active chips show "✓ Label" and have dark background
 */
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? `OK ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

export default function WorkItemSheet(props: Props) {
  const { onClose } = props;
  const isDraft = props.mode === "draft";
  const navigation = useNavigation<any>();
  
  // For existing work orders, fetch from DB
  const workItemId = props.mode === "existing" ? props.workItemId : null;
  const dbWorkOrder = useWorkOrder(workItemId);
  
  // For draft work orders, use local state
  const [localDraft, setLocalDraft] = useState<DraftWorkOrder | null>(
    props.mode === "draft" ? props.draftWorkOrder : null
  );
  
  // Current work order (either from DB or draft)
  const wo = useMemo(() => {
    if (isDraft && localDraft) {
      return {
        id: "draft",
        type: localDraft.type,
        status: localDraft.status,
        priority: localDraft.priority,
        note: localDraft.note ?? null,
        createdAt: Date.now(),
        point: localDraft.point ?? null,
        points: localDraft.points ?? null,
      };
    }
    return dbWorkOrder;
  }, [isDraft, localDraft, dbWorkOrder]);
  
  const [noteDraft, setNoteDraft] = useState("");
  const [signDetails, setSignDetails] = useState<ReturnType<typeof getSignDetailsByWorkOrderId>>(null);
  const [dbTick, setDbTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [signCatalogPickerOpen, setSignCatalogPickerOpen] = useState(false);

  // Inspection draft state - explicit save pattern to ensure values persist
  const [inspectionDraft, setInspectionDraft] = useState<{
    reflectivityScore: number | null;
    delaminationScore: number | null;
    appearanceScore: number | null;
    postMaterial: "Wood" | "Steel" | null;
    postConditionScore: number | null;
  }>({
    reflectivityScore: null,
    delaminationScore: null,
    appearanceScore: null,
    postMaterial: null,
    postConditionScore: null,
  });
  const [inspectionDirty, setInspectionDirty] = useState(false);

  const isSign = (wo?.type ?? "").toLowerCase() === "sign";

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const selectedSignTypeLabel = useMemo(() => {
    const signTypeId = signDetails?.signTypeId;
    if (!signTypeId) return null;
    const st = getSignTypeById(signTypeId);
    if (!st) return signTypeId; // Fallback to ID if not found
    return st.label;
  }, [signDetails?.signTypeId]);

  useEffect(() => {
    if (!wo || !isSign) {
      setSignDetails(null);
      return;
    }
    
    if (isDraft && localDraft?.signDetails) {
      setSignDetails(localDraft.signDetails as any);
    } else if (!isDraft) {
      const details = getSignDetailsByWorkOrderId(wo.id);
      setSignDetails(details);
    }
  }, [wo, isSign, dbTick, isDraft, localDraft]);

  useEffect(() => {
    if (!wo?.id) return;
    setNoteDraft(wo.note ?? "");
  }, [wo?.id, wo?.note]);

  // Sync inspection draft from DB/signDetails when work order changes
  useEffect(() => {
    if (!wo || !isSign) return;
    
    setInspectionDraft({
      reflectivityScore: signDetails?.reflectivityScore ?? null,
      delaminationScore: signDetails?.delaminationScore ?? null,
      appearanceScore: signDetails?.appearanceScore ?? null,
      postMaterial: signDetails?.postMaterial ?? null,
      postConditionScore: signDetails?.postConditionScore ?? null,
    });
    setInspectionDirty(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo?.id, isSign, signDetails?.reflectivityScore, signDetails?.delaminationScore, signDetails?.appearanceScore, signDetails?.postMaterial, signDetails?.postConditionScore]);

  if (!isDraft && !workItemId) {
    return null;
  }

  if (!wo) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Loading...</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeButtonText}>X</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  const handleClose = onClose;

  function changeStatus(s: WorkStatus) {
    if (isDraft) {
      setLocalDraft(prev => prev ? { ...prev, status: s } : null);
    } else if (wo) {
      updateWorkOrder({ id: wo.id, status: s });
    }
  }

  function changePriority(p: Priority) {
    if (isDraft) {
      setLocalDraft(prev => prev ? { ...prev, priority: p } : null);
    } else if (wo) {
      updateWorkOrder({ id: wo.id, priority: p });
    }
  }

  function changeSignDetails(updates: Partial<DraftWorkOrder["signDetails"]>) {
    if (isDraft) {
      setLocalDraft(prev => {
        if (!prev) return null;
        return {
          ...prev,
          signDetails: { ...prev.signDetails, ...updates },
        };
      });
    } else if (wo) {
      updateSignDetails({ workOrderId: wo.id, ...updates });
    }
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>
              {formatWorkType(wo.type as any)}
            </Text>
            <Text style={styles.subtitle}>
              Created: {new Date(wo.createdAt).toLocaleDateString()}
            </Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS.map((s) => (
              <Chip
                key={s}
                label={s}
                active={wo.status === s}
                onPress={() => changeStatus(s)}
              />
            ))}
          </View>

          <Text style={styles.sectionTitle}>Priority</Text>
          <View style={styles.chipRow}>
            {PRIORITY.map((p) => (
              <Chip
                key={p}
                label={p}
                active={wo.priority === p}
                onPress={() => changePriority(p)}
              />
            ))}
          </View>

          {isSign && (
            <>
              <Text style={styles.signDetailsSectionTitle}>Sign Details</Text>

              <Text style={styles.subSectionTitle}>Sign Type</Text>
              <TouchableOpacity onPress={() => setPickerOpen(true)} style={styles.signTypeBox}>
                <Text style={styles.signTypeBoxTitle}>
                  {signDetails?.signTypeId
                    ? "Change Sign Type"
                    : "Choose Sign Type"}
                </Text>
                <Text style={styles.signTypeBoxSub}>
                  Current: {selectedSignTypeLabel ?? "None"}
                  {signDetails?.signTypeId && ` (${signDetails.signTypeId})`} • {signDetails?.category ?? "Unknown"}
                </Text>
              </TouchableOpacity>

              <SignTypePickerModal
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                selectedId={signDetails?.signTypeId ?? null}
                onSelect={(st) => {
                  changeSignDetails({
                    signTypeId: st.id,
                    category: st.category,
                  });
                  setPickerOpen(false);
                }}
              />

              <Text style={styles.subSectionTitle}>MUTCD Sign</Text>
              <TouchableOpacity
                onPress={() => setSignCatalogPickerOpen(true)}
                style={styles.signTypeBox}
              >
                <Text style={styles.signTypeBoxTitle}>
                  {signDetails?.signCode
                    ? `${signDetails.signCode} — ${signDetails.signName}`
                    : "Select MUTCD Sign…"}
                </Text>
                <Text style={styles.signTypeBoxSub}>
                  {signDetails?.signCategory ?? "No category selected"}
                </Text>
              </TouchableOpacity>

              <SignPickerModal
                visible={signCatalogPickerOpen}
                onClose={() => setSignCatalogPickerOpen(false)}
                onSelect={(item: SignCatalogItem) => {
                  changeSignDetails({
                    signCategory: item.category,
                    signCode: item.code,
                    signName: item.name,
                  });
                  setSignCatalogPickerOpen(false);
                }}
                initialCategory="All"
              />

              <Text style={styles.subSectionTitle}>Condition</Text>
              <View style={styles.chipRow}>
                {SIGN_CONDITION.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={signDetails?.condition === c}
                    onPress={() => changeSignDetails({ condition: c })}
                  />
                ))}
              </View>

              <Text style={styles.subSectionTitle}>Action Needed</Text>
              <View style={styles.chipRow}>
                {SIGN_ACTION.map((a) => (
                  <Chip
                    key={a}
                    label={a}
                    active={signDetails?.action === a}
                    onPress={() => changeSignDetails({ action: a })}
                  />
                ))}
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Reflectivity Issue</Text>
                <Switch
                  value={(signDetails?.reflectivityIssue ?? 0) === 1}
                  onValueChange={(v) => {
                    changeSignDetails({ reflectivityIssue: v });
                  }}
                />
              </View>

              {/* Inspection Sheet - Collapsible Section */}
              <TouchableOpacity
                onPress={() => changeSignDetails({ inspectionVisible: !signDetails?.inspectionVisible })}
                style={styles.inspectionHeader}
              >
                <Text style={styles.inspectionHeaderText}>
                  {signDetails?.inspectionVisible ? "▼" : "▶"} Inspection Sheet
                </Text>
              </TouchableOpacity>

              {!!signDetails?.inspectionVisible && (
                <View style={styles.inspectionContent}>
                  <Text style={styles.inspectionLabel}>Reflectivity Score (1-10)</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          setInspectionDraft(d => ({ ...d, reflectivityScore: n }));
                          setInspectionDirty(true);
                        }}
                        style={[
                          styles.ratingChip,
                          inspectionDraft.reflectivityScore === n && styles.ratingChipActive
                        ]}
                      >
                        <Text style={[
                          styles.ratingChipText,
                          inspectionDraft.reflectivityScore === n && styles.ratingChipTextActive
                        ]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inspectionLabel}>Delamination Score (1-10)</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          setInspectionDraft(d => ({ ...d, delaminationScore: n }));
                          setInspectionDirty(true);
                        }}
                        style={[
                          styles.ratingChip,
                          inspectionDraft.delaminationScore === n && styles.ratingChipActive
                        ]}
                      >
                        <Text style={[
                          styles.ratingChipText,
                          inspectionDraft.delaminationScore === n && styles.ratingChipTextActive
                        ]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inspectionLabel}>Appearance Score (1-10)</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          setInspectionDraft(d => ({ ...d, appearanceScore: n }));
                          setInspectionDirty(true);
                        }}
                        style={[
                          styles.ratingChip,
                          inspectionDraft.appearanceScore === n && styles.ratingChipActive
                        ]}
                      >
                        <Text style={[
                          styles.ratingChipText,
                          inspectionDraft.appearanceScore === n && styles.ratingChipTextActive
                        ]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <Text style={styles.inspectionLabel}>Post Material</Text>
                  <View style={styles.chipRow}>
                    <Chip
                      label="Wood"
                      active={inspectionDraft.postMaterial === "Wood"}
                      onPress={() => {
                        setInspectionDraft(d => ({ ...d, postMaterial: d.postMaterial === "Wood" ? null : "Wood" }));
                        setInspectionDirty(true);
                      }}
                    />
                    <Chip
                      label="Steel"
                      active={inspectionDraft.postMaterial === "Steel"}
                      onPress={() => {
                        setInspectionDraft(d => ({ ...d, postMaterial: d.postMaterial === "Steel" ? null : "Steel" }));
                        setInspectionDirty(true);
                      }}
                    />
                  </View>

                  <Text style={styles.inspectionLabel}>Post Condition Score (1-10)</Text>
                  <View style={styles.ratingRow}>
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => {
                          setInspectionDraft(d => ({ ...d, postConditionScore: n }));
                          setInspectionDirty(true);
                        }}
                        style={[
                          styles.ratingChip,
                          inspectionDraft.postConditionScore === n && styles.ratingChipActive
                        ]}
                      >
                        <Text style={[
                          styles.ratingChipText,
                          inspectionDraft.postConditionScore === n && styles.ratingChipTextActive
                        ]}>{n}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Save / Discard Inspection Buttons */}
                  <View style={styles.inspectionActions}>
                    <TouchableOpacity
                      onPress={() => {
                        if (!isDraft && wo) {
                          updateSignDetails({
                            workOrderId: wo.id,
                            reflectivityScore: inspectionDraft.reflectivityScore,
                            delaminationScore: inspectionDraft.delaminationScore,
                            appearanceScore: inspectionDraft.appearanceScore,
                            postMaterial: inspectionDraft.postMaterial,
                            postConditionScore: inspectionDraft.postConditionScore,
                            inspectionLastSavedAt: Date.now(),
                          });
                        }
                        setInspectionDirty(false);
                      }}
                      style={[styles.inspectionSaveButton, !inspectionDirty && styles.inspectionSavedButton]}
                    >
                      <Text style={[styles.inspectionSaveText, !inspectionDirty && styles.inspectionSavedText]}>
                        {inspectionDirty ? "Save Inspection" : "Saved ✓"}
                      </Text>
                    </TouchableOpacity>

                    {inspectionDirty && (
                      <TouchableOpacity
                        onPress={() => {
                          setInspectionDraft({
                            reflectivityScore: signDetails?.reflectivityScore ?? null,
                            delaminationScore: signDetails?.delaminationScore ?? null,
                            appearanceScore: signDetails?.appearanceScore ?? null,
                            postMaterial: signDetails?.postMaterial ?? null,
                            postConditionScore: signDetails?.postConditionScore ?? null,
                          });
                          setInspectionDirty(false);
                        }}
                        style={styles.inspectionDiscardButton}
                      >
                        <Text style={styles.inspectionDiscardText}>Discard Changes</Text>
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Last Inspected Timestamp */}
                  <View style={styles.lastInspectedRow}>
                    <Text style={styles.lastInspectedText}>
                      Last inspected:{" "}
                      {signDetails?.inspectionLastSavedAt
                        ? new Date(signDetails.inspectionLastSavedAt).toLocaleString()
                        : "Never"}
                    </Text>
                  </View>
                </View>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Note</Text>
          <TextInput
            value={noteDraft}
            onChangeText={(text) => {
              setNoteDraft(text);
              if (isDraft) {
                setLocalDraft(prev => prev ? { ...prev, note: text } : null);
              }
            }}
            placeholder="Add a note..."
            multiline
            style={styles.noteInput}
          />
          {!isDraft && (
            <TouchableOpacity
              onPress={() => updateWorkOrder({ id: wo.id, note: noteDraft })}
              style={styles.saveButton}
            >
              <Text style={styles.saveButtonText}>Save Note</Text>
            </TouchableOpacity>
          )}

          <View style={styles.actionRow}>
            {isDraft ? (
              <>
                <TouchableOpacity
                  onPress={onClose}
                  style={[styles.actionButton, styles.cancelButton]}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (props.mode === "draft" && localDraft) {
                      props.onCreateDraft(localDraft);
                      onClose();
                    }
                  }}
                  style={[styles.actionButton, styles.createButton]}
                >
                  <Text style={styles.createButtonText}>Create Work Order</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                {/* Show on Map button - navigate to Map tab and focus on this work order */}
                <TouchableOpacity
                  onPress={() => {
                    const c = getWorkOrderCenter(wo);
                    console.log("[WorkItemSheet] Show on Map", { id: wo.id, type: wo.type, center: c, wo });

                    if (!c) {
                      Alert.alert("No Location", "This work order has no location data.");
                      return;
                    }

                    focusMapOnWorkOrder({
                      workOrderId: wo.id,
                      latitude: c.lat,
                      longitude: c.lng,
                      zoom: "street",
                    });

                    // Navigate to Map tab - use nested navigation since we're inside a stack
                    // MainTabs is the tab navigator inside RootNavigator stack
                    navigation.navigate("MainTabs", { screen: "Map" });
                  }}
                  style={[styles.actionButton, styles.showOnMapButton]}
                >
                  <Text style={styles.showOnMapButtonText}>📍 Show on Map</Text>
                </TouchableOpacity>
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
                style={[styles.actionButton, styles.deleteButton]}
              >
                <Text style={styles.deleteButtonText}>Delete Work Order</Text>
              </TouchableOpacity>
              </>
            )}
          </View>
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
  signDetailsSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    marginTop: 24,
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
  signTypeBox: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    padding: 12,
    backgroundColor: "white",
  },
  signTypeBoxTitle: {
    fontWeight: "800",
    fontSize: 14,
  },
  signTypeBoxSub: {
    marginTop: 6,
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
  actionRow: {
    marginTop: 24,
    marginBottom: 16,
    flexDirection: "row",
    gap: 10,
  },
  actionButton: {
    flex: 1,
    padding: 14,
    borderWidth: 2,
    borderRadius: 12,
    alignItems: "center",
  },
  deleteButton: {
    borderColor: "#dc2626",
    backgroundColor: "white",
  },
  deleteButtonText: {
    fontWeight: "900",
    fontSize: 15,
    color: "#dc2626",
  },
  showOnMapButton: {
    borderColor: "#2563eb",
    backgroundColor: "#2563eb",
    marginBottom: 10,
  },
  showOnMapButtonText: {
    fontWeight: "800",
    fontSize: 15,
    color: "white",
  },  cancelButton: {
    borderColor: "#9ca3af",
    backgroundColor: "white",
  },
  cancelButtonText: {
    fontWeight: "800",
    fontSize: 15,
    color: "#4b5563",
  },
  createButton: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  createButtonText: {
    fontWeight: "800",
    fontSize: 15,
    color: "white",
  },
  // Inspection Sheet Styles
  inspectionHeader: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: "#f3f4f6",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  inspectionHeaderText: {
    fontWeight: "800",
    fontSize: 15,
    color: "#374151",
  },
  inspectionContent: {
    marginTop: 8,
    padding: 12,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  inspectionLabel: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
    marginTop: 12,
    marginBottom: 8,
  },
  ratingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  ratingChip: {
    width: 32,
    height: 32,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    marginRight: 6,
    marginBottom: 6,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "white",
  },
  ratingChipActive: {
    backgroundColor: "#111827",
    borderColor: "#111827",
  },
  ratingChipText: {
    fontWeight: "700",
    fontSize: 13,
    color: "#374151",
  },
  ratingChipTextActive: {
    color: "white",
  },
  // Inspection Save/Discard Buttons
  inspectionActions: {
    marginTop: 16,
  },
  inspectionSaveButton: {
    paddingVertical: 12,
    borderWidth: 2,
    borderColor: "#111827",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  inspectionSavedButton: {
    backgroundColor: "#d1fae5",
    borderColor: "#10b981",
  },
  inspectionSaveText: {
    fontWeight: "900",
    fontSize: 14,
    color: "white",
  },
  inspectionSavedText: {
    color: "#065f46",
  },
  inspectionDiscardButton: {
    marginTop: 10,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "white",
  },
  inspectionDiscardText: {
    fontWeight: "700",
    fontSize: 14,
    color: "#6b7280",
  },
  lastInspectedRow: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  lastInspectedText: {
    fontSize: 13,
    color: "#6b7280",
  },
});
