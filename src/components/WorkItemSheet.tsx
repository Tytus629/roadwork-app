/**
 * WorkItemSheet.tsx
 * 
 * PURPOSE:
 * Modal sheet for viewing and editing work order details.
 * Appears when user taps a pin on the map or opens a work order from list views.
 * 
 * KEY FEATURES:
 * - Edit status (Needs Work/In Progress/Completed/Archived) and priority (None/Low/Medium/High/Urgent)
 * - For Sign work orders: Sign type picker, condition, action needed, inspection sheet
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
 *    - Inspection Sheet controls
 * 4. Note text area (at bottom, below sign details)
 * 5. Delete button
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Modal,
  Image,
  StyleSheet,
} from "react-native";
import { launchCamera, launchImageLibrary } from "react-native-image-picker";
import type { Asset as PickerAsset } from "react-native-image-picker";
import type { Priority, WorkStatus } from "../db/types";
import { SignTypePickerModal } from "./SignTypePickerModal";
import { getSignTypeById } from "../utils/signTypeLookup";
import { useWorkOrder } from "../hooks/useWorkOrder";
import { getSignDetailsByWorkOrderId } from "../db/workOrdersRepo";
import { workOrdersService, updateSignDetails, removeWorkOrder } from "../services/workOrdersService";
import { formatWorkType, normalizeWorkTypeKey } from "../constants/workOrderTypes";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";
import { focusMapOnWorkOrder } from "../state/MapFocusEvents";
import { useOrg } from "../state/OrgContext";
import { useNavigation } from "@react-navigation/native";
import type {
  CulvertDetails,
  WorkType,
  WorkPhoto,
  GuardrailDetails,
  PavementRepairDetails,
} from "../types/workItem";
import { getWorkOrderCenter, isValidMapCoord } from "../utils/workOrderGeo";
import { getTypeGroup } from "../workOrders/typeGroups";
import GuardrailDetailsEditor from "./GuardrailDetailsEditor";
import CulvertDetailsEditor from "./CulvertDetailsEditor";
import PavementRepairDetailsEditor from "./PavementRepairDetailsEditor";
import {
  isPavementRepairType,
  normalizePavementRepairDetails,
} from "../workOrders/pavementDetails";
import { normalizeSignEntries } from "../utils/signAssetDetails";
import { PHOTO_FEATURE_ENABLED } from "../constants/featureFlags";
import { requestCameraPermission, requestPhotoLibraryPermission } from "../native/photos";
import {
  addWorkOrderPhoto,
  getWorkOrderPhotoDevDiagnostics,
  getRemoteWorkOrderPhotos,
  getWorkOrderPhotos,
  removeWorkOrderPhoto,
} from "../services/workOrderPhotosService";
import { formatWorkOrderCreator } from "../utils/workOrderCreator";
import {
  hasRolePermission,
  permissionDeniedMessage,
  type RolePermission,
} from "../permissions/rolePermissions";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";

export type DraftWorkOrder = {
  type: WorkType;
  point?: { lat: number; lng: number };
  points?: { lat: number; lng: number }[];
  linkedAssetId?: string | null;
  linkedAssetType?: "SIGN" | "GUARDRAIL" | "CULVERT" | null;
  status: WorkStatus;
  priority: Priority;
  note?: string | null;
  photos?: WorkPhoto[];
  details?: PavementRepairDetails | Record<string, any> | null;
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
const STATUS_OPTIONS: Array<{ value: WorkStatus; label: string }> = [
  { value: "Needs", label: "Needs Work" },
  { value: "In Progress", label: "In Progress" },
  { value: "Done", label: "Completed" },
  { value: "Deferred", label: "Archived" },
];
const PRIORITY: Priority[] = ["None", "Low", "Medium", "High", "Urgent"];
const SIGN_CONDITION = ["Good", "Faded", "Damaged", "Missing"] as const;
const SIGN_ACTION = ["None", "Replace", "Repair", "Clean", "Install"] as const;
const BRUSHING_ACTION = [
  "Cut / Trim Brush",
  "Limb Trees",
  "Remove Small Trees",
  "Bucket Truck Required",
  "Wood Chipper",
  "Haul Debris",
] as const;
const DITCHING_ACTION = [
  "None",
  "Clean / Reshape Ditch",
  "Remove Silt",
  "Open Outlet",
  "Regrade Shoulder",
  "Erosion Control",
  "Excavator Required",
] as const;

function prettifyKey(raw: string): string {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function detailValueToText(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") return v.trim() || null;
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : null;
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (Array.isArray(v)) return v.length ? `${v.length} item(s)` : null;
  if (typeof v === "object") {
    const keys = Object.keys(v as Record<string, unknown>);
    return keys.length ? `${keys.length} field(s)` : null;
  }
  return null;
}

function buildDetailsSummaryRows(details: unknown): Array<{ label: string; value: string }> {
  if (!details || typeof details !== "object") return [];

  const rows: Array<{ label: string; value: string }> = [];
  const d = details as Record<string, unknown>;

  for (const [key, value] of Object.entries(d)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const childObj = value as Record<string, unknown>;
      for (const [childKey, childValue] of Object.entries(childObj)) {
        const text = detailValueToText(childValue);
        if (!text) continue;
        rows.push({
          label: `${prettifyKey(key)} - ${prettifyKey(childKey)}`,
          value: text,
        });
      }
      continue;
    }

    const text = detailValueToText(value);
    if (!text) continue;
    rows.push({ label: prettifyKey(key), value: text });
  }

  return rows;
}

function buildPhotoFromPicker(asset: PickerAsset | undefined, source: "camera" | "gallery"): WorkPhoto | null {
  if (!asset) return null;
  const uri = asset.uri?.trim();
  if (!uri) return null;

  return {
    id: `${source}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    uri,
    width: asset.width ?? null,
    height: asset.height ?? null,
    fileName: asset.fileName ?? null,
    mimeType: asset.type ?? null,
    fileSize: asset.fileSize ?? null,
    createdAt: Date.now(),
    source,
  };
}

/**
 * Chip component: Toggle-able button with active state
 * Active chips show "✓ Label" and have dark background
 */
function Chip({
  label,
  active,
  onPress,
  disabled,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]}
    >
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
  const { orgId, role } = useOrg();
  
  // For existing work orders, fetch from DB
  const workItemId = props.mode === "existing" ? props.workItemId : null;
  const dbWorkOrder = useWorkOrder(workItemId, orgId);
  
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
        details: localDraft.details ?? null,
      };
    }
    return dbWorkOrder;
  }, [isDraft, localDraft, dbWorkOrder]);
  
  const typeGroup = getTypeGroup(wo?.type);
  const isSign = typeGroup === "sign";
  const isGuardrail = typeGroup === "guardrail";
  const isCulvert = typeGroup === "culvert";
  const isPavement = typeGroup === "pavement" || isPavementRepairType(wo?.type);
  const typeKey = String(normalizeWorkTypeKey(wo?.type) || "").toLowerCase();
  const isBrushing = typeKey === "brushing";
  const genericActionOptions: readonly string[] | null =
    isBrushing
      ? BRUSHING_ACTION
      : typeKey === "ditching"
      ? DITCHING_ACTION
      : null;
  const brushingActionNeeded: string[] = (() => {
    if (!isBrushing) return [];
    const details = wo?.details;
    if (!details || typeof details !== "object" || Array.isArray(details)) return [];
    const d = details as Record<string, any>;

    const fromList = Array.isArray(d.actionNeededList)
      ? d.actionNeededList
          .map((x: unknown) => String(x ?? "").trim())
          .filter(Boolean)
      : [];

    if (fromList.length) {
      return Array.from(new Set(fromList));
    }

    const legacySingle = String(d.actionNeeded ?? "").trim();
    return legacySingle ? [legacySingle] : [];
  })();
  const genericActionNeeded: string | null = (() => {
    const details = wo?.details;
    if (!details || typeof details !== "object" || Array.isArray(details)) return null;
    const raw = String((details as Record<string, any>).actionNeeded ?? "").trim();
    return raw || null;
  })();
  const canCreateWorkOrder = hasRolePermission("createWorkOrder", role);
  const canEditWorkOrder = hasRolePermission("editWorkOrder", role);
  const canChangeStatusPriority = hasRolePermission("changeStatusPriority", role);
  const canDeleteWorkOrder = hasRolePermission("deleteWorkOrder", role);
  const canAddPhotos = hasRolePermission("addWorkOrderPhoto", role);
  const canEditCurrentWorkOrder = isDraft ? canCreateWorkOrder : canEditWorkOrder;
  const normalizedWoPavement = useMemo(
    () => normalizePavementRepairDetails(wo?.details),
    [wo?.details],
  );
  const normalizedWoPavementKey = useMemo(
    () => JSON.stringify(normalizedWoPavement ?? null),
    [normalizedWoPavement],
  );
  const culvertHasLineGeometry = useMemo(() => {
    if (isDraft) return (localDraft?.points?.length ?? 0) >= 2;
    if (!wo || (wo as any)?.geomType !== "line") return false;

    // Existing rows from db/workOrdersRepo expose lineJson; parse it for line geometry checks.
    const directLine = (wo as any)?.line;
    if (Array.isArray(directLine)) return directLine.length >= 2;

    const lineJson = (wo as any)?.lineJson;
    if (typeof lineJson !== "string" || !lineJson.trim()) return false;

    try {
      const parsed = JSON.parse(lineJson);
      return Array.isArray(parsed) && parsed.length >= 2;
    } catch {
      return false;
    }
  }, [isDraft, localDraft?.points, wo]);

  const [noteDraft, setNoteDraft] = useState("");
  const [signDetails, setSignDetails] = useState<ReturnType<typeof getSignDetailsByWorkOrderId>>(null);
  const [dbTick, setDbTick] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [existingPhotos, setExistingPhotos] = useState<WorkPhoto[]>([]);
  const [remotePhotos, setRemotePhotos] = useState<WorkPhoto[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreviewUri, setPhotoPreviewUri] = useState<string | null>(null);
  const [latestRemoteFetchOutcome, setLatestRemoteFetchOutcome] = useState<{
    status: "idle" | "success" | "failed";
    at: number | null;
    message: string;
  }>({ status: "idle", at: null, message: "" });
  const diagnosticsAssetId = isDraft
    ? localDraft?.linkedAssetId ?? ""
    : ((wo as any)?.assetId ?? "");

  useEffect(() => {
    const routeState = isDraft ? "draft" : "existing";
    const routeWorkOrderId = isDraft ? "draft" : workItemId;
    setCustomKeySafe("routeName", "WorkItemSheet");
    setCustomKeySafe("workOrderId", routeWorkOrderId ?? "");
    setCustomKeySafe("assetId", diagnosticsAssetId);
    setCustomKeySafe("assetType", isDraft ? localDraft?.linkedAssetType ?? "" : "");
    logSyncBreadcrumb("work item sheet mounted", {
      routeName: "WorkItemSheet",
      routeState,
      workOrderId: routeWorkOrderId ?? null,
      workType: isDraft ? localDraft?.type ?? null : wo?.type ?? null,
      assetId: diagnosticsAssetId || null,
      assetType: isDraft ? localDraft?.linkedAssetType ?? null : null,
    });
  }, [diagnosticsAssetId, isDraft, localDraft?.linkedAssetType, localDraft?.type, workItemId, wo?.type]);

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

  // ── Guardrail Details state (parts inventory stored in wo.details) ──
  const [guardrailInitial, setGuardrailInitial] = useState<GuardrailDetails | undefined>(undefined);

  // ── Culvert Details state (condition and drainage findings in wo.details) ──
  const [culvertInitial, setCulvertInitial] = useState<CulvertDetails | undefined>(undefined);

  // ── Pavement Repair Details state (structured repair data in wo.details) ──
  const [pavementInitial, setPavementInitial] = useState<PavementRepairDetails | undefined>(undefined);

  // Hydrate guardrail / sign details state when wo.details changes
  useEffect(() => {
    if (!wo) return;
    const d = wo.details as Record<string, any> | null | undefined;
    if (isGuardrail || (d as GuardrailDetails | undefined)?.parts) {
      setGuardrailInitial((d as GuardrailDetails) ?? undefined);
    }
    const culvertCandidate = d as CulvertDetails | undefined;
    if (
      isCulvert ||
      culvertCandidate?.issue ||
      culvertCandidate?.plugged != null ||
      culvertCandidate?.endsCrushed != null ||
      culvertCandidate?.separationNeedsRepair != null ||
      culvertCandidate?.inletBlocked != null ||
      culvertCandidate?.outletBlocked != null ||
      culvertCandidate?.captureInletOutletFromLine != null
    ) {
      setCulvertInitial(culvertCandidate ?? undefined);
    }
    if (isPavement || normalizedWoPavement) {
      setPavementInitial((prev) => {
        const prevKey = JSON.stringify(normalizePavementRepairDetails(prev) ?? null);
        if (prevKey === normalizedWoPavementKey) return prev;
        if (__DEV__) {
          console.log("[WorkItemSheet] pavement-initial-sync", {
            workOrderId: wo.id,
            nextKey: normalizedWoPavementKey,
          });
        }
        return normalizedWoPavement;
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wo?.id, wo?.details, normalizedWoPavement, normalizedWoPavementKey]);

  // ── Guardrail save handler ──
  function handleGuardrailSave(details: GuardrailDetails | undefined) {
    if (!canEditCurrentWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage(isDraft ? "createWorkOrder" : "editWorkOrder"));
      return;
    }

    const normalized = details ?? null;
    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;

        const prevSerialized = JSON.stringify(prev.details ?? null);
        const nextSerialized = JSON.stringify(normalized);
        if (prevSerialized === nextSerialized) return prev;

        return { ...prev, details: normalized };
      });
    } else if (wo) {
      workOrdersService
        .patchAndEnqueue({ orgId: orgId!, id: wo.id, patch: { details: normalized } })
        .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
    }
  }

  const woId = wo?.id ?? null;

  // ── Culvert Details save handler ──
  const handleCulvertSave = useCallback((details: CulvertDetails | undefined) => {
    if (!canEditCurrentWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage(isDraft ? "createWorkOrder" : "editWorkOrder"));
      return;
    }

    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;

        const nextDetails = details ?? null;
        const prevSerialized = JSON.stringify(prev.details ?? null);
        const nextSerialized = JSON.stringify(nextDetails);

        // No-op when unchanged so auto-save doesn't cause repeated rerenders.
        if (prevSerialized === nextSerialized) return prev;

        return { ...prev, details: nextDetails };
      });
    } else if (woId) {
      workOrdersService
        .patchAndEnqueue({ orgId: orgId!, id: woId, patch: { details: details ?? null } })
        .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
    }
  }, [canEditCurrentWorkOrder, isDraft, orgId, woId]);

  // ── Pavement Details save handler ──
  const handlePavementSave = useCallback((details: PavementRepairDetails | undefined) => {
    if (!canEditCurrentWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage(isDraft ? "createWorkOrder" : "editWorkOrder"));
      return;
    }

    const normalized = normalizePavementRepairDetails(details) ?? null;
    const normalizedKey = JSON.stringify(normalized);

    if (__DEV__) {
      console.log("[WorkItemSheet] pavement-save", {
        mode: isDraft ? "draft" : "existing",
        workOrderId: woId,
        normalizedKey,
      });
    }

    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;

        const prevNormalized = normalizePavementRepairDetails(prev.details) ?? null;
        const prevSerialized = JSON.stringify(prevNormalized);
        const nextSerialized = JSON.stringify(normalized);

        // No-op when unchanged so auto-save doesn't loop on callback identity changes.
        if (prevSerialized === nextSerialized) return prev;

        return { ...prev, details: normalized };
      });
    } else if (woId) {
      workOrdersService
        .patchAndEnqueue({ orgId: orgId!, id: woId, patch: { details: normalized } })
        .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
    }
  }, [canEditCurrentWorkOrder, isDraft, orgId, woId]);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  const selectedSignTypeLabel = useMemo(() => {
    if (signDetails?.signName) return signDetails.signName;
    const signTypeId = signDetails?.signTypeId;
    if (!signTypeId) return null;
    const st = getSignTypeById(signTypeId);
    if (!st) return signTypeId; // Fallback to ID if not found
    return st.label;
  }, [signDetails?.signName, signDetails?.signTypeId]);

  const selectedSignEntries = useMemo(() => {
    const detailsObj = wo?.details && typeof wo.details === "object" ? (wo.details as Record<string, any>) : null;
    return normalizeSignEntries(detailsObj);
  }, [wo?.details]);

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

  useEffect(() => {
    if (isDraft || !wo?.id) {
      setExistingPhotos([]);
      return;
    }
    setExistingPhotos(getWorkOrderPhotos(wo.id));
  }, [isDraft, wo?.id, dbTick]);

  useEffect(() => {
    let alive = true;

    if (isDraft || !wo?.id || !orgId) {
      setRemotePhotos([]);
      setLatestRemoteFetchOutcome({ status: "idle", at: null, message: "" });
      return () => {
        alive = false;
      };
    }

    getRemoteWorkOrderPhotos({ orgId, workOrderId: wo.id })
      .then((rows) => {
        if (!alive) return;
        setRemotePhotos(rows);
        setLatestRemoteFetchOutcome({
          status: "success",
          at: Date.now(),
          message: `count=${rows.length}`,
        });
        if (__DEV__) {
          console.log("[WorkItemSheet][photo-fetch-success]", {
            workOrderId: wo.id,
            orgId,
            remoteCount: rows.length,
          });
        }
      })
      .catch((e) => {
        if (!alive) return;
        setRemotePhotos([]);
        setLatestRemoteFetchOutcome({
          status: "failed",
          at: Date.now(),
          message: e?.message ?? String(e),
        });
        console.warn("[WorkItemSheet] remote photo fetch failed", {
          workOrderId: wo.id,
          orgId,
          error: e?.message ?? String(e),
        });
      });

    return () => {
      alive = false;
    };
  }, [isDraft, orgId, wo?.id, dbTick]);

  const localPhotoIds = useMemo(() => new Set(existingPhotos.map((p) => p.id)), [existingPhotos]);
  const photos = useMemo(() => {
    if (isDraft) return localDraft?.photos ?? [];
    const remoteOnly = remotePhotos.filter((p) => !localPhotoIds.has(p.id));
    return [...remoteOnly, ...existingPhotos].sort((a, b) => b.createdAt - a.createdAt);
  }, [existingPhotos, isDraft, localDraft?.photos, localPhotoIds, remotePhotos]);
  const photoDevDiagnostics = useMemo(() => {
    if (!__DEV__ || !wo?.id) return null;
    return getWorkOrderPhotoDevDiagnostics(wo.id);
  }, [wo?.id]);

  useEffect(() => {
    if (isDraft || !wo?.id) return;
    console.log("[WorkItemSheet][photo-render-count]", {
      workOrderId: wo.id,
      localCount: existingPhotos.length,
      remoteCount: remotePhotos.length,
      renderedCount: photos.length,
    });
  }, [existingPhotos.length, isDraft, photos.length, remotePhotos.length, wo?.id]);

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
    logSyncBreadcrumb("work item sheet waiting for data", {
      routeName: "WorkItemSheet",
      routeState: isDraft ? "draft" : "existing",
      workOrderId: isDraft ? "draft" : workItemId ?? null,
    });
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

  function showPermissionDenied(permission: RolePermission) {
    recordErrorWithContext(new Error("work item permission denied"), {
      message: "work item action blocked by role guard",
      extras: {
        routeName: "WorkItemSheet",
        routeState: isDraft ? "draft" : "existing",
        permission,
        workOrderId: wo?.id ?? null,
      },
    });
    Alert.alert("Permission denied", permissionDeniedMessage(permission));
  }

  function changeStatus(s: WorkStatus) {
    if (!canChangeStatusPriority) {
      showPermissionDenied("changeStatusPriority");
      return;
    }

    if (isDraft) {
      setLocalDraft(prev => prev ? { ...prev, status: s } : null);
    } else if (wo) {
      workOrdersService
        .patchAndEnqueue({ orgId: orgId!, id: wo.id, patch: { status: s } })
        .catch((e: any) => Alert.alert("Update failed", e?.message ?? "Missing orgId"));
    }
  }

  function changePriority(p: Priority) {
    if (!canChangeStatusPriority) {
      showPermissionDenied("changeStatusPriority");
      return;
    }

    if (isDraft) {
      setLocalDraft(prev => prev ? { ...prev, priority: p } : null);
    } else if (wo) {
      workOrdersService
        .patchAndEnqueue({ orgId: orgId!, id: wo.id, patch: { priority: p } })
        .catch((e: any) => Alert.alert("Update failed", e?.message ?? "Missing orgId"));
    }
  }

  function changeSignDetails(updates: Partial<DraftWorkOrder["signDetails"]>) {
    if (!canEditCurrentWorkOrder) {
      showPermissionDenied(isDraft ? "createWorkOrder" : "editWorkOrder");
      return;
    }

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

  function changeGenericActionNeeded(action: string | null) {
    if (!canEditCurrentWorkOrder) {
      showPermissionDenied(isDraft ? "createWorkOrder" : "editWorkOrder");
      return;
    }

    const normalizedAction = String(action ?? "").trim() || null;

    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;
        const baseDetails =
          prev.details && typeof prev.details === "object" && !Array.isArray(prev.details)
            ? { ...(prev.details as Record<string, any>) }
            : {};

        if (normalizedAction) baseDetails.actionNeeded = normalizedAction;
        else delete baseDetails.actionNeeded;

        return {
          ...prev,
          details: Object.keys(baseDetails).length ? baseDetails : null,
        };
      });
      return;
    }

    if (!wo) return;

    const baseDetails =
      wo.details && typeof wo.details === "object" && !Array.isArray(wo.details)
        ? { ...(wo.details as Record<string, any>) }
        : {};

    if (normalizedAction) baseDetails.actionNeeded = normalizedAction;
    else delete baseDetails.actionNeeded;

    workOrdersService
      .patchAndEnqueue({
        orgId: orgId!,
        id: wo.id,
        patch: { details: Object.keys(baseDetails).length ? baseDetails : null },
      })
      .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
  }

  function toggleBrushingActionNeeded(action: string) {
    if (!canEditCurrentWorkOrder) {
      showPermissionDenied(isDraft ? "createWorkOrder" : "editWorkOrder");
      return;
    }

    const current = brushingActionNeeded;
    const next = current.includes(action)
      ? current.filter((x) => x !== action)
      : [...current, action];

    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;
        const baseDetails =
          prev.details && typeof prev.details === "object" && !Array.isArray(prev.details)
            ? { ...(prev.details as Record<string, any>) }
            : {};

        if (next.length) {
          baseDetails.actionNeededList = next;
          baseDetails.actionNeeded = next[0];
        } else {
          delete baseDetails.actionNeededList;
          delete baseDetails.actionNeeded;
        }

        return {
          ...prev,
          details: Object.keys(baseDetails).length ? baseDetails : null,
        };
      });
      return;
    }

    if (!wo) return;

    const baseDetails =
      wo.details && typeof wo.details === "object" && !Array.isArray(wo.details)
        ? { ...(wo.details as Record<string, any>) }
        : {};

    if (next.length) {
      baseDetails.actionNeededList = next;
      baseDetails.actionNeeded = next[0];
    } else {
      delete baseDetails.actionNeededList;
      delete baseDetails.actionNeeded;
    }

    workOrdersService
      .patchAndEnqueue({
        orgId: orgId!,
        id: wo.id,
        patch: { details: Object.keys(baseDetails).length ? baseDetails : null },
      })
      .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
  }

  async function addPhotoFromCamera() {
    if (!canAddPhotos) {
      showPermissionDenied("addWorkOrderPhoto");
      return;
    }

    if (photoBusy) return;

    const ok = await requestCameraPermission();
    if (!ok) {
      Alert.alert("Camera permission needed", "Enable camera access to take work-order photos.");
      return;
    }

    setPhotoBusy(true);
    try {
      const result = await launchCamera({ mediaType: "photo", quality: 0.8, saveToPhotos: false });
      if (result.didCancel) return;
      if (result.errorCode) throw new Error(result.errorMessage ?? result.errorCode);

      const photo = buildPhotoFromPicker(result.assets?.[0], "camera");
      if (!photo) throw new Error("No photo captured.");

      if (isDraft) {
        setLocalDraft((prev) => {
          if (!prev) return null;
          return { ...prev, photos: [photo, ...(prev.photos ?? [])] };
        });
      } else if (wo) {
        addWorkOrderPhoto({ workOrderId: wo.id, photo });
      }
    } catch (e: any) {
      Alert.alert("Could not add photo", e?.message ?? "Unknown error");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function addPhotoFromLibrary() {
    if (!canAddPhotos) {
      showPermissionDenied("addWorkOrderPhoto");
      return;
    }

    if (photoBusy) return;

    const ok = await requestPhotoLibraryPermission();
    if (!ok) {
      Alert.alert("Photo library permission needed", "Enable photo access to attach existing images.");
      return;
    }

    setPhotoBusy(true);
    try {
      const result = await launchImageLibrary({ mediaType: "photo", quality: 0.8, selectionLimit: 1 });
      if (result.didCancel) return;
      if (result.errorCode) throw new Error(result.errorMessage ?? result.errorCode);

      const photo = buildPhotoFromPicker(result.assets?.[0], "gallery");
      if (!photo) throw new Error("No photo selected.");

      if (isDraft) {
        setLocalDraft((prev) => {
          if (!prev) return null;
          return { ...prev, photos: [photo, ...(prev.photos ?? [])] };
        });
      } else if (wo) {
        addWorkOrderPhoto({ workOrderId: wo.id, photo });
      }
    } catch (e: any) {
      Alert.alert("Could not add photo", e?.message ?? "Unknown error");
    } finally {
      setPhotoBusy(false);
    }
  }

  function removePhoto(photoId: string) {
    if (!canAddPhotos) {
      showPermissionDenied("addWorkOrderPhoto");
      return;
    }

    if (isDraft) {
      setLocalDraft((prev) => {
        if (!prev) return null;
        return { ...prev, photos: (prev.photos ?? []).filter((p) => p.id !== photoId) };
      });
      return;
    }

    removeWorkOrderPhoto(photoId);
  }

  async function updateWorkOrderNow() {
    if (isDraft || !wo) return;
    if (!canEditWorkOrder) {
      showPermissionDenied("editWorkOrder");
      return;
    }

    try {
      await workOrdersService.patchAndEnqueue({
        orgId: orgId!,
        id: wo.id,
        patch: { note: noteDraft },
      });
      Alert.alert("Updated", "Work order updated.");
    } catch (e: any) {
      Alert.alert("Update failed", e?.message ?? "Missing orgId");
    }
  }

  const detailsSummaryRows = buildDetailsSummaryRows(wo?.details);
  const creatorIdentity = !isDraft && wo && "createdByUid" in wo ? wo : null;
  const creatorLabel = formatWorkOrderCreator(creatorIdentity);

  return (
    <>
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
            <Text style={styles.subtitle}>Created by: {creatorLabel}</Text>
          </View>
          <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>X</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollView} contentContainerStyle={styles.content}>
          <Text style={styles.sectionTitle}>Status</Text>
          <View style={styles.chipRow}>
            {STATUS_OPTIONS.map((s) => (
              <Chip
                key={s.value}
                label={s.label}
                active={wo.status === s.value}
                disabled={!canChangeStatusPriority}
                onPress={() => changeStatus(s.value)}
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
                disabled={!canChangeStatusPriority}
                onPress={() => changePriority(p)}
              />
            ))}
          </View>

          {!!detailsSummaryRows.length && !isGuardrail && (
            <View style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Saved Details</Text>
              {detailsSummaryRows.slice(0, 12).map((row, idx) => (
                <View key={`${row.label}:${idx}`} style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>{row.label}</Text>
                  <Text style={styles.summaryValue}>{row.value}</Text>
                </View>
              ))}
            </View>
          )}

          {isSign && (
            <>
              <Text style={styles.signDetailsSectionTitle}>Sign Details</Text>

              <Text style={styles.subSectionTitle}>Sign Type</Text>
              <TouchableOpacity
                onPress={() => {
                  if (!canEditCurrentWorkOrder) {
                    showPermissionDenied(isDraft ? "createWorkOrder" : "editWorkOrder");
                    return;
                  }
                  setPickerOpen(true);
                }}
                style={[styles.signTypeBox, !canEditCurrentWorkOrder && styles.signTypeBoxDisabled]}
              >
                <Text style={styles.signTypeBoxTitle}>
                  {signDetails?.signTypeId
                    ? "Change Sign Type"
                    : "Choose Sign Type"}
                </Text>
                <Text style={styles.signTypeBoxSub}>
                  Current: {selectedSignTypeLabel ?? "None"}
                  {signDetails?.signTypeId && ` (${signDetails.signTypeId})`} • {signDetails?.category ?? "Unknown"}
                </Text>
                {!!selectedSignEntries.length && (
                  <Text style={styles.signTypeBoxSub}>
                    Post signs: {selectedSignEntries.map((entry) => entry.signLabel).join(", ")}
                  </Text>
                )}
              </TouchableOpacity>

              <SignTypePickerModal
                visible={pickerOpen}
                onClose={() => setPickerOpen(false)}
                selectedId={signDetails?.signTypeId ?? null}
                initialDetails={((wo?.details as any) ?? null)}
                onSelect={({ signType, detailsPatch }) => {
                  if (!canEditCurrentWorkOrder) {
                    showPermissionDenied(isDraft ? "createWorkOrder" : "editWorkOrder");
                    setPickerOpen(false);
                    return;
                  }

                  changeSignDetails({
                    signTypeId: signType.id,
                    category: signType.category,
                    signCategory: signType.category,
                    signCode: signType.mutcdCode ?? null,
                    signName: signType.label,
                    postMaterial:
                      detailsPatch.supportType === "Wood" || detailsPatch.supportType === "Steel"
                        ? detailsPatch.supportType
                        : null,
                  });

                  if (isDraft) {
                    setLocalDraft((prev) => {
                      if (!prev) return null;
                      return {
                        ...prev,
                        details: {
                          ...(prev.details as Record<string, any> | null),
                          ...detailsPatch,
                        },
                      };
                    });
                  } else if (wo) {
                    workOrdersService
                      .patchAndEnqueue({
                        orgId: orgId!,
                        id: wo.id,
                        patch: {
                          details: {
                            ...((wo.details as Record<string, any>) ?? {}),
                            ...detailsPatch,
                          },
                        },
                      })
                      .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
                  }

                  setPickerOpen(false);
                }}
              />

              <Text style={styles.subSectionTitle}>Condition</Text>
              <View style={styles.chipRow}>
                {SIGN_CONDITION.map((c) => (
                  <Chip
                    key={c}
                    label={c}
                    active={signDetails?.condition === c}
                    disabled={!canEditCurrentWorkOrder}
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
                    active={a === "None" ? !signDetails?.action || signDetails?.action === "None" : signDetails?.action === a}
                    disabled={!canEditCurrentWorkOrder}
                    onPress={() => changeSignDetails({ action: a === "None" ? null : a })}
                  />
                ))}
              </View>

              {/* Inspection Sheet - Collapsible Section */}
              <TouchableOpacity
                onPress={() => changeSignDetails({ inspectionVisible: !signDetails?.inspectionVisible })}
                style={[styles.inspectionHeader, !canEditCurrentWorkOrder && styles.inspectionSectionDisabled]}
              >
                <Text style={styles.inspectionHeaderText}>
                  {signDetails?.inspectionVisible ? "▼" : "▶"} Inspection Sheet
                </Text>
              </TouchableOpacity>

              {!!signDetails?.inspectionVisible && (
                <View
                  style={[styles.inspectionContent, !canEditCurrentWorkOrder && styles.inspectionSectionDisabled]}
                  pointerEvents={canEditCurrentWorkOrder ? "auto" : "none"}
                >
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
                        if (isDraft) {
                          // Draft mode: buffer inspection data into localDraft so it's
                          // included when onCreateDraft is called
                          setLocalDraft(prev => {
                            if (!prev) return null;
                            return {
                              ...prev,
                              signDetails: {
                                ...prev.signDetails,
                                reflectivityScore: inspectionDraft.reflectivityScore,
                                delaminationScore: inspectionDraft.delaminationScore,
                                appearanceScore: inspectionDraft.appearanceScore,
                                postMaterial: inspectionDraft.postMaterial,
                                postConditionScore: inspectionDraft.postConditionScore,
                              },
                            };
                          });
                        } else if (wo) {
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

          {/* ── Pavement Repair Details (pothole / pavement-related types) ── */}
          {(isPavement || normalizedWoPavement) && (
            <PavementRepairDetailsEditor
              initialDetails={pavementInitial}
              onSave={handlePavementSave}
              autoSaveOnChange={isDraft}
            />
          )}

          {/* ── Guardrail Details (parts inventory) ── */}
          {(isGuardrail || (wo.details as GuardrailDetails | null)?.parts) && (
            <GuardrailDetailsEditor
              initialDetails={guardrailInitial}
              onSave={handleGuardrailSave}
              autoSaveOnChange={isDraft}
            />
          )}

          {/* ── Culvert Details (drainage condition findings) ── */}
          {(isCulvert ||
            (wo.details as CulvertDetails | null)?.issue ||
            (wo.details as CulvertDetails | null)?.plugged != null ||
            (wo.details as CulvertDetails | null)?.endsCrushed != null ||
            (wo.details as CulvertDetails | null)?.captureInletOutletFromLine != null) && (
            <CulvertDetailsEditor
              initialDetails={culvertInitial}
              onSave={handleCulvertSave}
              autoSaveOnChange={isDraft}
              hasLineGeometry={culvertHasLineGeometry}
            />
          )}

          {!!genericActionOptions && (
            <>
              <Text style={styles.subSectionTitle}>Action Needed</Text>
              <View style={styles.chipRow}>
                {isBrushing ? (
                  <>
                    <Chip
                      label="None"
                      active={brushingActionNeeded.length === 0}
                      disabled={!canEditCurrentWorkOrder}
                      onPress={() => {
                        if (!canEditCurrentWorkOrder) return;
                        if (isDraft) {
                          setLocalDraft((prev) => {
                            if (!prev) return null;
                            const baseDetails =
                              prev.details && typeof prev.details === "object" && !Array.isArray(prev.details)
                                ? { ...(prev.details as Record<string, any>) }
                                : {};
                            delete baseDetails.actionNeededList;
                            delete baseDetails.actionNeeded;
                            return {
                              ...prev,
                              details: Object.keys(baseDetails).length ? baseDetails : null,
                            };
                          });
                          return;
                        }
                        if (!wo) return;
                        const baseDetails =
                          wo.details && typeof wo.details === "object" && !Array.isArray(wo.details)
                            ? { ...(wo.details as Record<string, any>) }
                            : {};
                        delete baseDetails.actionNeededList;
                        delete baseDetails.actionNeeded;
                        workOrdersService
                          .patchAndEnqueue({
                            orgId: orgId!,
                            id: wo.id,
                            patch: { details: Object.keys(baseDetails).length ? baseDetails : null },
                          })
                          .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Unknown error"));
                      }}
                    />
                    {genericActionOptions.map((action) => (
                      <Chip
                        key={action}
                        label={action}
                        active={brushingActionNeeded.includes(action)}
                        disabled={!canEditCurrentWorkOrder}
                        onPress={() => toggleBrushingActionNeeded(action)}
                      />
                    ))}
                  </>
                ) : (
                  genericActionOptions.map((action) => (
                    <Chip
                      key={action}
                      label={action}
                      active={action === "None" ? !genericActionNeeded : genericActionNeeded === action}
                      disabled={!canEditCurrentWorkOrder}
                      onPress={() => changeGenericActionNeeded(action === "None" ? null : action)}
                    />
                  ))
                )}
              </View>
            </>
          )}

          <Text style={styles.sectionTitle}>Photos</Text>
          {PHOTO_FEATURE_ENABLED && (
            <>
              <View style={styles.photoActionRow}>
                <TouchableOpacity
                  onPress={addPhotoFromCamera}
                  disabled={!canAddPhotos || photoBusy}
                  style={[styles.photoActionButton, (!canAddPhotos || photoBusy) && styles.photoActionButtonDisabled]}
                >
                  <Text style={styles.photoActionText}>Take Photo</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={addPhotoFromLibrary}
                  disabled={!canAddPhotos || photoBusy}
                  style={[styles.photoActionButton, (!canAddPhotos || photoBusy) && styles.photoActionButtonDisabled]}
                >
                  <Text style={styles.photoActionText}>Add Existing</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.photoHint}>Attach photos to this work order for field context.</Text>

              {photos.length ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.photoStrip}>
                  {photos.map((p) => (
                    <View key={p.id} style={styles.photoCard}>
                      <TouchableOpacity onPress={() => setPhotoPreviewUri(p.uri)} activeOpacity={0.85}>
                        <Image source={{ uri: p.uri }} style={styles.photoThumb} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          if (!canAddPhotos) return;
                          if (!isDraft && !localPhotoIds.has(p.id)) return;
                          removePhoto(p.id);
                        }}
                        disabled={!canAddPhotos || (!isDraft && !localPhotoIds.has(p.id))}
                        style={[
                          styles.photoRemoveButton,
                          (!canAddPhotos || (!isDraft && !localPhotoIds.has(p.id))) && styles.photoActionButtonDisabled,
                        ]}
                      >
                        <Text style={styles.photoRemoveText}>
                          {canAddPhotos && (isDraft || localPhotoIds.has(p.id)) ? "Remove" : "Synced"}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <Text style={styles.photoEmpty}>No photos attached yet.</Text>
              )}

              {__DEV__ && !isDraft && !!wo?.id && (
                <View style={styles.devDiagCard}>
                  <Text style={styles.devDiagTitle}>DEV Photo Sync Diagnostics</Text>
                  <Text style={styles.devDiagLine}>WorkOrderId: {wo.id}</Text>
                  <Text style={styles.devDiagLine}>Local count: {existingPhotos.length}</Text>
                  <Text style={styles.devDiagLine}>Remote count: {remotePhotos.length}</Text>
                  <Text style={styles.devDiagLine}>Rendered count: {photos.length}</Text>
                  <Text style={styles.devDiagLine}>
                    Latest upload success: {photoDevDiagnostics?.latestUploadSuccessAt ? new Date(photoDevDiagnostics.latestUploadSuccessAt).toLocaleTimeString() : "n/a"}
                  </Text>
                  <Text style={styles.devDiagLine}>
                    Latest metadata write success: {photoDevDiagnostics?.latestMetadataWriteSuccessAt ? new Date(photoDevDiagnostics.latestMetadataWriteSuccessAt).toLocaleTimeString() : "n/a"}
                  </Text>
                  <Text style={styles.devDiagLine}>
                    Latest remote fetch result: {latestRemoteFetchOutcome.status}
                    {latestRemoteFetchOutcome.message ? ` (${latestRemoteFetchOutcome.message})` : ""}
                  </Text>
                  <Text style={styles.devDiagLine}>
                    Latest remote fetch count: {photoDevDiagnostics?.latestRemoteFetchCount ?? "n/a"}
                  </Text>
                </View>
              )}
            </>
          )}

          <Text style={styles.sectionTitle}>Note</Text>
          <TextInput
            value={noteDraft}
            onChangeText={(text) => {
              setNoteDraft(text);
              if (isDraft && canCreateWorkOrder) {
                setLocalDraft(prev => prev ? { ...prev, note: text } : null);
              }
            }}
            placeholder="Add a note..."
            multiline
            editable={isDraft ? canCreateWorkOrder : canEditWorkOrder}
            style={styles.noteInput}
          />
          {!isDraft && canEditWorkOrder && (
            <TouchableOpacity
              onPress={() => {
                workOrdersService
                  .patchAndEnqueue({ orgId: orgId!, id: wo.id, patch: { note: noteDraft } })
                  .catch((e: any) => Alert.alert("Save failed", e?.message ?? "Missing orgId"));
              }}
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
                      if (!canCreateWorkOrder) {
                        showPermissionDenied("createWorkOrder");
                        return;
                      }
                      props.onCreateDraft(localDraft);
                      onClose();
                    }
                  }}
                  disabled={!canCreateWorkOrder}
                  style={[
                    styles.actionButton,
                    styles.createButton,
                    !canCreateWorkOrder && styles.photoActionButtonDisabled,
                  ]}
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
                    const woGeomType = (wo as any)?.geomType;
                    console.log("[WorkItemSheet] Show on Map", { id: wo.id, type: wo.type, center: c, wo });
                    if (__DEV__ && isCulvert) {
                      console.log("[CULVERT][FOCUS] Show on Map target", {
                        workOrderId: wo.id,
                        center: c,
                        geomType: woGeomType,
                      });
                    }

                    if (!c || !isValidMapCoord(c)) {
                      if (__DEV__) {
                        console.warn("[CULVERT][FOCUS] Invalid Show on Map coordinates", {
                          workOrderId: wo.id,
                          center: c,
                          geomType: woGeomType,
                        });
                      }
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
                {canDeleteWorkOrder && (
                  <TouchableOpacity
                    onPress={() => {
                      Alert.alert("Delete Work Order?", "This cannot be undone.", [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Delete",
                          style: "destructive",
                          onPress: () => {
                            try {
                              removeWorkOrder(wo.id, orgId!);
                              onClose();
                            } catch (e: any) {
                              Alert.alert("Delete failed", e?.message ?? "Missing orgId");
                            }
                          },
                        },
                      ]);
                    }}
                    style={[styles.actionButton, styles.deleteButton]}
                  >
                    <Text style={styles.deleteButtonText}>Delete Work Order</Text>
                  </TouchableOpacity>
                )}
                {canEditWorkOrder && (
                  <TouchableOpacity
                    onPress={updateWorkOrderNow}
                    style={[styles.actionButton, styles.updateButton]}
                  >
                    <Text style={styles.updateButtonText}>Update Work Order</Text>
                  </TouchableOpacity>
                )}
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
    <Modal
      visible={!!photoPreviewUri}
      transparent
      animationType="fade"
      onRequestClose={() => setPhotoPreviewUri(null)}
    >
      <View style={styles.photoPreviewBackdrop}>
        <TouchableOpacity
          onPress={() => setPhotoPreviewUri(null)}
          style={styles.photoPreviewCloseBtn}
        >
          <Text style={styles.photoPreviewCloseText}>Close</Text>
        </TouchableOpacity>
        {!!photoPreviewUri && (
          <Image
            source={{ uri: photoPreviewUri }}
            style={styles.photoPreviewImage}
            resizeMode="contain"
          />
        )}
      </View>
    </Modal>
    </>
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
  chipDisabled: {
    opacity: 0.45,
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
  photoActionRow: {
    flexDirection: "row",
    gap: 10,
  },
  photoActionButton: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1f2937",
    alignItems: "center",
    backgroundColor: "#1f2937",
  },
  photoActionButtonDisabled: {
    backgroundColor: "#9ca3af",
    borderColor: "#9ca3af",
  },
  photoActionText: {
    fontSize: 13,
    fontWeight: "800",
    color: "white",
  },
  photoHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#6b7280",
  },
  photoEmpty: {
    marginTop: 10,
    fontSize: 13,
    color: "#6b7280",
  },
  photoStrip: {
    marginTop: 10,
  },
  photoCard: {
    width: 120,
    marginRight: 10,
  },
  photoThumb: {
    width: 120,
    height: 100,
    borderRadius: 10,
    backgroundColor: "#e5e7eb",
  },
  photoRemoveButton: {
    marginTop: 6,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    backgroundColor: "white",
  },
  photoRemoveText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#374151",
  },
  devDiagCard: {
    marginTop: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "#f8fafc",
    padding: 10,
    gap: 2,
  },
  devDiagTitle: {
    fontSize: 12,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 4,
  },
  devDiagLine: {
    fontSize: 11,
    color: "#374151",
  },
  summaryCard: {
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    backgroundColor: "#fafafa",
    padding: 12,
  },
  summaryTitle: {
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderTopWidth: 1,
    borderTopColor: "#f3f4f6",
    paddingTop: 7,
    marginTop: 7,
    gap: 10,
  },
  summaryLabel: {
    flex: 1,
    fontSize: 13,
    color: "#374151",
    fontWeight: "700",
  },
  summaryValue: {
    fontSize: 13,
    color: "#111827",
    fontWeight: "800",
    textAlign: "right",
    flexShrink: 1,
  },
  photoPreviewBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.92)",
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
  },
  photoPreviewImage: {
    width: "100%",
    height: "86%",
  },
  photoPreviewCloseBtn: {
    position: "absolute",
    top: 48,
    right: 16,
    zIndex: 10,
    borderWidth: 1,
    borderColor: "#d1d5db",
    backgroundColor: "white",
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  photoPreviewCloseText: {
    fontWeight: "800",
    fontSize: 13,
    color: "#111827",
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
  signTypeBoxDisabled: {
    opacity: 0.6,
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
  },
  updateButton: {
    borderColor: "#16a34a",
    backgroundColor: "#16a34a",
  },
  updateButtonText: {
    fontWeight: "900",
    fontSize: 15,
    color: "white",
  },
  cancelButton: {
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
  inspectionSectionDisabled: {
    opacity: 0.6,
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
