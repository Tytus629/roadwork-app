// src/screens/AssetDetailScreen.tsx
//
// Read-only asset detail screen with event history timeline.
// Loaded from SQLite (offline-first).

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { View, Text, ScrollView, StyleSheet, Pressable, Alert } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { assetsRepo } from "../repositories/assetsRepo";
import { assetEventsRepo } from "../repositories/assetEventsRepo";
import { workOrdersRepo } from "../repositories/workOrdersRepo";
import { useOrg } from "../state/OrgContext";
import type { Asset } from "../types/Asset";
import type { AssetEvent } from "../types/AssetEvent";
import type { WorkOrder } from "../types/WorkOrder";
import { normalizeSignEntries } from "../utils/signAssetDetails";
import {
  normalizeMapCoordPair,
} from "../utils/workOrderGeo";
import { deriveAssetWorkOrderSeedLocation } from "../utils/assetGeometry";
import { deriveBridgeCenter, normalizeBridgeCorners } from "../utils/bridgeGeometry";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";
import { requestMapCreateWorkOrderFromAsset } from "../state/MapCreateWorkOrderEvents";
import { getDbTick, subscribeDbChanged } from "../state/DbEvents";
import { formatPersonDisplayName } from "../utils/userIdentity";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";
import { getTypeGroup } from "../workOrders/typeGroups";

class AssetDetailRenderBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }

  static getDerivedStateFromError(err: any) {
    return { hasError: true, message: String(err?.message ?? "Render failed") };
  }

  componentDidCatch(error: any) {
    if (__DEV__) {
      console.error("[Map][AssetTap] AssetDetail render error", error);
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.loading}>
          <Text style={styles.title}>Asset Detail</Text>
          <Text style={styles.emptyText}>Detail content failed to render.</Text>
          <Text style={styles.eventMeta}>{this.state.message}</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

function SafeView({ children, style }: { children: React.ReactNode; style?: any }) {
  const sanitized = React.Children.toArray(children).filter((child) => {
    if (typeof child === "string") return child.trim().length > 0;
    if (typeof child === "number" || typeof child === "bigint" || typeof child === "boolean") return false;
    return React.isValidElement(child);
  });

  return <View style={style}>{sanitized}</View>;
}

function assetTypeLabel(t: string) {
  if (t === "SIGN") return "Sign";
  if (t === "GUARDRAIL") return "Guardrail";
  if (t === "CULVERT") return "Culvert";
  if (t === "BRIDGE") return "Bridge";
  return t;
}

function kindLabel(k: string) {
  switch (k) {
    case "INSTALL":
      return "Installed";
    case "INSPECTION":
      return "Inspection";
    case "REPAIR":
      return "Repair";
    case "REPLACE":
      return "Replaced";
    case "NOTE":
      return "Note";
    default:
      return k;
  }
}

function timelineTitleForEvent(e: AssetEvent, details: Record<string, any> | null): string {
  if (e.kind === "NOTE") {
    const lifecycleTag = String(details?._assetLifecycleTag ?? "").toUpperCase();
    if (lifecycleTag === "AUTO_CREATE_ADDED") return "Added to Asset Inventory";
  }
  return kindLabel(e.kind);
}

function humanizeCode(code: string | null | undefined) {
  const v = String(code ?? "").trim();
  if (!v) return "Unknown";
  return v
    .toLowerCase()
    .replace(/[\s_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}

function shortId(id: string | null | undefined, len = 8) {
  const v = String(id ?? "").trim();
  if (!v) return "-";
  return v.slice(0, len);
}

function formatDateTime(ts: number) {
  return new Date(ts).toLocaleString();
}

function formatDateGroup(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string | null | undefined) {
  const v = String(status ?? "").trim();
  if (!v) return "Unknown";
  if (v === "Needs") return "Needs Work";
  if (v === "Done") return "Completed";
  return v;
}

function isCompletedWorkOrderStatus(status: string | null | undefined): boolean {
  const normalized = String(status ?? "").trim().toLowerCase();
  return normalized === "done" || normalized === "completed" || normalized === "closed";
}

function actorLabel(e: AssetEvent) {
  return formatPersonDisplayName(e as Record<string, unknown> | null | undefined, {
    nameKeys: ["actorName", "byName"],
    displayNameKeys: ["actorDisplayName", "byDisplayName"],
    emailKeys: ["actorEmail", "byEmail"],
    uidKeys: ["actorUid", "byUid"],
    unknownLabel: "Unknown actor",
  });
}

function inspectionSummary(details: Record<string, any> | null | undefined) {
  if (!details || typeof details !== "object") return null;

  const parts: string[] = [];
  const reflectivity = Number(details.reflectivityScore ?? details.reflectivity);
  const delamination = Number(details.delaminationScore ?? details.delamination);
  const appearance = Number(details.appearanceScore ?? details.appearance);
  const post = Number(details.postConditionScore ?? details.postCondition);
  const retroResult = String(details.retroResult ?? "").trim();

  if (Number.isFinite(reflectivity)) parts.push(`Reflectivity ${reflectivity}/10`);
  if (Number.isFinite(delamination)) parts.push(`Delamination ${delamination}/10`);
  if (Number.isFinite(appearance)) parts.push(`Appearance ${appearance}/10`);
  if (Number.isFinite(post)) parts.push(`Post ${post}/10`);
  if (retroResult) parts.push(`Retro ${retroResult}`);

  return parts.length ? parts.join(" | ") : null;
}

function statusChangeSummary(details: Record<string, any> | null | undefined) {
  if (!details || typeof details !== "object") return null;

  const from =
    details.fromStatus ?? details.previousStatus ?? details.statusBefore ?? null;
  const to = details.toStatus ?? details.statusAfter ?? details.status ?? null;

  if (!from && !to) return null;
  return `${statusLabel(from)} -> ${statusLabel(to)}`;
}

type TimelineItem = {
  id: string;
  at: number;
  title: string;
  eventType: string;
  actor: string;
  notes: string | null;
  workOrderId: string | null;
  workOrderText: string | null;
  statusText: string | null;
  inspectionText: string | null;
  attachmentsText: string | null;
};

function toTimelineItems(args: {
  asset: Asset;
  events: AssetEvent[];
  workOrdersById: Record<string, WorkOrder | null>;
}): TimelineItem[] {
  const { asset, events, workOrdersById } = args;
  const items: TimelineItem[] = [];

  items.push({
    id: `asset-created-${asset.id}`,
    at: Number(asset.createdAt),
    title: "Asset Record Created",
    eventType: "Asset Lifecycle",
    actor: formatPersonDisplayName(asset as Record<string, unknown> | null | undefined, {
      nameKeys: ["createdByName"],
      displayNameKeys: ["createdByDisplayName"],
      emailKeys: ["createdByEmail"],
      uidKeys: ["createdByUid"],
      unknownLabel: "Unknown actor",
    }),
    notes: null,
    workOrderId: null,
    workOrderText: null,
    statusText: `Status ${humanizeCode(asset.status)}`,
    inspectionText: null,
    attachmentsText: null,
  });

  if (asset.installedAt && !events.some((e) => e.kind === "INSTALL")) {
    items.push({
      id: `asset-installed-${asset.id}`,
      at: Number(asset.installedAt),
      title: "Installed",
      eventType: "Asset Lifecycle",
      actor: "Unknown actor",
      notes: null,
      workOrderId: null,
      workOrderText: null,
      statusText: null,
      inspectionText: null,
      attachmentsText: null,
    });
  }

  for (const e of events) {
    const details = (e.details as Record<string, any> | null | undefined) ?? null;
    const wo = e.workOrderId ? workOrdersById[e.workOrderId] : null;
    const attachmentCount = Array.isArray(e.photoIds) ? e.photoIds.length : 0;
    const attachmentsText = attachmentCount > 0 ? `${attachmentCount} attachment(s)` : null;

    let workOrderText: string | null = null;
    if (e.workOrderId && wo) {
      workOrderText = `WO ${shortId(e.workOrderId)} | ${humanizeCode(wo.type)} | ${statusLabel(wo.status)}`;
    } else if (e.workOrderId) {
      workOrderText = `WO ${shortId(e.workOrderId)}`;
    }

    items.push({
      id: e.id,
      at: Number(e.at),
      title: timelineTitleForEvent(e, details),
      eventType: humanizeCode(e.kind),
      actor: actorLabel(e),
      notes: e.notes ?? null,
      workOrderId: e.workOrderId ?? null,
      workOrderText,
      statusText: statusChangeSummary(details),
      inspectionText: e.kind === "INSPECTION" ? inspectionSummary(details) : null,
      attachmentsText,
    });
  }

  return items.sort((a, b) => b.at - a.at);
}

function getCulvertEndpointText(asset: Asset): { inlet: string; outlet: string } | null {
  if (asset.assetType !== "CULVERT") return null;
  const culvert = (asset.details as Record<string, any> | null | undefined)?.culvert;
  if (!culvert || typeof culvert !== "object") return null;

  const inletLat = Number(culvert?.inlet?.lat);
  const inletLng = Number(culvert?.inlet?.lng);
  const outletLat = Number(culvert?.outlet?.lat);
  const outletLng = Number(culvert?.outlet?.lng);

  if (
    !Number.isFinite(inletLat) ||
    !Number.isFinite(inletLng) ||
    !Number.isFinite(outletLat) ||
    !Number.isFinite(outletLng)
  ) {
    return null;
  }

  return {
    inlet: `${inletLat.toFixed(6)}, ${inletLng.toFixed(6)}`,
    outlet: `${outletLat.toFixed(6)}, ${outletLng.toFixed(6)}`,
  };
}

function getBridgeDetailsDisplay(asset: Asset): {
  cornerCount: number;
  geometryType: string;
  center: { lat: number; lng: number; text: string } | null;
  centerAvailable: boolean;
  hasUsableGeometry: boolean;
  isIncomplete: boolean;
  mapHint: string;
} {
  if (asset.assetType !== "BRIDGE") {
    return {
      cornerCount: 0,
      geometryType: "Unknown",
      center: null,
      centerAvailable: false,
      hasUsableGeometry: false,
      isIncomplete: false,
      mapHint: "",
    };
  }

  const rawDetails = (asset.details as Record<string, any> | null | undefined) ?? null;
  const bridgeRaw =
    rawDetails?.bridge && typeof rawDetails.bridge === "object"
      ? rawDetails.bridge
      : rawDetails?.bridgeGeometry && typeof rawDetails.bridgeGeometry === "object"
        ? rawDetails.bridgeGeometry
        : null;

  const rawCorners = Array.isArray(bridgeRaw?.corners) ? bridgeRaw.corners : null;
  const normalizedCorners = normalizeBridgeCorners(
    Array.isArray(rawCorners)
      ? rawCorners.map((corner: any) => ({
          lat: corner?.lat ?? corner?.latitude,
          lng: corner?.lng ?? corner?.lon ?? corner?.longitude,
        }))
      : null,
  );

  const storedCenter = normalizeMapCoordPair(
    bridgeRaw?.center?.lat ?? bridgeRaw?.center?.latitude,
    bridgeRaw?.center?.lng ?? bridgeRaw?.center?.lon ?? bridgeRaw?.center?.longitude,
  );
  const derivedCenter = !storedCenter && normalizedCorners ? deriveBridgeCenter(normalizedCorners) : null;
  const centerValue = storedCenter ?? derivedCenter;
  const center = centerValue
    ? {
        lat: centerValue.lat,
        lng: centerValue.lng,
        text: `${centerValue.lat.toFixed(6)}, ${centerValue.lng.toFixed(6)}`,
      }
    : null;

  const hasRawCorners = Array.isArray(rawCorners) && rawCorners.length > 0;
  const cornerCount = normalizedCorners ? normalizedCorners.length : rawCorners?.length ?? 0;
  const isIncomplete = hasRawCorners && !normalizedCorners;
  const hasUsableGeometry = !!normalizedCorners || !!center;
  const mapHint = normalizedCorners
    ? "Map focus based on bridge geometry"
    : center
      ? "Map focus uses stored bridge center"
      : "Geometry unavailable";

  return {
    cornerCount,
    geometryType: normalizedCorners ? "Bridge corners" : "Geometry unavailable",
    center,
    centerAvailable: !!center,
    hasUsableGeometry,
    isIncomplete,
    mapHint,
  };
}

export default function AssetDetailScreen({ route }: any) {
  const { assetId } = route.params;
  const { orgId, role } = useOrg();
  const navigation = useNavigation<any>();
  const canCreateWorkOrder = hasRolePermission("createWorkOrder", role);
  const [showCompletedRepairWorkOrders, setShowCompletedRepairWorkOrders] = useState(false);

  const [asset, setAsset] = useState<Asset | null>(null);
  const [events, setEvents] = useState<AssetEvent[]>([]);
  const [workOrdersById, setWorkOrdersById] = useState<Record<string, WorkOrder | null>>({});
  const [dbTick, setDbTick] = useState<number>(() => getDbTick());

  const load = useCallback(async () => {
    if (!orgId) return;
    const a = await assetsRepo.getById({ orgId, id: assetId });
    const ev = await assetEventsRepo.listForAsset({ orgId, assetId });
    const linkedFromAsset = await workOrdersRepo.listForAsset({ orgId, assetId, limit: 250 });

    if (__DEV__ && String(a?.assetType ?? "").toUpperCase() === "CULVERT") {
      console.log("[CULVERT][ASSET] history load", {
        assetId,
        orgId,
        eventCount: ev.length,
        hasDetails: !!a?.details,
      });
    }

    const eventWorkOrderIds = ev
      .map((x) => String(x.workOrderId ?? "").trim())
      .filter((x): x is string => !!x);

    const directWorkOrderIds = linkedFromAsset
      .map((x) => String(x.id ?? "").trim())
      .filter((x): x is string => !!x);

    const uniqueWorkOrderIds = Array.from(new Set([...eventWorkOrderIds, ...directWorkOrderIds]));

    const linkedEntries = await Promise.all(
      uniqueWorkOrderIds.map(async (id) => {
        const wo = await workOrdersRepo.getById({ orgId, id });
        return [id, wo] as const;
      }),
    );

    const linkedMap: Record<string, WorkOrder | null> = {};
    for (const wo of linkedFromAsset) {
      const id = String(wo.id ?? "").trim();
      if (!id) continue;
      linkedMap[id] = wo;
    }
    for (const [id, wo] of linkedEntries) linkedMap[id] = wo;

    setAsset(a);
    setEvents(ev);
    setWorkOrdersById(linkedMap);
  }, [assetId, orgId]);

  useEffect(() => subscribeDbChanged(() => setDbTick(getDbTick())), []);

  useEffect(() => {
    load();
  }, [load, dbTick]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {
        // load() already reports through existing telemetry paths where applicable.
      });
    }, [load]),
  );

  const timelineItems = useMemo(() => {
    if (!asset) return [];
    return toTimelineItems({ asset, events, workOrdersById });
  }, [asset, events, workOrdersById]);

  const bridgeSeed = useMemo(() => {
    if (!asset || asset.assetType !== "BRIDGE") return null;
    return deriveAssetWorkOrderSeedLocation(asset);
  }, [asset]);

  const canUseCreateWorkOrder =
    canCreateWorkOrder && !(asset?.assetType === "BRIDGE" && bridgeSeed != null && !bridgeSeed.ok);

  const repairRows = useMemo(() => {
    if (!asset) return [] as Array<{ workOrderId: string; title: string; subtitle: string }>;

    const rows: Array<{ workOrderId: string; title: string; subtitle: string }> = [];
    const seen = new Set<string>();
    const repairEventIds = new Set(
      events
        .filter((e) => e.kind === "REPAIR" || e.kind === "REPLACE")
        .map((e) => String(e.workOrderId ?? "").trim())
        .filter((id): id is string => !!id),
    );

    const candidates = Object.values(workOrdersById).filter((wo): wo is WorkOrder => !!wo);

    const counts = {
      candidateWOCount: candidates.length,
      linkedMatchCount: 0,
      completedMatchCount: 0,
      relevantTypeMatchCount: 0,
      dedupedCount: 0,
      finalRepairCount: 0,
    };

    const excluded = {
      wrongAssetLink: 0,
      wrongStatus: 0,
      wrongType: 0,
      duplicate: 0,
      missingId: 0,
    };

    for (const wo of candidates) {
      const workOrderId = String(wo.id ?? "").trim();
      if (!workOrderId) {
        excluded.missingId += 1;
        continue;
      }
      if (seen.has(workOrderId)) {
        excluded.duplicate += 1;
        continue;
      }

      const linkedAssetId = String(wo.assetId ?? "").trim();
      const linkedByAssetId = linkedAssetId.length > 0 && linkedAssetId === String(asset.id);
      const linkedByRepairEvent = repairEventIds.has(workOrderId);
      if (!linkedByAssetId && !linkedByRepairEvent) {
        excluded.wrongAssetLink += 1;
        continue;
      }
      counts.linkedMatchCount += 1;

      if (isCompletedWorkOrderStatus(wo.status)) {
        counts.completedMatchCount += 1;
      }

      const typeGroup = getTypeGroup(wo.type);
      const isRelevantToAsset =
        (asset.assetType === "CULVERT" && typeGroup === "culvert") ||
        (asset.assetType === "GUARDRAIL" && typeGroup === "guardrail") ||
        (asset.assetType === "SIGN" && typeGroup === "sign") ||
        asset.assetType === "BRIDGE";

      if (!isRelevantToAsset) {
        excluded.wrongType += 1;
        continue;
      }
      counts.relevantTypeMatchCount += 1;

      seen.add(workOrderId);
      counts.dedupedCount += 1;
      rows.push({
        workOrderId,
        title: `WO ${shortId(workOrderId)} • ${humanizeCode(wo.type)}`,
        subtitle: `${statusLabel(wo.status)} • ${formatDateTime(wo.updatedAt)}`,
      });
    }

    counts.finalRepairCount = rows.length;

    if (__DEV__) {
      console.log("[AssetDetail][Repairs] projection", {
        assetId: asset.id,
        orgId,
        candidateWOCount: counts.candidateWOCount,
        linkedMatchCount: counts.linkedMatchCount,
        completedMatchCount: counts.completedMatchCount,
        relevantTypeMatchCount: counts.relevantTypeMatchCount,
        dedupedCount: counts.dedupedCount,
        finalRepairCount: counts.finalRepairCount,
        excluded,
      });
    }

    return rows;
  }, [asset, events, orgId, workOrdersById]);

  const filteredRepairRows = useMemo(() => {
    if (showCompletedRepairWorkOrders) return repairRows;

    return repairRows.filter((row) => {
      const linked = workOrdersById[row.workOrderId] ?? null;
      if (!linked) return false;
      return !isCompletedWorkOrderStatus(linked.status);
    });
  }, [repairRows, showCompletedRepairWorkOrders, workOrdersById]);

  const handleOpenLinkedRepair = useCallback(
    (workOrderId: string) => {
      if (!asset) return;

      setCustomKeySafe("assetId", asset.id);
      setCustomKeySafe("assetType", asset.assetType);
      setCustomKeySafe("workOrderId", workOrderId);
      setCustomKeySafe("routeName", "AssetDetail");
      logSyncBreadcrumb("asset repair row tap", {
        sourceScreen: "AssetDetail",
        navigationTarget: "WorkItemSheet",
        assetId: asset.id,
        assetType: asset.assetType,
        workOrderId,
      });

      const linked = workOrdersById[workOrderId] ?? null;
      if (!linked) {
        logSyncBreadcrumb("asset repair row missing local wo", {
          sourceScreen: "AssetDetail",
          assetId: asset.id,
          assetType: asset.assetType,
          workOrderId,
        });
        Alert.alert("Work order unavailable", "This linked repair is not available on this device yet.");
        return;
      }

      try {
        navigation.navigate("WorkItemSheet", { id: workOrderId });
      } catch (error) {
        recordErrorWithContext(error, {
          message: "asset repair navigation failed",
          extras: {
            sourceScreen: "AssetDetail",
            navigationTarget: "WorkItemSheet",
            assetId: asset.id,
            assetType: asset.assetType,
            workOrderId,
          },
        });
        Alert.alert("Unable to open work order", "Please try again.");
      }
    },
    [asset, navigation, workOrdersById],
  );

  const handleCreateWorkOrderForAsset = useCallback(() => {
    if (!asset) return;
    if (!canCreateWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
      return;
    }

    const seed = deriveAssetWorkOrderSeedLocation(asset);
    const hasLatLng = seed.presence.hasPoint;
    const hasLineGeometry = seed.presence.hasLine;
    const hasBoundsGeometry = seed.presence.hasBbox || seed.presence.hasCorners;
    const chosenLocationSource = seed.ok ? seed.source : "none";
    const anchor = seed.ok ? { lat: seed.lat, lng: seed.lng } : null;
    const linePoints = seed.ok && Array.isArray(seed.linePoints) && seed.linePoints.length >= 2 ? seed.linePoints : [];

    setCustomKeySafe("assetId", asset.id);
    setCustomKeySafe("assetType", asset.assetType);
    setCustomKeySafe("routeName", "AssetDetail");
    setCustomKeySafe("syncStage", "create_from_asset_start");
    setCustomKeySafe("createSource", "asset_detail");
    setCustomKeySafe("chosenLocationSource", chosenLocationSource);
    if (__DEV__) {
      console.log("[CFA][AssetDetail] tap", {
        assetId: asset.id,
        assetType: asset.assetType,
        hasLatLng,
        hasLineGeometry,
        hasBoundsGeometry,
        linePointsCount: linePoints.length,
        chosenLocationSource,
        derivationOk: seed.ok,
        derivationReason: seed.ok ? undefined : seed.reason,
      });
    }
    logSyncBreadcrumb("create work order from asset tapped", {
      sourceScreen: "AssetDetail",
      assetId: asset.id,
      assetType: asset.assetType,
      hasLatLng,
      hasLineGeometry,
      hasBoundsGeometry,
      linePointsCount: linePoints.length,
      hasAnchor: !!anchor,
      chosenLocationSource,
      derivationOk: seed.ok,
      derivationReason: seed.ok ? null : seed.reason,
      navigationTarget: "MainTabs.Map",
    });

    if (!seed.ok || !anchor) {
      const blockerReason = seed.ok ? "invalid_point" : seed.reason;
      setCustomKeySafe("blockerReason", blockerReason);
      if (__DEV__) {
        console.warn("[CFA][AssetDetail] blocked", {
          assetId: asset.id,
          assetType: asset.assetType,
          blockerReason,
          hasLatLng,
          hasLineGeometry,
          hasBoundsGeometry,
          linePointsCount: linePoints.length,
        });
      }
      logSyncBreadcrumb("create work order from asset missing anchor", {
        sourceScreen: "AssetDetail",
        assetId: asset.id,
        assetType: asset.assetType,
        hasLatLng,
        hasLineGeometry,
        hasBoundsGeometry,
        linePointsCount: linePoints.length,
        blockerReason,
      });
      Alert.alert("Unable to create work order", "This asset has no usable mapped location.");
      return;
    }

    logSyncBreadcrumb("create work order from asset seed derived", {
      sourceScreen: "AssetDetail",
      assetId: asset.id,
      assetType: asset.assetType,
      chosenLocationSource,
      linePointsCount: linePoints.length,
    });

    try {
      requestMapCreateWorkOrderFromAsset({
        assetId: asset.id,
        assetType: asset.assetType,
        latitude: anchor.lat,
        longitude: anchor.lng,
        linePoints: linePoints.length >= 2 ? linePoints : undefined,
      });

      setCustomKeySafe("syncStage", "create_from_asset_navigate");
      navigation.navigate("MainTabs", { screen: "Map" });
      logSyncBreadcrumb("create work order from asset navigation dispatched", {
        sourceScreen: "AssetDetail",
        assetId: asset.id,
        assetType: asset.assetType,
        navigationTarget: "MainTabs.Map",
      });
    } catch (error) {
      recordErrorWithContext(error, {
        message: "create work order from asset navigation failed",
        extras: {
          sourceScreen: "AssetDetail",
          assetId: asset.id,
          assetType: asset.assetType,
          navigationTarget: "MainTabs.Map",
        },
      });
      Alert.alert("Unable to continue", "Could not start create-work-order flow for this asset.");
    }
  }, [asset, canCreateWorkOrder, navigation]);

  const groupedTimeline = useMemo(() => {
    const out: Array<{ key: string; label: string; items: TimelineItem[] }> = [];
    const byKey = new Map<string, TimelineItem[]>();

    for (const item of timelineItems) {
      const key = new Date(item.at).toISOString().slice(0, 10);
      const existing = byKey.get(key) ?? [];
      existing.push(item);
      byKey.set(key, existing);
    }

    const keys = Array.from(byKey.keys()).sort((a, b) => (a < b ? 1 : -1));
    for (const key of keys) {
      const dateTs = new Date(`${key}T00:00:00`).getTime();
      out.push({
        key,
        label: formatDateGroup(dateTs),
        items: byKey.get(key) ?? [],
      });
    }

    return out;
  }, [timelineItems]);

  if (!asset) {
    return (
      <View style={styles.loading}>
        <Text>Loading asset…</Text>
      </View>
    );
  }

  const culvertEndpoints = getCulvertEndpointText(asset);
  const bridgeDetails = getBridgeDetailsDisplay(asset);
  const signEntries =
    asset.assetType === "SIGN"
      ? normalizeSignEntries((asset.details as Record<string, any> | null | undefined) ?? null)
      : [];

  return (
    <AssetDetailRenderBoundary>
      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        <SafeView>
          <Text style={styles.title}>{assetTypeLabel(asset.assetType)}</Text>

          <Pressable
            onPress={handleCreateWorkOrderForAsset}
            disabled={!canUseCreateWorkOrder}
            style={[styles.createWoButton, !canUseCreateWorkOrder && styles.createWoButtonDisabled]}
          >
            <Text style={styles.createWoButtonText}>Create Work Order For This Asset</Text>
          </Pressable>

          {asset.assetType === "BRIDGE" && (
            <Text style={styles.bridgeActionHint}>
              {bridgeDetails.mapHint}
              {bridgeSeed && !bridgeSeed.ok ? "; create action disabled until geometry is available." : "."}
            </Text>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Subtype</Text>
            <Text style={styles.value}>{asset.subtype ?? "—"}</Text>
          </View>

          {asset.assetType === "SIGN" && (
            <View style={styles.signSection}>
              <Text style={styles.sectionTitle}>Signs Mounted ({signEntries.length})</Text>
              {signEntries.length === 0 ? (
                <Text style={styles.emptyText}>No sign entries recorded.</Text>
              ) : (
                signEntries.map((entry) => (
                  <View key={`${entry.position}:${entry.signTypeId ?? entry.signLabel}`} style={styles.row}>
                    <Text style={styles.label}>#{entry.position}</Text>
                    <Text style={styles.value}>
                      {entry.signLabel}
                      {entry.signTypeId ? ` (${entry.signTypeId})` : ""}
                      {entry.signCode ? ` • ${entry.signCode}` : ""}
                    </Text>
                  </View>
                ))
              )}
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Status</Text>
            <Text style={styles.value}>{asset.status}</Text>
          </View>

          <View style={styles.row}>
            <Text style={styles.label}>Location</Text>
            <Text style={styles.value}>
              {asset.lat.toFixed(6)}, {asset.lng.toFixed(6)}
            </Text>
          </View>

          {culvertEndpoints && (
            <>
              <View style={styles.row}>
                <Text style={styles.label}>Inlet</Text>
                <Text style={styles.value}>{culvertEndpoints.inlet}</Text>
              </View>
              <View style={styles.row}>
                <Text style={styles.label}>Outlet</Text>
                <Text style={styles.value}>{culvertEndpoints.outlet}</Text>
              </View>
            </>
          )}

          {asset.assetType === "BRIDGE" && (
            <View style={styles.bridgeSection}>
              <Text style={styles.bridgeSectionTitle}>Bridge Geometry</Text>

              {bridgeDetails.hasUsableGeometry ? (
                <>
                  <View style={styles.row}>
                    <Text style={styles.label}>Corner count</Text>
                    <Text style={styles.value}>{bridgeDetails.cornerCount}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Geometry type</Text>
                    <Text style={styles.value}>{bridgeDetails.geometryType}</Text>
                  </View>
                  <View style={styles.row}>
                    <Text style={styles.label}>Center available</Text>
                    <Text style={styles.value}>{bridgeDetails.centerAvailable ? "Yes" : "No"}</Text>
                  </View>
                  {bridgeDetails.center && (
                    <View style={styles.row}>
                      <Text style={styles.label}>Center</Text>
                      <Text style={styles.value}>{bridgeDetails.center.text}</Text>
                    </View>
                  )}
                  <Text style={styles.bridgeNote}>{bridgeDetails.mapHint}.</Text>
                </>
              ) : (
                <Text style={styles.emptyText}>Geometry unavailable</Text>
              )}
            </View>
          )}

          <View style={styles.row}>
            <Text style={styles.label}>Created</Text>
            <Text style={styles.value}>
              {new Date(asset.createdAt).toLocaleDateString()}
            </Text>
          </View>

          {asset.lastEventAt && (
            <View style={styles.row}>
              <Text style={styles.label}>Last Event</Text>
              <Text style={styles.value}>
                {new Date(asset.lastEventAt).toLocaleDateString()}
              </Text>
            </View>
          )}

          {asset.lastInspectionAt && (
            <View style={styles.row}>
              <Text style={styles.label}>Last Inspection</Text>
              <Text style={styles.value}>
                {new Date(asset.lastInspectionAt).toLocaleDateString()}
              </Text>
            </View>
          )}

          {(repairRows.length > 0 || asset.assetType === "BRIDGE") && (
            <View style={styles.repairsSection}>
              {repairRows.length > 0 && (
                <View style={styles.repairsToggleRow}>
                  <Text style={styles.toggleLabel}>Show Completed</Text>
                  <Pressable
                    onPress={() => setShowCompletedRepairWorkOrders((prev) => !prev)}
                    style={[
                      styles.togglePill,
                      showCompletedRepairWorkOrders ? styles.togglePillOn : styles.togglePillOff,
                    ]}
                  >
                    <Text style={styles.togglePillText}>{showCompletedRepairWorkOrders ? "ON" : "OFF"}</Text>
                  </Pressable>
                </View>
              )}

              <Text style={styles.sectionTitle}>
                {asset.assetType === "BRIDGE"
                  ? `Linked Bridge Work Orders (${filteredRepairRows.length})`
                  : `Repair Work Orders (${filteredRepairRows.length})`}
              </Text>

              {filteredRepairRows.length > 0 && (
                <>
                  {filteredRepairRows.map((repair) => (
                    <Pressable
                      key={repair.workOrderId}
                      onPress={() => handleOpenLinkedRepair(repair.workOrderId)}
                      style={styles.repairRow}
                    >
                      <Text style={styles.repairTitle}>{repair.title}</Text>
                      <Text style={styles.repairSubtitle}>{repair.subtitle}</Text>
                    </Pressable>
                  ))}
                </>
              )}

              {filteredRepairRows.length === 0 && asset.assetType === "BRIDGE" && (
                <Text style={styles.emptyText}>No linked bridge work orders yet.</Text>
              )}
            </View>
          )}

          <Text style={styles.sectionTitle}>Lifecycle Timeline ({timelineItems.length})</Text>

          {timelineItems.length === 0 && (
            <Text style={styles.emptyText}>No events recorded.</Text>
          )}

          {groupedTimeline.map((group) => (
            <View key={group.key} style={styles.groupWrap}>
              <Text style={styles.groupTitle}>{group.label}</Text>
              {group.items.map((item) => (
                <View key={item.id} style={styles.timelineRow}>
                  <View style={styles.timelineRail}>
                    <View style={styles.timelineDot} />
                  </View>

                  {item.workOrderId && workOrdersById[item.workOrderId] ? (
                    <Pressable
                      onPress={() => handleOpenLinkedRepair(item.workOrderId!)}
                      style={({ pressed }) => [styles.eventCard, styles.eventCardLink, pressed && styles.eventCardPressed]}
                    >
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventKind}>{item.title}</Text>
                        <View style={styles.eventHeaderRight}>
                          <Text style={styles.eventDate}>{formatDateTime(item.at)}</Text>
                          <Text style={styles.eventChevron}>{">"}</Text>
                        </View>
                      </View>

                      <Text style={styles.eventType}>Type: {item.eventType}</Text>
                      <Text style={styles.eventBy}>Actor: {item.actor}</Text>

                      {item.workOrderText ? <Text style={styles.eventWo}>{item.workOrderText}</Text> : null}
                      {item.statusText ? <Text style={styles.eventMeta}>Status: {item.statusText}</Text> : null}
                      {item.inspectionText ? (
                        <Text style={styles.eventMeta}>Inspection: {item.inspectionText}</Text>
                      ) : null}
                      {item.attachmentsText ? (
                        <Text style={styles.eventMeta}>Attachments: {item.attachmentsText}</Text>
                      ) : null}
                      {item.notes ? <Text style={styles.eventNotes}>{item.notes}</Text> : null}
                    </Pressable>
                  ) : (
                    <View style={styles.eventCard}>
                      <View style={styles.eventHeader}>
                        <Text style={styles.eventKind}>{item.title}</Text>
                        <Text style={styles.eventDate}>{formatDateTime(item.at)}</Text>
                      </View>

                      <Text style={styles.eventType}>Type: {item.eventType}</Text>
                      <Text style={styles.eventBy}>Actor: {item.actor}</Text>

                      {item.workOrderText ? <Text style={styles.eventWo}>{item.workOrderText}</Text> : null}
                      {item.statusText ? <Text style={styles.eventMeta}>Status: {item.statusText}</Text> : null}
                      {item.inspectionText ? (
                        <Text style={styles.eventMeta}>Inspection: {item.inspectionText}</Text>
                      ) : null}
                      {item.attachmentsText ? (
                        <Text style={styles.eventMeta}>Attachments: {item.attachmentsText}</Text>
                      ) : null}
                      {item.notes ? <Text style={styles.eventNotes}>{item.notes}</Text> : null}
                    </View>
                  )}
                </View>
              ))}
            </View>
          ))}

          <View style={styles.bottomSpacer} />
        </SafeView>
      </ScrollView>
    </AssetDetailRenderBoundary>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  contentContainer: { paddingBottom: 8 },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 16 },
  createWoButton: {
    backgroundColor: "#1d4ed8",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 12,
    alignItems: "center",
  },
  createWoButtonDisabled: {
    backgroundColor: "#94a3b8",
  },
  createWoButtonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
  },
  bridgeActionHint: {
    color: "#475569",
    fontSize: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  label: { fontSize: 14, color: "#64748b", fontWeight: "600" },
  value: { fontSize: 14, color: "#111827" },
  signSection: { marginBottom: 10 },
  bridgeSection: {
    marginTop: 16,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#f8fafc",
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
  },
  bridgeSectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 6,
  },
  bridgeSummary: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "700",
    marginBottom: 2,
  },
  bridgeNote: {
    fontSize: 12,
    color: "#475569",
    marginTop: 8,
  },
  repairsSection: { marginBottom: 8 },
  repairsToggleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  toggleLabel: {
    fontSize: 13,
    color: "#334155",
    fontWeight: "700",
  },
  togglePill: {
    minWidth: 56,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
  },
  togglePillOff: {
    backgroundColor: "#fef2f2",
    borderColor: "#fecaca",
  },
  togglePillOn: {
    backgroundColor: "#ecfdf5",
    borderColor: "#86efac",
  },
  togglePillText: {
    fontSize: 11,
    fontWeight: "800",
    color: "#0f172a",
  },
  repairRow: {
    borderWidth: 1,
    borderColor: "#dbeafe",
    backgroundColor: "#eff6ff",
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  repairTitle: { color: "#1e3a8a", fontSize: 13, fontWeight: "700" },
  repairSubtitle: { color: "#475569", fontSize: 12, marginTop: 2 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#111827",
    marginTop: 24,
    marginBottom: 12,
  },
  groupWrap: {
    marginBottom: 14,
  },
  groupTitle: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "700",
    marginBottom: 8,
  },
  timelineRow: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 8,
  },
  timelineRail: {
    width: 18,
    alignItems: "center",
    marginRight: 8,
  },
  timelineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#2563eb",
    marginTop: 12,
  },
  emptyText: { color: "#94a3b8", fontStyle: "italic", paddingVertical: 8 },
  eventCard: {
    flex: 1,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 8,
    backgroundColor: "#f8fafc",
  },
  eventCardLink: {
    borderColor: "#bfdbfe",
  },
  eventCardPressed: {
    opacity: 0.86,
  },
  eventHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  eventHeaderRight: {
    flexDirection: "row",
    alignItems: "center",
  },
  eventKind: { fontSize: 14, fontWeight: "700", color: "#1e293b" },
  eventDate: { fontSize: 12, color: "#64748b" },
  eventChevron: { fontSize: 15, color: "#1d4ed8", marginLeft: 6, fontWeight: "700" },
  eventType: { fontSize: 12, color: "#0f172a", marginTop: 2, marginBottom: 2 },
  eventBy: { fontSize: 12, color: "#64748b", marginBottom: 2 },
  eventMeta: { fontSize: 12, color: "#334155", marginTop: 2 },
  eventNotes: { fontSize: 13, color: "#334155", marginTop: 4 },
  eventWo: { fontSize: 12, color: "#1d4ed8", marginTop: 4, fontWeight: "600" },
  bottomSpacer: { height: 40 },
});
