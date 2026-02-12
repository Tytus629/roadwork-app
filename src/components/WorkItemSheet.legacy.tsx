/**
 * ═══════════════════════════════════════════════════════════════════════════
 * WORK ITEM SHEET COMPONENT
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PURPOSE:
 * Modal bottom sheet for viewing and editing work order details.
 * Handles status changes, priority updates, photo management, notes, and inspections.
 * 
 * CRITICAL ARCHITECTURAL NOTES:
 * 
 * 1. REACT HOOKS ORDER (Fixed to prevent "Rendered more hooks" error):
 *    - ALL hooks (useState, useEffect, useCallback) MUST be declared at the top
 *    - Early returns (like `if (!item) return null;`) come AFTER all hooks
 *    - Pattern: hooks first → early returns → regular functions
 *    - Reason: React requires hooks to run in the same order every render
 * 
 * 2. CENTRALIZED COMMIT PATTERN:
 *    - All updates use commitWorkOrder() from src/state/workOrdersCommit.ts
 *    - Guarantees Redux + SQLite updates happen together
 *    - Prevents "Work Orders disappear after restart" issue
 * 
 * 3. DUPLICATE COMMIT PREVENTION:
 *    - Uses `isCommitting` guard to prevent multiple simultaneous commits
 *    - Status buttons disabled during commit operations
 *    - Fixed issue where status changes triggered 4x duplicate commits
 * 
 * 4. CAMERA PERMISSION HANDLING:
 *    - Uses capturePhoto() from src/utils/capturePhoto.ts
 *    - Requests Android runtime permission before opening camera
 *    - Graceful fallback to gallery if permission denied
 * 
 * CHANGE HISTORY:
 * - Refactored to use centralized commitWorkOrder()
 * - Added isCommitting guard with useCallback dependencies
 * - Fixed hooks order violation (moved useCallback before early return)
 * - Added disabled state to status buttons during commits
 * - Integrated runtime camera permission flow
 */
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, TextInput, Image, ScrollView, Alert, Modal, Switch } from "react-native";
import type { WorkItem, WorkStatus, Priority, WorkPhoto } from "../types/workItem";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { deleteWorkItem as deleteWorkItemAction } from "../store/workItemsSlice";
import { commitWorkOrder } from "../state/workOrdersCommit";
import { updateWorkOrder, updateSignDetails, removeWorkOrder } from "../services/workOrdersService";
import { addLog } from "../store/workLogSlice";
import type { WorkLogEntry } from "../types/workLog";
import { uid } from "../utils/uid";

import { launchImageLibrary } from "react-native-image-picker";
import { TypeSpecificDetails } from "./TypeSpecificDetails";
import { requestLocationPermission, getOneLocationFix } from "../native/location";
import PhotoViewerModal from "./PhotoViewerModal";
import { SignMaintenanceSection } from "./SignMaintenanceSection";
import { SignInspectionForm } from "./SignInspectionForm";
import { SignInspectionLite } from "./SignInspectionLite";
import { getWorkLogs, deleteWorkItem as deleteWorkItemFromDb } from "../storage/workRepo";
import { persistAuditLog } from "../utils/audit";
import { transitionStatus } from "../utils/status";
import { capturePhoto } from "../utils/capturePhoto";
import { SIGN_CATALOG } from "../data/signCatalog";
import { getAllSigns, upsertSign } from "../storage/signRepo";
import { findNearbyMatchingSignAsset } from "../services/signDedupe";
import { createSignAsset } from "../utils/createSignAsset";
import ModalSelect, { type ModalSelectItem } from "./ModalSelect";
import { polylineLengthMeters, metersToMiles, metersToFeet } from "../tools/measure/haversine";
import { getNotificationSettings } from "../screens/SettingsScreen";
import { notifyWorkOrderCreated } from "../services/notify";
import { formatWorkType } from "../constants/workOrderTypes";
import { SIGN_TYPES, type SignCategory } from "../constants/signTypes";

type Props = {
  workItemId: string | null;  // Changed from item to workItemId
  onClose: () => void;
};

const statuses: WorkStatus[] = ["needs", "in_progress", "completed", "deferred"];
const priorities: Priority[] = ["no priority", "low", "medium", "high", "urgent"];

// Helper function to display user-friendly status labels
function formatStatus(status: WorkStatus): string {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "needs") return "Needs";
  if (status === "deferred") return "Deferred";
  return status;
}

export default function WorkItemSheet({ workItemId, onClose }: Props) {
  const dispatch = useAppDispatch();

  // ✅ READ LIVE ITEM FROM REDUX BY ID (prevents stale prop issue)
  // This ensures UI always shows the latest state after status updates
  const item = useAppSelector(state => 
    workItemId ? state.workItems.items.find(i => i.id === workItemId) ?? null : null
  );

  const [note, setNote] = useState("");
  const [viewerUri, setViewerUri] = useState<string | null>(null);
  const [showInspection, setShowInspection] = useState(false);
  const [showInspectionForm, setShowInspectionForm] = useState(false);
  
  // DUPLICATE COMMIT PREVENTION:
  // Prevents multiple simultaneous commits when user taps status buttons rapidly.
  // Fixed issue where single status change caused 4x duplicate commits.
  const [isCommitting, setIsCommitting] = useState(false);
  
  // AUDIT LOG PERSISTENCE:
  // Loads work logs from SQLite when sheet opens for historical tracking.
  const [_logs, setLogs] = useState<{ id: string; ts: number; type: string; data?: any }[]>([]);

  // Update showInspection when item changes or loads
  useEffect(() => {
    if (item) {
      setShowInspection(item.inspectionEnabled ?? false);
    }
  }, [item]);

  // STEP D-6: Load audit logs when item opens (must be before null check for hooks)
  useEffect(() => {
    if (!item) return;
    (async () => {
      try {
        const dbLogs = await getWorkLogs(item.id);
        setLogs(dbLogs);
      } catch (e) {
        console.warn("[getWorkLogs] failed", e);
      }
    })();
  }, [item]);

  // ═══════════════════════════════════════════════════════════════════════════
  // ✅ REACT HOOKS ORDER: ALL HOOKS BEFORE EARLY RETURNS
  // ═══════════════════════════════════════════════════════════════════════════
  // This useCallback MUST be declared before the `if (!item) return null;` check.
  // React requires all hooks to run unconditionally in the same order every render.
  // 
  // DEPENDENCIES [item, isCommitting, dispatch]:
  // - item: Status changes depend on current work order state
  // - isCommitting: Guard flag prevents duplicate commits
  // - dispatch: Redux action dispatcher (stable but required by ESLint)
  const setStatus = useCallback(async (status: WorkStatus) => {
    // Guard: Prevent commits if already committing, no item, or status unchanged
    if (!item) {
      console.log("[status] Guard: no item");
      return;
    }
    if (status === item.status) {
      console.log("[status] Guard: status unchanged", status);
      return;
    }
    if (isCommitting) {
      console.log("[status] Guard: already committing");
      return;
    }
    
    console.log("[status] CHANGE START", item.id, "from", item.status, "to", status);
    
    setIsCommitting(true);
    try {
      // Use centralized status transition logic (handles status-specific updates)
      const { updatedItem, logEntry } = transitionStatus(item, status);
      
      console.log("[status] Transition computed:", {
        id: updatedItem.id,
        status: updatedItem.status,
        completedAt: updatedItem.completedAt,
        needsSync: updatedItem.needsSync
      });
      
      // ═══════════════════════════════════════════════════════════════════════
      // SIGN ASSET DEDUPLICATION (When completing sign work orders)
      // ═══════════════════════════════════════════════════════════════════════
      if (status === "completed" && item.type === "sign" && item.lat && item.lng) {
        console.log("[status] Sign work order completing - checking for duplicate sign assets");
        
        // Case 1: Already linked to an existing sign asset (update it)
        if (updatedItem.signAssetId) {
          console.log("[status] Work order already linked to sign asset:", updatedItem.signAssetId);
          // Sign asset update will happen through normal sign maintenance/inspection flows
        } 
        // Case 2: Not linked - search for nearby matching sign to prevent duplicates
        else {
          const allSignAssets = await getAllSigns();
          const match = findNearbyMatchingSignAsset(
            allSignAssets,
            { lat: item.lat, lng: item.lng },
            updatedItem.signDetails
          );
          
          if (match) {
            // Found existing sign nearby - link this work order to it
            console.log("[status] Found nearby matching sign asset:", match.id);
            updatedItem.signAssetId = match.id;
            
            // Update the sign asset with latest details from this work order
            if (updatedItem.signDetails) {
              const updatedSignAsset = {
                ...match,
                mutcdCode: updatedItem.signDetails.code || match.mutcdCode,
                message: updatedItem.signDetails.name || match.message,
                updatedAt: Date.now(),
                needsSync: true,
              };
              await upsertSign(updatedSignAsset);
            }
            
            // Log the linking
            const linkLog: WorkLogEntry = {
              id: uid(),
              workItemId: item.id,
              action: "sign_linked",
              at: Date.now(),
              message: `Linked to existing sign: ${match.message || match.mutcdCode || 'Unknown'}`,
            };
            dispatch(addLog(linkLog));
            persistAuditLog(item.id, "sign_linked", { signAssetId: match.id }).catch(console.warn);
          } 
          // No match found - create new sign asset
          else {
            console.log("[status] No nearby sign found - creating new sign asset");
            const newSignAsset = {
              ...createSignAsset(
                "other", // Default sign type, can be enhanced later
                item.lat,
                item.lng,
                {
                  mutcdCode: updatedItem.signDetails?.code || undefined,
                  message: updatedItem.signDetails?.name || undefined,
                }
              ),
              id: uid(),
              createdAt: Date.now(),
              updatedAt: Date.now(),
              needsSync: true,
            };
            
            // Save new sign asset
            await upsertSign(newSignAsset);
            
            // Link work order to new sign asset
            updatedItem.signAssetId = newSignAsset.id;
            
            // Log the creation
            const createLog: WorkLogEntry = {
              id: uid(),
              workItemId: item.id,
              action: "sign_created",
              at: Date.now(),
              message: `Created new sign: ${newSignAsset.message || newSignAsset.mutcdCode || 'Unknown'}`,
            };
            dispatch(addLog(createLog));
            persistAuditLog(item.id, "sign_created", { signAssetId: newSignAsset.id }).catch(console.warn);
          }
        }
      }
      // ═══════════════════════════════════════════════════════════════════════
      
      // SINGLE COMMIT PATH: Updates both Redux (memory) + SQLite (disk) atomically
      await commitWorkOrder(updatedItem, dispatch, "update");
      
      console.log("[status] CHANGE COMPLETE", updatedItem.id, "status=", updatedItem.status);
      
      // Add log entry to Redux
      dispatch(addLog(logEntry));
      
      // Update local logs state for immediate UI
      setLogs((prev) => [{
        id: logEntry.id,
        ts: logEntry.at,
        type: logEntry.action,
        data: { message: logEntry.message },
      }, ...prev]);
    } finally {
      setIsCommitting(false);
    }
  }, [item, isCommitting, dispatch]);

  // Helper function to patch work order details (must be useCallback to avoid hooks violation)
  const patchWorkOrder = useCallback(async (patch: Partial<WorkItem>) => {
    if (!item) return;
    const updated = { ...item, ...patch, needsSync: true, updatedAt: Date.now(), lastActionAt: Date.now() };
    await commitWorkOrder(updated, dispatch, "update");
  }, [item, dispatch]);

  // ✅ Now safe to early return
  if (!item) return null;

  const photos = item.photos ?? [];

  // Prepare sign type items for modal selector
  const signTypeItems: ModalSelectItem[] = SIGN_CATALOG.map((s, idx) => {
    const key = `${s.category}-${s.code ?? s.name}-${idx}`; // Use category + code + index for uniqueness
    const label = s.code ? `${s.name} (${s.code})` : s.name;
    return {
      key,
      label,
      search: `${s.name} ${s.code ?? ""} ${s.category}`.toLowerCase(),
    };
  });

  const writeLog = (entry: Omit<WorkLogEntry, "id" | "at">) => {
    const id = uid();
    const at = Date.now();
    dispatch(addLog({ id, at, ...entry }));
    
    // STEP D-5: Also persist to DB
    persistAuditLog(entry.workItemId, entry.action, { message: entry.message }).catch((e) => {
      console.warn("[persistAuditLog] failed", e);
    });

    // Add to local logs state for immediate UI update
    setLogs((prev) => [{ id, ts: at, type: entry.action, data: { message: entry.message } }, ...prev]);
  };

  const setPriority = async (priority: Priority) => {
    if (priority === item.priority) return;
    updateWorkOrder({ id: item.id, priority });
    writeLog({ workItemId: item.id, action: "priority_changed", message: `Priority: ${item.priority} → ${priority}` });
  };

  const addQuickNote = async () => {
    const trimmed = note.trim();
    if (!trimmed) return;
    const updatedNotes = (item.notes ? item.notes + "\n\n" : "") + trimmed;
    updateWorkOrder({ id: item.id, note: updatedNotes });
    writeLog({ workItemId: item.id, action: "note_added", message: `Note added: "${trimmed.length > 80 ? trimmed.slice(0, 80) + "…" : trimmed}"` });
    setNote("");
  };

  async function buildPhoto(asset: any, source: "camera" | "gallery"): Promise<WorkPhoto> {
    // GPS tag (best-effort)
    const ok = await requestLocationPermission();
    const fix = ok ? await getOneLocationFix() : null;

    return {
      id: uid(),
      uri: asset.uri,
      width: asset.width ?? null,
      height: asset.height ?? null,
      fileName: asset.fileName ?? null,
      mimeType: asset.type ?? null,
      fileSize: asset.fileSize ?? null,
      createdAt: Date.now(),
      source,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracyM: fix?.accuracyM ?? null,
    };
  }

  async function addPhotoFromCamera() {
    const result = await capturePhoto();
    if (!result) return;

    // Get GPS location for photo metadata
    const ok = await requestLocationPermission();
    const fix = ok ? await getOneLocationFix() : null;

    const photo: WorkPhoto = {
      id: uid(),
      uri: result.localUri,
      width: result.width ?? null,
      height: result.height ?? null,
      fileName: null,
      mimeType: "image/jpeg",
      fileSize: null,
      createdAt: Date.now(),
      source: "camera",
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      accuracyM: fix?.accuracyM ?? null,
    };

    const newPhotos = [photo, ...photos];
    const updated: WorkItem = { ...item, photos: newPhotos, lastActionAt: Date.now(), needsSync: true, updatedAt: Date.now() };
    await commitWorkOrder(updated, dispatch, "update");

    writeLog({
      workItemId: item.id,
      action: "photo_added",
      message: `Photo added (camera)${photo.lat ? ` @ ${photo.lat.toFixed(5)}, ${photo.lng?.toFixed(5)}` : ""}`,
    });
  }

  async function addPhotoFromGallery() {
    const res = await launchImageLibrary({
      mediaType: "photo",
      selectionLimit: 1,
    });

    if (res.didCancel) return;
    if (res.errorCode) {
      Alert.alert("Gallery error", `${res.errorCode}: ${res.errorMessage ?? ""}`);
      return;
    }
    const asset = res.assets?.[0];
    if (!asset?.uri) return;

    const photo = await buildPhoto(asset, "gallery");
    const newPhotos = [photo, ...photos];

    const updated: WorkItem = { ...item, photos: newPhotos, lastActionAt: Date.now(), needsSync: true, updatedAt: Date.now() };
    await commitWorkOrder(updated, dispatch, "update");

    writeLog({
      workItemId: item.id,
      action: "photo_added",
      message: `Photo added (gallery)${photo.lat ? ` @ ${photo.lat.toFixed(5)}, ${photo.lng?.toFixed(5)}` : ""}`,
    });
  }

  // Handle "Submit Work Order" - triggers notification for high/urgent work orders
  const handleSubmit = async () => {
    if (!item) return;

    // Check if this is a high/urgent work order and send notification
    const isHighPriority = item.priority === "high" || item.priority === "urgent";
    if (isHighPriority) {
      try {
        const settings = await getNotificationSettings();
        const typeEnabled = settings.notifyTypes?.[item.type] === true;
        
        console.log("[WorkItemSheet] Notification check:", {
          enabled: settings.notifyHighUrgentOnCreate,
          priority: item.priority,
          type: item.type,
          typeEnabled,
        });
        
        if (settings.notifyHighUrgentOnCreate && typeEnabled) {
          const title = `${item.priority.toUpperCase()} Priority Work Order`;
          const body = `${formatWorkType(item.type)} • ${item.title ?? "New work order"}`;
          console.log("[WorkItemSheet] Sending notification on submit:", title, body);
          await notifyWorkOrderCreated(title, body);
          console.log("[WorkItemSheet] Notification sent for", item.id);
        } else if (!typeEnabled) {
          console.log("[WorkItemSheet] Notification skipped - type not enabled:", item.type);
        }
      } catch (e) {
        console.warn("[WorkItemSheet] Failed to send notification:", e);
      }
    }

    onClose();
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Work Order",
      "Are you sure you want to delete this work order? This cannot be undone.",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            // Delete from SQLite (will trigger emitDbChanged)
            removeWorkOrder(item.id);
            
            // Delete from Redux (for backwards compatibility during migration)
            dispatch(deleteWorkItemAction(item.id));
            
            // Close sheet
            onClose();
          },
        },
      ]
    );
  };

  return (
    <>
      <Modal
        visible={true}
        animationType="slide"
        transparent={true}
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <View style={styles.container}>
            <ScrollView contentContainerStyle={styles.content}>
              <Text style={styles.title}>{item.title ?? item.type}</Text>
              <Text style={styles.sub}>{item.type} • {formatStatus(item.status)} • {item.priority}</Text>
              
              {/* Show line length for line geometry */}
              {item.geometry.kind === "line" && (
                <View style={styles.lineInfo}>
                  <Text style={styles.lineInfoText}>
                    📏 Line length: {(() => {
                      const meters = polylineLengthMeters(item.geometry.coordinates);
                      const miles = metersToMiles(meters);
                      const feet = metersToFeet(meters);
                      if (miles >= 0.1) return `${miles.toFixed(2)} miles`;
                      return `${Math.round(feet)} feet`;
                    })()} ({item.geometry.coordinates.length} points)
                  </Text>
                </View>
              )}

              <View style={styles.block}>
                <Text style={styles.h}>Photos</Text>
                <View style={styles.row}>
                  <Pressable onPress={addPhotoFromCamera} style={styles.button}>
                    <Text style={styles.buttonText}>Take Photo</Text>
                  </Pressable>
                  <Pressable onPress={addPhotoFromGallery} style={styles.buttonAlt}>
                    <Text style={styles.buttonAltText}>Add from Library</Text>
                  </Pressable>
                </View>

                {photos.length === 0 ? (
                  <Text style={styles.muted}>No photos yet.</Text>
                ) : (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingVertical: 8 }}>
                    {photos.map(p => (
                      <Pressable key={p.id} onPress={() => setViewerUri(p.uri)} style={styles.thumbWrap}>
                        <Image source={{ uri: p.uri }} style={styles.thumb} />
                        <Text style={styles.thumbText}>
                          {p.source}{p.lat ? ` • GPS` : ""}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                )}
              </View>

              <View style={styles.block}>
                <Text style={styles.h}>Status</Text>
                <View style={styles.row}>
                  {statuses.map(s => (
                    <Pressable 
                      key={s} 
                      onPress={() => setStatus(s)} 
                      disabled={isCommitting}
                      style={[styles.pill, item.status === s && styles.pillOn, isCommitting && styles.pillDisabled]}
                    >
                      <Text style={[styles.pillText, item.status === s && styles.pillTextOn]}>{formatStatus(s)}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              <View style={styles.block}>
                <Text style={styles.h}>Priority</Text>
                <View style={styles.row}>
                  {priorities.map(p => (
                    <Pressable key={p} onPress={() => setPriority(p)} style={[styles.pill, item.priority === p && styles.pillOn]}>
                      <Text style={[styles.pillText, item.priority === p && styles.pillTextOn]}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>

              {/* Type-Specific Maintenance Details */}
              <TypeSpecificDetails item={item} patchWorkOrder={patchWorkOrder} />

              {/* Sign Details Section - Inline Dropdown Picker */}
              {item.type === "sign" && (
                <View style={styles.block}>
                  <Text style={styles.h}>Sign Details</Text>
                  
                  {/* Linked Sign Asset Indicator */}
                  {item.signAssetId && (
                    <View style={styles.linkedSignHint}>
                      <Text style={styles.linkedSignText}>
                        🔗 Linked to Sign Asset: {item.signAssetId.substring(0, 8)}...
                      </Text>
                    </View>
                  )}
                  
                  {/* Sign Type Picker */}
                  <ModalSelect
                    title="Sign Type"
                    placeholder="Select a sign type..."
                    valueLabel={item.signDetails?.name 
                      ? (item.signDetails.code ? `${item.signDetails.name} (${item.signDetails.code})` : item.signDetails.name)
                      : null
                    }
                    items={signTypeItems}
                    onSelect={async (key) => {
                      const picked = SIGN_CATALOG.find(s => (s.code ?? s.name) === key);
                      if (!picked) return;

                      const updated = {
                        ...item,
                        signDetails: {
                          ...item.signDetails,
                          category: picked.category,
                          code: picked.code,
                          name: picked.name,
                          value: picked.needsValue ? item.signDetails?.value ?? null : null,
                        },
                        lastActionAt: Date.now(),
                        needsSync: true,
                        updatedAt: Date.now(),
                      };
                      await commitWorkOrder(updated, dispatch, "update");
                      
                      // Log the update
                      writeLog({
                        workItemId: item.id,
                        action: "sign_details_updated",
                        message: `Sign type set: ${picked.name} (${picked.code})`,
                      });
                    }}
                  />

                  {/* Value Input (for signs that need values like Speed Limit) */}
                  {item.signDetails?.code && 
                   SIGN_CATALOG.find(s => s.code === item.signDetails?.code)?.needsValue && (
                    <View style={styles.signValueRow}>
                      <Text style={styles.signValueLabel}>Value</Text>
                      <TextInput
                        style={styles.signValueInput}
                        placeholder="e.g., 35"
                        placeholderTextColor="#94a3b8"
                        value={item.signDetails?.value ?? ""}
                        onChangeText={async (text) => {
                          const updated = {
                            ...item,
                            signDetails: {
                              ...item.signDetails!,
                              value: text,
                            },
                            lastActionAt: Date.now(),
                            needsSync: true,
                            updatedAt: Date.now(),
                          };
                          await commitWorkOrder(updated, dispatch, "update");
                        }}
                        keyboardType="numeric"
                      />
                    </View>
                  )}

                  {/* Notes Input */}
                  {item.signDetails?.name && (
                    <View style={styles.signNotesRow}>
                      <Text style={styles.signNotesLabel}>Sign Notes</Text>
                      <TextInput
                        style={styles.signNotesInput}
                        placeholder="Additional details (size, mounting, etc.)"
                        placeholderTextColor="#94a3b8"
                        value={item.signDetails?.notes ?? ""}
                        onChangeText={async (text) => {
                          const updated = {
                            ...item,
                            signDetails: {
                              ...item.signDetails!,
                              notes: text,
                            },
                            lastActionAt: Date.now(),
                            needsSync: true,
                            updatedAt: Date.now(),
                          };
                          await commitWorkOrder(updated, dispatch, "update");
                        }}
                        multiline
                        numberOfLines={2}
                      />
                    </View>
                  )}
                </View>
              )}

              {/* Sign Inspection Section - Simplified 1-10 Scales */}
              {item.type === "sign" && (
                <View style={styles.block}>
                  <View style={styles.inspectionToggle}>
                    <Text style={styles.h}>Sign Inspection</Text>
                    <Switch
                      value={showInspection}
                      onValueChange={(val) => setShowInspection(val)}
                    />
                  </View>
                  
                  {showInspection && (
                    <SignInspectionLite
                      item={item}
                      onUpdate={async (inspectionData) => {
                        const updated = {
                          ...item,
                          signInspectionLite: inspectionData,
                          lastActionAt: Date.now(),
                          needsSync: true,
                          updatedAt: Date.now(),
                        };
                        await commitWorkOrder(updated, dispatch, "update");
                        
                        writeLog({
                          workItemId: item.id,
                          action: "sign_details_updated",
                          message: `Inspection updated: R:${inspectionData.reflectivity} D:${inspectionData.delamination} A:${inspectionData.appearance} P:${inspectionData.postCondition}`,
                        });
                      }}
                    />
                  )}
                </View>
              )}

              {/* Enhanced Sign Details with Category Grouping */}
              {item.type === "sign" && (
                <View style={styles.block}>
                  <Text style={styles.sectionTitle}>Sign Type & Action</Text>

                  {/* Sign Type Picker - Category Grouped */}
                  <Text style={styles.fieldLabel}>Sign Type</Text>
                  <ScrollView style={styles.signTypeScroll} nestedScrollEnabled>
                    {["Regulatory", "Warning", "Guide", "Construction", "School", "Railroad", "Other"].map((category) => {
                      const categoryOptions = SIGN_TYPES.filter(st => st.category === category);
                      if (categoryOptions.length === 0) return null;
                      
                      return (
                        <View key={category} style={styles.categoryGroup}>
                          <Text style={styles.categoryTitle}>{category}</Text>
                          {categoryOptions.map((sign) => (
                            <Pressable
                              key={sign.id}
                              style={[
                                styles.signOption,
                                item.signDetails?.signTypeId === sign.id && styles.signSelected,
                              ]}
                              onPress={async () => {
                                updateSignDetails({
                                  workOrderId: item.id,
                                  signTypeId: sign.id,
                                  category: sign.category,
                                });
                              }}
                            >
                              <View style={styles.signOptionContent}>
                                <Text style={styles.signOptionLabel}>{sign.label}</Text>
                                {sign.mutcdCode && (
                                  <Text style={styles.signOptionCode}>{sign.mutcdCode}</Text>
                                )}
                              </View>
                              {item.signDetails?.signTypeId === sign.id && (
                                <Text style={styles.checkmark}>✓</Text>
                              )}
                            </Pressable>
                          ))}
                        </View>
                      );
                    })}
                  </ScrollView>

                  {/* Condition Picker */}
                  <Text style={styles.fieldLabel}>Condition</Text>
                  <View style={styles.conditionRow}>
                    {(["Good", "Faded", "Damaged", "Missing"] as const).map((c) => (
                      <Pressable
                        key={c}
                        style={[
                          styles.conditionButton,
                          item.signDetails?.condition?.toLowerCase() === c.toLowerCase() && styles.conditionButtonActive,
                        ]}
                        onPress={async () => {
                          updateSignDetails({
                            workOrderId: item.id,
                            condition: c.toLowerCase() as any,
                          });
                        }}
                      >
                        <Text style={[
                          styles.conditionButtonText,
                          item.signDetails?.condition?.toLowerCase() === c.toLowerCase() && styles.conditionButtonTextActive,
                        ]}>
                          {c}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Action Picker */}
                  <Text style={styles.fieldLabel}>Action Needed</Text>
                  <View style={styles.conditionRow}>
                    {(["Replace", "Repair", "Clean", "Install"] as const).map((a) => (
                      <Pressable
                        key={a}
                        style={[
                          styles.conditionButton,
                          item.signDetails?.action === a && styles.conditionButtonActive,
                        ]}
                        onPress={async () => {
                          updateSignDetails({
                            workOrderId: item.id,
                            action: a,
                          });
                        }}
                      >
                        <Text style={[
                          styles.conditionButtonText,
                          item.signDetails?.action === a && styles.conditionButtonTextActive,
                        ]}>
                          {a}
                        </Text>
                      </Pressable>
                    ))}
                  </View>

                  {/* Reflectivity/Notes Toggle */}
                  <View style={styles.toggleRow}>
                    <Text style={styles.toggleLabel}>Reflectivity Issue</Text>
                    <Switch
                      value={!!item.signDetails?.reflectivityIssue}
                      onValueChange={async (v) => {
                        updateSignDetails({
                          workOrderId: item.id,
                          reflectivityIssue: v,
                        });
                      }}
                      trackColor={{ false: "#ccc", true: "#81c784" }}
                      thumbColor={item.signDetails?.reflectivityIssue ? "#4caf50" : "#999"}
                    />
                  </View>

                  {/* Sign notes go in main work order notes field above */}
                </View>
              )}

              <View style={styles.buttonRow}>
                <Pressable onPress={handleSubmit} style={styles.submitBtn}>
                  <Text style={styles.submitText}>Submit Work Order</Text>
                </Pressable>
                <Pressable onPress={handleDelete} style={styles.deleteBtn}>
                  <Text style={styles.deleteText}>Delete</Text>
                </Pressable>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      <PhotoViewerModal uri={viewerUri} onClose={() => setViewerUri(null)} />

      {/* Sign Inspection Form Modal */}
      {item.type === "sign" && (
        <Modal 
          visible={showInspectionForm} 
          animationType="slide" 
          onRequestClose={() => setShowInspectionForm(false)}
        >
          <SignInspectionForm
            onSubmit={async (data) => {
              const updated = { ...item, signInspection: data, lastActionAt: Date.now(), needsSync: true, updatedAt: Date.now() };
              await commitWorkOrder(updated, dispatch, "update");
              writeLog({
                workItemId: item.id,
                action: "sign_inspection_completed",
                message: `Sign inspection: ${data.retroResult}`
              });
              setShowInspectionForm(false);
            }}
            onCancel={() => setShowInspectionForm(false)}
          />
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(0, 0, 0, 0.5)", justifyContent: "flex-end" },
  container: { backgroundColor: "white", borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "85%" },
  content: { padding: 14, gap: 12 },
  title: { fontSize: 20, fontWeight: "900" },
  sub: { fontSize: 12, opacity: 0.7 },

  block: { gap: 8 },
  h: { fontWeight: "900" },
  sectionTitle: { fontSize: 18, fontWeight: "800", marginBottom: 8 },
  row: { flexDirection: "row", flexWrap: "wrap", gap: 10 },

  button: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#1f2937" },
  buttonText: { color: "white", fontWeight: "900" },
  buttonAlt: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: "#f1f5f9", borderWidth: 1, borderColor: "#e2e8f0" },
  buttonAltText: { fontWeight: "900" },

  muted: { opacity: 0.7 },

  thumbWrap: { width: 110, gap: 6 },
  thumb: { width: 110, height: 80, borderRadius: 10, backgroundColor: "#e2e8f0" },
  thumbText: { fontSize: 11, opacity: 0.75 },

  pill: { paddingVertical: 7, paddingHorizontal: 10, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" },
  pillOn: { backgroundColor: "#111827", borderColor: "#111827" },
  pillDisabled: { opacity: 0.5 },
  pillText: { fontSize: 12 },
  pillTextOn: { color: "white" },

  input: { borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, padding: 10, minHeight: 70, textAlignVertical: "top" },
  addNote: { padding: 12, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" },
  addNoteText: { color: "white", fontWeight: "900" },

  buttonRow: { flexDirection: "row", gap: 10 },
  submitBtn: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#111827", alignItems: "center" },
  submitText: { fontWeight: "900", color: "white" },
  deleteBtn: { flex: 1, padding: 10, borderRadius: 12, backgroundColor: "#fee2e2", borderWidth: 1, borderColor: "#fca5a5", alignItems: "center" },
  deleteText: { fontWeight: "900", color: "#991b1b" },

  inspectionToggle: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  inspectionContent: { marginTop: 8, gap: 8 },
  inspectionNote: { fontSize: 13, opacity: 0.7, fontStyle: "italic" },
  inspectionButton: { padding: 12, borderRadius: 12, backgroundColor: "#3b82f6", alignItems: "center" },
  inspectionButtonText: { color: "white", fontWeight: "900" },
  inspectionStatus: { fontSize: 13, opacity: 0.7, marginTop: 4 },

  // Sign Details - Inline Dropdown Styles
  signTypeRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    backgroundColor: "#f8fafc",
  },

  signValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  signValueLabel: { fontSize: 14, fontWeight: "700", color: "#64748b", minWidth: 50 },
  signValueInput: {
    flex: 1,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 14,
    backgroundColor: "white",
  },

  signNotesRow: {
    marginTop: 8,
    gap: 6,
  },
  signNotesLabel: { fontSize: 14, fontWeight: "700", color: "#64748b" },
  signNotesInput: {
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    fontSize: 14,
    backgroundColor: "white",
    minHeight: 60,
    textAlignVertical: "top",
  },

  // Linked Sign Asset Indicator
  linkedSignHint: {
    backgroundColor: "#dbeafe",
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
    padding: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  linkedSignText: {
    fontSize: 13,
    color: "#1e40af",
    fontWeight: "600",
  },
  lineInfo: {
    marginTop: 8,
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#fef3c7",
    borderWidth: 1,
    borderColor: "#fde047",
  },
  lineInfoText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#854d0e",
  },

  // Enhanced Sign Details Styles
  signTypeScroll: {
    maxHeight: 250,
    marginTop: 8,
    marginBottom: 16,
  },
  categoryGroup: {
    marginBottom: 12,
  },
  categoryTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#64748b",
    textTransform: "uppercase",
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  signOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
    backgroundColor: "white",
  },
  signSelected: {
    backgroundColor: "#dbeafe",
    borderLeftWidth: 3,
    borderLeftColor: "#3b82f6",
  },
  signOptionContent: {
    flex: 1,
  },
  signOptionLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  signOptionCode: {
    fontSize: 12,
    color: "#64748b",
    marginTop: 2,
  },
  checkmark: {
    fontSize: 18,
    color: "#3b82f6",
    fontWeight: "700",
  },
  fieldLabel: {
    fontSize: 14,
    fontWeight: "700",
    color: "#111827",
    marginTop: 16,
    marginBottom: 8,
  },
  conditionRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 8,
  },
  conditionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  conditionButtonActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  conditionButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  conditionButtonTextActive: {
    color: "white",
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginTop: 8,
  },
  toggleLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  notesInput: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    fontSize: 14,
    backgroundColor: "white",
    minHeight: 80,
    textAlignVertical: "top",
    color: "#111827",
  },
});
