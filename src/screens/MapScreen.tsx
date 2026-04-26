/**
 * MapScreen.tsx
 * 
 * PURPOSE:
 * Main interactive map interface for viewing and creating work orders spatially.
 * Users can see work orders as pins/lines on the map, filter them, and create new ones.
 * 
 * KEY RESPONSIBILITIES:
 * - Display work orders from SQLite as map markers/polylines
 * - Real-time GPS tracking with follow mode
 * - Create point work orders (tap) or line work orders (multi-tap)
 * - Filter work orders by type/status/priority
 * - Open WorkItemSheet modal for editing work orders
 * 
 * DATA FLOW:
 * 1. useMapWorkOrders hook queries SQLite based on visible map region (bbox)
 * 2. Filter context applied to limit what shows
 * 3. When user creates new work order → immediately saved to SQLite
 * 4. DbEvents triggers re-render to show new pin
 * 5. Tapping pin opens WorkItemSheet with work order ID
 * 
 * STATE ARCHITECTURE:
 * - selectedId (not full object): Prevents stale data, hooks fetch live data
 * - pickingLocation mode: Temporarily disables pin selection while placing new work order
 * - draftLine: Accumulates points for line work orders before creation
 * - currentRegion: Tracked for bbox-based SQLite queries (performance optimization)
 * 
 * CREATION FLOW:
 * 1. User presses FAB → CreateWizardModal opens
 * 2. Choose work type (Sign, Pothole, etc.) and geometry (point/line)
 * 3. If "Use Current Location": immediately create at GPS position
 * 4. If "Pick on Map": enter pickingLocation mode, tap map to place
 * 5. Work order instantly created in SQLite with defaults (Needs/High priority)
 * 6. WorkItemSheet opens for editing details
 * 
 * WHY NO DRAFT STATE:
 * Previously had pendingDraft state, but simplified to immediate creation:
 * - Simpler code (one screen, not two)
 * - Better UX (no extra "Create" button step)
 * - Can still edit everything immediately after creation
 * - Delete button available if user changes mind
 * 
 * ─── ANDROID-SPECIFIC MAP STABILITY PATTERNS ───────────────────────────
 * 
 * MARKER SUPPRESSION (suppressMarkers + suppressTimerRef):
 * Android's native Google Maps view has a bug where markers added to the
 * MapView during the onMapReady lifecycle (while the view is still
 * initializing) silently fail to render. The React components exist in the
 * tree and report correct coordinates, but the native bitmap never appears.
 * 
 * Fix: When onMapReady fires, we set suppressMarkers=true (which removes
 * all <Marker> components from the render tree), wait 150ms for the native
 * view to stabilize, then set suppressMarkers=false (re-adding them). This
 * forces the native map to repaint markers after initialization is complete.
 * 
 * NATIVE pinColor MARKERS (vs. custom View children):
 * We use <Marker pinColor="red"> instead of <Marker><View>...</View></Marker>.
 * Custom View markers use tracksViewChanges + bitmap caching internally. When
 * the native MapView is destroyed (tab switch, low-memory reclaim), those
 * cached bitmaps are lost and never repainted. Native pinColor markers don't
 * rely on bitmap caching and survive lifecycle events reliably.
 * 
 * VIEWPORT RESTORE (focusLockUntilRef):
 * When onMapReady fires after the native map is recreated, Android resets
 * the viewport to its default region. We save the user's last mapRegion in
 * React state and restore it via animateToRegion(mapRegion, 0) in onMapReady.
 * The focusLock mechanism prevents onRegionChangeComplete callbacks (which
 * fire during map recreation) from overwriting the saved viewport with the
 * stale default region during the 600ms stabilization window.
 * 
 * BBOX MEMOIZATION (GPS jitter prevention):
 * GPS watchPosition fires every ~800ms-1.5s with slightly different float
 * coordinates. Without memoization, each GPS update produces a new bbox
 * reference → triggers a new SQLite query → triggers a re-render. We round
 * bbox coordinates to 4 decimals (~11 meters precision) so minor GPS float
 * jitter doesn't produce a new memoized value. The useMemo dependency array
 * also uses rounded values so the identity only changes on real movement.
 * 
 * detachInactiveScreens={false}:
 * Set on the parent Tab.Navigator (AppTabs.tsx) to prevent this screen from
 * being unmounted on tab switch. See AppTabs.tsx header for full explanation.
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Platform, type ViewStyle } from "react-native";
import MapView, { Marker, Polygon as MapPolygon, Polyline, PROVIDER_GOOGLE, MapPressEvent, Region, MapType } from "react-native-maps";
import Svg, { Polygon } from "react-native-svg";
import type { WorkType } from "../types/workItem";
import WorkItemSheet, { DraftWorkOrder } from "../components/WorkItemSheet";
import { workOrdersService, updateSignDetails } from "../services/workOrdersService";
import type { WorkOrder } from "../types/WorkOrder";
import { addLogEntry } from "../services/logService";
import { uid } from "../utils/uid";
import { requestLocationPermission } from "../native/location";
import Geolocation from "@react-native-community/geolocation";
import CreateWizardModal, { type AssetCreateType } from "../components/CreateWizardModal";
import AssetDraftSheet from "../components/AssetDraftSheet";
import {
  formatWorkType,
  getWorkOrderTypeColor,
  getWorkOrderTypePattern,
  getWorkOrderTypeStyle,
} from "../constants/workOrderTypes";
import { useMapWorkOrders } from "../hooks/useMapWorkOrders";
import type { BBox } from "../db/types";
import { useWorkOrderFilter } from "../state/FilterContext";
import { WorkOrderFilterSheet } from "../components/WorkOrderFilterSheet";
import { getNotificationSettings } from "./SettingsScreen";
import { notifyWorkOrderCreated } from "../services/notify";
import { subscribeMapFocus, peekLastMapFocus, clearLastMapFocus } from "../state/MapFocusEvents";
import {
  subscribeMapCreateWorkOrder,
  peekLastMapCreateWorkOrder,
  clearLastMapCreateWorkOrder,
  type MapCreateWorkOrderPayload,
} from "../state/MapCreateWorkOrderEvents";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { StackNavigationProp } from "@react-navigation/stack";
import type { RootStackParamList } from "../navigation/RootNavigator";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAssets } from "../context/AssetsContext";
import { useOrg } from "../state/OrgContext";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";
import { requireOrgId } from "../org/requireOrg";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";
// saveAndEnqueueWorkOrder is now called internally by workOrdersService
import { manualSyncNow } from "../sync/syncScheduler";
import { debugLocalCounts } from "../debug/localDbDebug";
import { normalizeWorkOrderDetailsForType } from "../workOrders/pavementDetails";
import { addWorkOrderPhoto } from "../services/workOrderPhotosService";
import { getCurrentUserIdentitySnapshot } from "../services/userProfileService";
import { toCreatorIdentitySnapshot } from "../utils/userIdentity";
import { assignmentSummaryLabel } from "../utils/workOrderAssignment";
import { assetsService } from "../services/assetsService";
import { type SignVisualShape, type SignVisualStyle } from "../utils/signVisualStyle";
import { normalizeSignEntries } from "../utils/signAssetDetails";
import {
  getAssetCenter,
  getBridgeAssetCorners,
  getCulvertAssetEndpoints,
  getWorkOrderCenter,
  getWorkOrderLinePoints,
  isValidMapCoord,
  normalizeMapCoordPair,
} from "../utils/workOrderGeo";
import { deriveCreateFromAssetPayloadSeedLocation } from "../utils/assetGeometry";
import {
  buildBridgeRing,
  deriveBridgeCenter,
  normalizeBridgeCorners,
} from "../utils/bridgeGeometry";
import {
  assetEmoji,
  getAssetLayerKind,
  getAssetSignVisual,
  matchesAssetLayerFilter,
} from "../utils/assetLayer";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";
import { useColorblindModePreference } from "../settings/colorblindMode";

function regionToBBox(region: Region): BBox {
  const halfLat = region.latitudeDelta / 2;
  const halfLng = region.longitudeDelta / 2;
  return {
    minLat: region.latitude - halfLat,
    maxLat: region.latitude + halfLat,
    minLng: region.longitude - halfLng,
    maxLng: region.longitude + halfLng,
  };
}

function hasMeaningfulRegionChange(prev: Region, next: Region, epsilon = 0.00001): boolean {
  return (
    Math.abs(prev.latitude - next.latitude) > epsilon ||
    Math.abs(prev.longitude - next.longitude) > epsilon ||
    Math.abs(prev.latitudeDelta - next.latitudeDelta) > epsilon ||
    Math.abs(prev.longitudeDelta - next.longitudeDelta) > epsilon
  );
}

/**
 * Helper: Convert zoom level to map deltas for animateToRegion
 */
function deltaFor(zoom?: "close" | "street" | "wide") {
  if (zoom === "close") return { latitudeDelta: 0.003, longitudeDelta: 0.003 };
  if (zoom === "wide") return { latitudeDelta: 0.06, longitudeDelta: 0.06 };
  return { latitudeDelta: 0.012, longitudeDelta: 0.012 }; // street default
}

function getBridgeOverlayStyle(args: {
  region: Region | null | undefined;
  colorblindMode: boolean;
}): {
  fillColor: string;
  strokeColor: string;
  centerFillColor: string;
  centerStrokeColor: string;
  centerTextColor: string;
  polygonStrokeWidth: number;
  ringStrokeWidth: number;
  ringDashPattern?: number[];
} {
  const defaultStyle = {
    fillColor: args.colorblindMode ? "rgba(217, 119, 6, 0.20)" : "rgba(15, 118, 110, 0.18)",
    strokeColor: args.colorblindMode ? "#111827" : "#0f766e",
    centerFillColor: args.colorblindMode ? "#f59e0b" : "#0f766e",
    centerStrokeColor: args.colorblindMode ? "#111827" : "#0b5f56",
    centerTextColor: args.colorblindMode ? "#111827" : "#ecfeff",
    polygonStrokeWidth: 3,
    ringStrokeWidth: 5,
    ringDashPattern: args.colorblindMode ? [8, 4] : undefined,
  };

  if (!args.region || !Number.isFinite(args.region.latitudeDelta) || !Number.isFinite(args.region.longitudeDelta)) {
    return defaultStyle;
  }

  const zoomMetric = Math.max(args.region.latitudeDelta, args.region.longitudeDelta);
  if (zoomMetric <= 0.01) {
    return {
      fillColor: "rgba(15, 118, 110, 0.24)",
      strokeColor: defaultStyle.strokeColor,
      centerFillColor: defaultStyle.centerFillColor,
      centerStrokeColor: defaultStyle.centerStrokeColor,
      centerTextColor: defaultStyle.centerTextColor,
      polygonStrokeWidth: 3.5,
      ringStrokeWidth: 6,
      ringDashPattern: defaultStyle.ringDashPattern,
    };
  }

  if (zoomMetric >= 0.06) {
    return {
      fillColor: args.colorblindMode ? "rgba(217, 119, 6, 0.14)" : "rgba(15, 118, 110, 0.10)",
      strokeColor: defaultStyle.strokeColor,
      centerFillColor: defaultStyle.centerFillColor,
      centerStrokeColor: defaultStyle.centerStrokeColor,
      centerTextColor: defaultStyle.centerTextColor,
      polygonStrokeWidth: 2,
      ringStrokeWidth: 4,
      ringDashPattern: defaultStyle.ringDashPattern,
    };
  }

  return defaultStyle;
}

function isPointInsidePolygon(point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / ((yj - yi) || 1e-12) + xi;

    if (intersects) inside = !inside;
  }
  return inside;
}

function distancePointToBridgeMeters(
  point: { lat: number; lng: number },
  corners: Array<{ lat: number; lng: number }>,
): number | null {
  const ring = buildBridgeRing(corners);
  if (ring.length < 4) return null;
  if (isPointInsidePolygon(point, ring.slice(0, -1))) return 0;
  return distancePointToPolylineMeters(point, ring);
}

function mapDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const toRad = (v: number) => (v * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s1 = Math.sin(dLat / 2);
  const s2 = Math.sin(dLng / 2);
  const aa = s1 * s1 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * s2 * s2;
  return 2 * R * Math.atan2(Math.sqrt(aa), Math.sqrt(1 - aa));
}

function assetTypeToWorkType(assetType: string | null | undefined): WorkType | null {
  const upper = String(assetType ?? "").toUpperCase();
  if (upper === "SIGN") return "sign";
  if (upper === "GUARDRAIL") return "guardrail";
  if (upper === "CULVERT") return "culvert";
  // Bridge has no dedicated work-order type yet; use pavement_repair as a safe default.
  if (upper === "BRIDGE") return "pavement_repair";
  return null;
}

function workTypeToAssetType(workType: WorkType): "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE" | null {
  if (workType === "sign") return "SIGN";
  if (workType === "guardrail") return "GUARDRAIL";
  if (workType === "culvert") return "CULVERT";
  return null;
}

type DraftAsset = {
  type: AssetCreateType;
  point?: { lat: number; lng: number };
  points?: Array<{ lat: number; lng: number }>;
  bridge?: {
    geometryKind: "bridge_corners";
    corners: Array<{ order: 1 | 2 | 3 | 4; lat: number; lng: number }>;
    center: { lat: number; lng: number };
  };
};

function assetCreateTypeColor(type: AssetCreateType | null | undefined): string {
  if (type === "culvert") return "#111827";
  if (type === "guardrail") return "#6b7280";
  if (type === "delineator") return "#f97316";
  if (type === "bridge") return "#0f766e";
  return "#2563eb";
}

function toAssetModelType(type: AssetCreateType): "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE" {
  if (type === "culvert") return "CULVERT";
  if (type === "guardrail") return "GUARDRAIL";
  if (type === "bridge") return "BRIDGE";
  return "SIGN";
}

function distancePointToSegmentMeters(
  p: { lat: number; lng: number },
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  // Equirectangular projection around point p (good for short map distances).
  const toXY = (v: { lat: number; lng: number }) => {
    const mPerDegLat = 111320;
    const mPerDegLng = 111320 * Math.cos((p.lat * Math.PI) / 180);
    return {
      x: (v.lng - p.lng) * mPerDegLng,
      y: (v.lat - p.lat) * mPerDegLat,
    };
  };

  const p0 = { x: 0, y: 0 };
  const a0 = toXY(a);
  const b0 = toXY(b);
  const abx = b0.x - a0.x;
  const aby = b0.y - a0.y;
  const ab2 = abx * abx + aby * aby;
  if (ab2 <= 1e-6) {
    const dx = p0.x - a0.x;
    const dy = p0.y - a0.y;
    return Math.hypot(dx, dy);
  }
  const t = Math.max(0, Math.min(1, ((p0.x - a0.x) * abx + (p0.y - a0.y) * aby) / ab2));
  const projX = a0.x + t * abx;
  const projY = a0.y + t * aby;
  return Math.hypot(p0.x - projX, p0.y - projY);
}

function distancePointToPolylineMeters(
  p: { lat: number; lng: number },
  points: Array<{ lat: number; lng: number }>,
): number | null {
  if (!Array.isArray(points) || points.length < 2) return null;
  let best: number | null = null;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    const d = distancePointToSegmentMeters(p, a, b);
    if (!Number.isFinite(d)) continue;
    if (best == null || d < best) best = d;
  }
  return best;
}

/**
 * Helper: Convert zoom level to camera zoom number
 */
function zoomToNum(z?: "close" | "street" | "wide") {
  if (z === "close") return 18;
  if (z === "wide") return 13;
  return 16; // street default
}

function signShapeStyle(shape: SignVisualShape): ViewStyle {
  switch (shape) {
    case "octagon":
      return styles.assetSignOctagon;
    case "rectangle":
      return styles.assetSignRectangle;
    case "diamond":
      return styles.assetSignDiamond;
    case "pentagon":
      return styles.assetSignPentagon;
    case "crossbuck":
      return styles.assetSignCrossbuck;
    case "circle":
      return styles.assetSignCircle;
    case "bar":
      return styles.assetSignBar;
    case "street":
      return styles.assetSignStreet;
    case "unknown":
      return styles.assetSignUnknown;
    default:
      return styles.assetSignRectangle;
  }
}

function isStopVisual(visual: SignVisualStyle): boolean {
  const normalized = String(visual.normalizedType ?? "").toUpperCase();
  return (
    visual.kind === "STOP" ||
    visual.shortLabel === "STOP" ||
    normalized.includes("STOP") ||
    normalized.includes("R1-1") ||
    normalized.includes("R11")
  );
}

function isStopAssetData(asset: any): boolean {
  const details = asset?.details && typeof asset.details === "object" ? asset.details : null;
  const normalizedSigns = normalizeSignEntries(details);
  const first = normalizedSigns[0] ?? null;

  const bag = [
    asset?.subtype,
    asset?.signTypeId,
    asset?.signType,
    asset?.signLabel,
    asset?.signName,
    asset?.signCode,
    asset?.mutcdCode,
    details?.signTypeId,
    details?.signType,
    details?.signLabel,
    details?.signName,
    details?.signCode,
    details?.mutcdCode,
    first?.signTypeId,
    first?.signLabel,
    first?.signCode,
  ]
    .map((v) => String(v ?? "").trim().toUpperCase())
    .filter(Boolean)
    .map((v) => v.replace(/[_\s-]+/g, ""));

  return bag.some((v) => v === "STOP" || v.includes("STOP") || v === "R11" || v.includes("R11"));
}

function SignAssetMarker({ visual, forceStop }: { visual: SignVisualStyle; forceStop?: boolean }) {
  const finalShape: SignVisualShape = forceStop || isStopVisual(visual) ? "octagon" : visual.shape;

  if (finalShape === "octagon") {
    return (
      <View collapsable={false} style={styles.assetSignMarkerAnchor}>
        <View style={styles.assetSignOctagonWrap}>
          <Svg width={30} height={30} viewBox="0 0 30 30" style={styles.assetSignOctagonSvg}>
            <Polygon
              points="8,1 22,1 29,8 29,22 22,29 8,29 1,22 1,8"
              fill={visual.borderColor}
            />
            <Polygon
              points="9.8,3.2 20.2,3.2 26.8,9.8 26.8,20.2 20.2,26.8 9.8,26.8 3.2,20.2 3.2,9.8"
              fill={visual.fillColor}
            />
          </Svg>
          <Text style={[styles.assetSignOctagonText, { color: visual.textColor }]} numberOfLines={1}>
            {visual.shortLabel}
          </Text>
        </View>
      </View>
    );
  }

  if (finalShape === "triangle") {
    return (
      <View collapsable={false} style={styles.assetSignMarkerAnchor}>
        <View style={styles.assetSignTriangleWrap}>
          <View style={[styles.assetSignTriangleOuter, { borderTopColor: visual.borderColor }]} />
          <View style={[styles.assetSignTriangleInner, { borderTopColor: visual.fillColor }]} />
          <Text style={[styles.assetSignTriangleText, { color: visual.textColor }]} numberOfLines={1}>
            {visual.shortLabel}
          </Text>
        </View>
      </View>
    );
  }

  const isDiamond = finalShape === "diamond";

  return (
    <View collapsable={false} style={styles.assetSignMarkerAnchor}>
      <View
        style={[
          styles.assetSignMarkerBase,
          signShapeStyle(finalShape),
          { backgroundColor: visual.fillColor, borderColor: visual.borderColor },
          isDiamond && styles.assetSignDiamondRotation,
        ]}
      >
        <Text
          style={[
            styles.assetSignMarkerText,
            { color: visual.textColor },
            isDiamond && styles.assetSignDiamondText,
          ]}
          numberOfLines={1}
        >
          {visual.shortLabel}
        </Text>
      </View>
    </View>
  );
}

function EmojiAssetMarker({ emoji }: { emoji: string }) {
  return (
    <View collapsable={false} style={styles.assetSignMarkerAnchor}>
      <View style={styles.assetEmojiMarkerBubble}>
        <Text style={styles.assetEmojiText}>{emoji}</Text>
      </View>
    </View>
  );
}

function BridgeAssetMarker(args: {
  shortLabel: string;
  fillColor: string;
  strokeColor: string;
  textColor: string;
}) {
  return (
    <View collapsable={false} style={styles.assetSignMarkerAnchor}>
      <View style={[styles.bridgeMarkerBubble, { backgroundColor: args.fillColor, borderColor: args.strokeColor }]}>
        <View style={[styles.bridgeMarkerDeck, { backgroundColor: args.strokeColor }]} />
        <Text style={[styles.bridgeMarkerText, { color: args.textColor }]}>{args.shortLabel}</Text>
      </View>
    </View>
  );
}

function formatStatusLabel(status: string): string {
  if (status === "Needs") return "Needs Work";
  if (status === "Done") return "Completed";
  if (status === "Deferred") return "Archived";
  return status;
}

const MAP_LEGEND_SAMPLE_TYPES: WorkType[] = [
  "pavement_repair",
  "brushing",
  "culvert",
  "sign",
  "spraying",
];

function getCulvertEndpoints(asset: any): { inlet: { lat: number; lng: number }; outlet: { lat: number; lng: number } } | null {
  if (asset?.assetType !== "CULVERT") return null;
  const endpoints = getCulvertAssetEndpoints(asset);
  if (!endpoints) return null;

  if (!isValidMapCoord(endpoints.inlet) || !isValidMapCoord(endpoints.outlet)) {
    if (__DEV__) {
      console.warn("[CULVERT][MAP] Excluding culvert line with invalid endpoints", {
        assetId: asset?.id,
        inlet: endpoints.inlet,
        outlet: endpoints.outlet,
      });
    }
    return null;
  }

  // Degenerate line is handled as a marker fallback in asset marker rendering.
  if (
    Math.abs(endpoints.inlet.lat - endpoints.outlet.lat) < 0.000001 &&
    Math.abs(endpoints.inlet.lng - endpoints.outlet.lng) < 0.000001
  ) {
    if (__DEV__) {
      console.log("[CULVERT][MAP] Degenerate culvert line, fallback to marker", {
        assetId: asset?.id,
      });
    }
    return null;
  }

  return endpoints;
}

export default function MapScreen() {
  const colorblindMode = useColorblindModePreference();
  const insets = useSafeAreaInsets();
  const tabBarBottomOffset = Platform.OS === "android"
    ? Math.max(insets.bottom + 16, 28)
    : Math.max(insets.bottom, 8);
  const tabBarTopFromBottom = tabBarBottomOffset + 40;
  const controlsBaseBottom = tabBarTopFromBottom + 14;
  const followBottom = controlsBaseBottom;
  const filterBottom = controlsBaseBottom + 58;
  const legendBottom = controlsBaseBottom + 118;
  const rightFabBottom = controlsBaseBottom;
  const rightRecenterBottom = controlsBaseBottom + 66;

  const { orgId, role } = useOrg();
  const canCreateWorkOrder = hasRolePermission("createWorkOrder", role);
  const canManageAssets = hasRolePermission("manageAssets", role);
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { assets, loadAssetsInViewport } = useAssets();
  const mapRef = useRef<MapView>(null);
  const pendingFocusRef = useRef<any>(null);
  const pendingCreateFromAssetRef = useRef<MapCreateWorkOrderPayload | null>(null);
  const pendingCreateMapNotReadyLoggedRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);

  // ── MARKER SUPPRESSION STATE ──
  // Briefly set to true when onMapReady fires. While true, all <Marker>
  // components are removed from the render tree. After 150ms, set back to
  // false so markers re-render and native Google Maps paints them correctly.
  // This is a workaround for an Android-specific bug — see header docs.
  const [suppressMarkers, setSuppressMarkers] = useState(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signVisualLogKeyRef = useRef<string>("");
  const signRenderLogKeysRef = useRef<Set<string>>(new Set());

  // ── FOCUS LOCK ──
  // Timestamp until which onRegionChangeComplete callbacks are ignored.
  // Set to Date.now()+600 in onMapReady. Prevents Android's default region
  // from overwriting the user's saved mapRegion during native map recreation.
  const focusLockUntilRef = useRef<number>(0);

  // SELECTION STATE
  // Store only ID, not full object - useWorkOrder hook in WorkItemSheet will fetch live data
  // This prevents stale data issues when work order is updated
  const [selectedId, setSelectedId] = useState<string | null>(null);
  
  // DRAFT STATE
  // draftWorkOrder: Temporary work order being created (not saved to DB yet)
  // User can preview/edit before confirming with "Create Work Order" button
  const [draftWorkOrder, setDraftWorkOrder] = useState<DraftWorkOrder | null>(null);

  // FOCUSED WORK ORDER STATE
  // When navigating from another screen via "Show on Map", this highlights the target
  const [_focusedId, setFocusedId] = useState<string | null>(null);

  // GPS TRACKING STATE
  // myLoc: Current device location with accuracy
  // followMe: When true, map auto-centers on GPS position (disable on manual pan)
  // gpsError: Set when watchPosition reports an error (permission denied, signal lost)
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [followMe, setFollowMe] = useState(true);
  const [gpsError, setGpsError] = useState(false);

  // MAP DISPLAY STATE
  // Toggle between hybrid (satellite + labels) and standard map view
  const [mapType, setMapType] = useState<MapType>("hybrid");

  // CREATION FLOW STATE
  // wizardOpen: CreateWizardModal visible (choose work type + creation method)
  // pickingLocation: User is tapping map to place work order
  // pickType: Type of work order being created (Sign, Pothole, etc.)
  // createGeometryMode: "point" for single tap, "line" for multi-tap polyline
  // draftLine: Accumulated tap points when drawing line work order
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickType, setPickType] = useState<WorkType | null>(null);
  const [pickAssetType, setPickAssetType] = useState<AssetCreateType | null>(null);
  const [createGeometryMode, setCreateGeometryMode] = useState<"point" | "line" | "bridge_corners">("point");
  const [draftLine, setDraftLine] = useState<{ lat: number; lng: number }[]>([]);
  const [draftAsset, setDraftAsset] = useState<DraftAsset | null>(null);
  const [savingDraftAsset, setSavingDraftAsset] = useState(false);

  // MAP REGION TRACKING
  // mapRegion: CONTROLLED region state - single source of truth for viewport
  // This ensures setMapRegion() actually moves the map even if animations fail
  // currentRegion was only used for bbox queries, now mapRegion serves both purposes
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: 46.9965,
    longitude: -120.5478,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });

  // FILTER STATE
  // Filter context provides global filter (type/status/priority)
  // filterSheetOpen: WorkOrderFilterSheet modal visibility
  const { filter, showAssets, assetLayerFilter } = useWorkOrderFilter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // Initial map position (adjust this for your region)


  // LIVE DATA: Fetch work orders from SQLite based on visible map area + filters
  // useMapWorkOrders hook subscribes to DbEvents, so map updates when data changes
  //
  // BBOX MEMOIZATION — WHY ROUNDING:
  // GPS watchPosition fires every ~800ms with slightly different float values.
  // Without rounding, each tick creates a new bbox → new SQL query → new render.
  // Rounding to 4 decimals (~11m) absorbs GPS float jitter while still updating
  // when the user actually pans or zooms the map. The dependency array also uses
  // rounded values so useMemo's identity check matches the rounded output.
  const bbox = useMemo(() => {
    if (!mapRegion) return null;
    const b = regionToBBox(mapRegion);
    // Round to 4 decimals (~11m) to avoid jitter re-queries
    return {
      minLat: Math.round(b.minLat * 10000) / 10000,
      maxLat: Math.round(b.maxLat * 10000) / 10000,
      minLng: Math.round(b.minLng * 10000) / 10000,
      maxLng: Math.round(b.maxLng * 10000) / 10000,
    };
  }, [
    mapRegion?.latitude && Math.round(mapRegion.latitude * 10000),
    mapRegion?.longitude && Math.round(mapRegion.longitude * 10000),
    mapRegion?.latitudeDelta && Math.round(mapRegion.latitudeDelta * 10000),
    mapRegion?.longitudeDelta && Math.round(mapRegion.longitudeDelta * 10000),
  ]);
  const dbItems = useMapWorkOrders(bbox, filter, orgId);

  const visibleAssets = useMemo(
    () => assets.filter((asset) => matchesAssetLayerFilter(asset, assetLayerFilter)),
    [assets, assetLayerFilter],
  );

  const signVisualByAssetId = useMemo(() => {
    const byId: Record<string, SignVisualStyle> = {};
    for (const asset of visibleAssets) {
      const layer = getAssetLayerKind(asset);
      if (layer !== "sign" && layer !== "delineator") continue;
      byId[asset.id] = getAssetSignVisual(asset);
    }
    return byId;
  }, [visibleAssets]);

  const signVisualDiagnostics = useMemo(() => {
    const styleCounts: Record<string, number> = {};
    const normalizedCounts: Record<string, number> = {};
    let total = 0;
    let fallbackCount = 0;

    for (const asset of visibleAssets) {
      const layer = getAssetLayerKind(asset);
      if (layer !== "sign" && layer !== "delineator") continue;
      const visual = signVisualByAssetId[asset.id];
      if (!visual) continue;
      total += 1;
      styleCounts[visual.kind] = (styleCounts[visual.kind] ?? 0) + 1;
      const normalized = visual.normalizedType ?? "UNKNOWN";
      normalizedCounts[normalized] = (normalizedCounts[normalized] ?? 0) + 1;
      if (visual.usedFallback) fallbackCount += 1;
    }

    return { total, fallbackCount, styleCounts, normalizedCounts };
  }, [visibleAssets, signVisualByAssetId]);

  const bridgeOverlayStyle = useMemo(
    () => getBridgeOverlayStyle({ region: mapRegion, colorblindMode }),
    [colorblindMode, mapRegion?.latitudeDelta, mapRegion?.longitudeDelta],
  );

  // Load nearby assets whenever viewport changes
  useEffect(() => {
    if (orgId && bbox) {
      loadAssetsInViewport(orgId, bbox);
    }
  }, [orgId, bbox?.minLat, bbox?.maxLat, bbox?.minLng, bbox?.maxLng]);

  useEffect(() => {
    if (!__DEV__) return;
    if (!showAssets) return;

    const styleSummary = Object.entries(signVisualDiagnostics.styleCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k}:${v}`)
      .join(",");

    const normalizedSummary = Object.entries(signVisualDiagnostics.normalizedCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([k, v]) => `${k}:${v}`)
      .join(",");

    const nextKey = `${signVisualDiagnostics.total}|${signVisualDiagnostics.fallbackCount}|${styleSummary}|${normalizedSummary}`;
    if (nextKey === signVisualLogKeyRef.current) return;
    signVisualLogKeyRef.current = nextKey;

    console.log(
      `[MapScreen][SignVisual] total=${signVisualDiagnostics.total} fallback=${signVisualDiagnostics.fallbackCount} styles=${styleSummary || "none"} normalized=${normalizedSummary || "none"}`,
    );
  }, [showAssets, signVisualDiagnostics]);

  // GPS TRACKING SETUP
  // Request location permission and start continuous GPS updates
  // Updates myLoc state and auto-centers map if followMe is true
  useEffect(() => {
    let watchId: number | null = null;

    (async () => {
      const ok = await requestLocationPermission();
      if (!ok) return;

      watchId = Geolocation.watchPosition(
        (pos) => {
          const lat = pos.coords.latitude;
          const lng = pos.coords.longitude;
          const accuracyM = pos.coords.accuracy;

          setMyLoc({ lat, lng, accuracyM });
          setGpsError(false);

          // Guard: Don't override if focus lock is active
          if (Date.now() < focusLockUntilRef.current) return;

          if (followMe && mapRef.current) {
            const gpsRegion = { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
            setMapRegion((prev) => (hasMeaningfulRegionChange(prev, gpsRegion) ? gpsRegion : prev));
            mapRef.current.animateToRegion(gpsRegion, 350);
          }
        },
        () => { setGpsError(true); },
        {
          enableHighAccuracy: true,
          distanceFilter: 5,
          interval: 1500,
          fastestInterval: 800,
        } as any
      );
    })();

    return () => {
      if (watchId != null) Geolocation.clearWatch(watchId);
    };
  }, [followMe]);

  // Log DB items for debugging — fires when item count changes
  useEffect(() => {
    if (!__DEV__) return;
    console.log(`[MapScreen] DB loaded ${dbItems.length} items in viewport`);
    const culvertRows = dbItems.filter((i) => String(i.type ?? "").toLowerCase().includes("culvert"));
    console.log(`[CULVERT][MAP] viewportRows=${culvertRows.length} totalRows=${dbItems.length}`);
    const sampleRows = dbItems.slice(0, 5);
    sampleRows.forEach((i, n) => {
      console.log(
        `  [MapScreen] sample[${n}] id=${i.id.slice(0, 8)} geom=${i.geomType} lat=${i.lat} lng=${i.lng} orgId=${(i.orgId ?? "null").slice(0, 8)}`
      );
    });
    if (dbItems.length > sampleRows.length) {
      console.log(`  [MapScreen] ... ${dbItems.length - sampleRows.length} additional rows omitted`);
    }
    if (bbox) {
      console.log(`  [MapScreen] bbox minLat=${bbox.minLat.toFixed(4)} maxLat=${bbox.maxLat.toFixed(4)} minLng=${bbox.minLng.toFixed(4)} maxLng=${bbox.maxLng.toFixed(4)}`);
    }
  }, [dbItems.length]);

  /**
   * Apply focus to a specific work order location.
   * Disables follow mode and sets focus lock to prevent GPS from overriding.
   * Sets mapRegion state (controlled) AND animates for smooth transition.
   */
  const applyFocus = useCallback((p: any) => {
    if (!p) return;

    const normalized = normalizeMapCoordPair(p.latitude, p.longitude);
    if (!normalized || !isValidMapCoord(normalized)) {
      if (__DEV__) {
        console.warn("[CULVERT][FOCUS] invalid focus coordinates", {
          workOrderId: p.workOrderId ?? null,
          latitude: p.latitude,
          longitude: p.longitude,
        });
      }
      return;
    }

    const lat = normalized.lat;
    const lng = normalized.lng;

    console.log("[MapScreen] applyFocus:", { ...p, latitude: lat, longitude: lng });
    if (__DEV__) {
      console.log("[CULVERT][FOCUS] applying", {
        workOrderId: p.workOrderId ?? null,
        latitude: lat,
        longitude: lng,
      });
    }

    // Disable follow mode so it doesn't snap back to user's GPS
    setFollowMe(false);
    // Set focus lock to prevent GPS follow from overriding for 1.5s
    focusLockUntilRef.current = Date.now() + 1500;
    setFocusedId(p.workOrderId ?? null);

    const cam = { center: { latitude: lat, longitude: lng }, zoom: zoomToNum(p.zoom) };
    const d = deltaFor(p.zoom);
    const region = { latitude: lat, longitude: lng, ...d };

    // KEY FIX: Set controlled region state - this FORCES the map to move
    setMapRegion((prev) => (hasMeaningfulRegionChange(prev, region) ? region : prev));

    // Double requestAnimationFrame ensures layout is complete
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        // 1) Prefer camera animation (more reliable)
        try {
          mapRef.current?.animateCamera(cam, { duration: 450 });
        } catch {}
        // 2) Fallback region animation
        try {
          mapRef.current?.animateToRegion(region, 450);
        } catch {}
      });
    });

    // Clear highlight after a moment
    setTimeout(() => {
      setFocusedId((cur) => (cur === p.workOrderId ? null : cur));
    }, 2500);
  }, []);

  // Subscribe to "Show on Map" events from other screens
  // Store as pending - apply only when Map tab is actually visible and ready
  useEffect(() => {
    const unsub = subscribeMapFocus((p) => {
      console.log("[MapScreen] focus event stored:", p.workOrderId);
      pendingFocusRef.current = p;
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = subscribeMapCreateWorkOrder((payload) => {
      pendingCreateFromAssetRef.current = payload;
      pendingCreateMapNotReadyLoggedRef.current = false;
      if (__DEV__) {
        console.log("[CFA][Map] payload", {
          assetId: payload.assetId,
          assetType: payload.assetType,
          hasLatitude: payload.latitude != null,
          hasLongitude: payload.longitude != null,
          linePointsCount: Array.isArray(payload.linePoints) ? payload.linePoints.length : 0,
        });
      }
      logSyncBreadcrumb("map create-from-asset payload received", {
        sourceScreen: "Map",
        assetId: payload.assetId,
        assetType: payload.assetType,
        hasLatitude: payload.latitude != null,
        hasLongitude: payload.longitude != null,
        linePointsCount: Array.isArray(payload.linePoints) ? payload.linePoints.length : 0,
        mapReady,
      });
    });
    return unsub;
  }, [mapReady]);

  // Single function to try applying pending focus
  const tryApplyPendingFocus = useCallback(() => {
    const p = pendingFocusRef.current ?? peekLastMapFocus();
    if (!p) return;
    if (!mapReady) return;

    // Clear immediately to prevent double application
    pendingFocusRef.current = null;
    clearLastMapFocus();

    console.log("[MapScreen] applying pending focus:", p.workOrderId);
    applyFocus(p);
  }, [applyFocus, mapReady]);

  const stageDraftFromAsset = useCallback(
    (payload: MapCreateWorkOrderPayload) => {
      setCustomKeySafe("routeName", "Map");
      setCustomKeySafe("assetId", payload.assetId);
      setCustomKeySafe("assetType", payload.assetType);
      setCustomKeySafe("createSource", "asset_detail");
      setCustomKeySafe("syncStage", "create_from_asset_stage_start");
      logSyncBreadcrumb("map create-from-asset stage start", {
        sourceScreen: "Map",
        assetId: payload.assetId,
        assetType: payload.assetType,
        hasLinePoints: Array.isArray(payload.linePoints) && payload.linePoints.length >= 2,
        latitude: payload.latitude,
        longitude: payload.longitude,
      });

      if (!canCreateWorkOrder) {
        logSyncBreadcrumb("map create-from-asset blocked by role", {
          sourceScreen: "Map",
          assetId: payload.assetId,
          assetType: payload.assetType,
        });
        Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
        return;
      }

      const workType = assetTypeToWorkType(payload.assetType);
      if (!workType) {
        logSyncBreadcrumb("map create-from-asset invalid type", {
          sourceScreen: "Map",
          assetId: payload.assetId,
          assetType: payload.assetType,
          reason: "unsupported_asset_type",
        });
        Alert.alert("Unable to create work order", "Unsupported asset type for create flow.");
        return;
      }

      const seed = deriveCreateFromAssetPayloadSeedLocation(payload);
      const point = seed.ok ? { lat: seed.lat, lng: seed.lng } : null;
      const normalizedLinePoints = seed.ok && Array.isArray(seed.linePoints) ? seed.linePoints : [];
      const pointValidityBucket = seed.presence.hasPoint ? "validPoint" : "missingPoint";
      const lineValidityBucket =
        !Array.isArray(payload.linePoints)
          ? "missingLine"
          : seed.presence.hasLine
            ? "validLine"
            : "invalidLine";
      const derivedCenterAttempted = !seed.presence.hasPoint;
      const derivedCenterSucceeded = seed.ok && seed.source !== "point";
      const chosenLocationSource =
        seed.ok && seed.source === "point"
          ? "assetPoint"
          : seed.ok && seed.source === "line-center"
            ? "derivedLineCenter"
            : "none";

      setCustomKeySafe("chosenLocationSource", chosenLocationSource);
      if (__DEV__) {
        console.log("[CFA][Map] validate", {
          assetId: payload.assetId,
          assetType: payload.assetType,
          pointValidity: pointValidityBucket,
          lineValidity: lineValidityBucket,
          linePointsCount: normalizedLinePoints.length,
          derivedCenterAttempted,
          derivedCenterSucceeded,
          chosenLocationSource,
          derivationOk: seed.ok,
          derivationReason: seed.ok ? undefined : seed.reason,
        });
      }
      logSyncBreadcrumb("map create-from-asset validation", {
        sourceScreen: "Map",
        assetId: payload.assetId,
        assetType: payload.assetType,
        pointValidity: pointValidityBucket,
        lineValidity: lineValidityBucket,
        linePointsCount: normalizedLinePoints.length,
        derivedCenterAttempted,
        derivedCenterSucceeded,
        chosenLocationSource,
        derivationOk: seed.ok,
        derivationReason: seed.ok ? null : seed.reason,
      });

      if (!seed.ok || !point || !isValidMapCoord(point)) {
        const blockerReason = seed.ok
          ? "invalidPoint"
          : seed.reason;
        setCustomKeySafe("blockerReason", blockerReason);
        if (__DEV__) {
          console.warn("[CFA][Map] blocked", {
            assetId: payload.assetId,
            assetType: payload.assetType,
            blockerReason,
            linePointsCount: normalizedLinePoints.length,
          });
        }
        logSyncBreadcrumb("map create-from-asset invalid route params", {
          sourceScreen: "Map",
          assetId: payload.assetId,
          assetType: payload.assetType,
          reason: blockerReason,
          hasLinePoints: seed.presence.hasLine,
          usableLinePointCount: normalizedLinePoints.length,
        });
        Alert.alert("Unable to create work order", "This asset has no usable mapped location.");
        return;
      }

      applyFocus({
        workOrderId: `asset:${payload.assetId}`,
        latitude: point.lat,
        longitude: point.lng,
        zoom: "close",
      });

      setWizardOpen(false);
      setPickingLocation(false);
      setPickType(null);
      setDraftLine([]);
      setSelectedId(null);

      if (workType === "culvert" && normalizedLinePoints.length >= 2) {
        if (normalizedLinePoints.length >= 2) {
          setCustomKeySafe("syncStage", "create_from_asset_draft_ready");
          if (__DEV__) {
            console.log("[CFA][Map] draft_ready", {
              assetId: payload.assetId,
              assetType: payload.assetType,
              chosenLocationSource,
              geometryType: "line",
              linePointsCount: normalizedLinePoints.length,
            });
          }
          logSyncBreadcrumb("map create-from-asset draft ready", {
            sourceScreen: "Map",
            assetId: payload.assetId,
            assetType: payload.assetType,
            workType,
            chosenLocationSource,
            geometryType: "line",
            linePointsCount: normalizedLinePoints.length,
          });
          setDraftWorkOrder({
            type: workType,
            status: "Needs",
            priority: "High",
            points: normalizedLinePoints,
            note: null,
            linkedAssetId: payload.assetId,
            linkedAssetType: payload.assetType,
          });
          return;
        }
      }

      setDraftWorkOrder({
        type: workType,
        status: "Needs",
        priority: "High",
        point,
        note: null,
        linkedAssetId: payload.assetId,
        linkedAssetType: payload.assetType,
      });
      setCustomKeySafe("syncStage", "create_from_asset_draft_ready");
      if (__DEV__) {
        console.log("[CFA][Map] draft_ready", {
          assetId: payload.assetId,
          assetType: payload.assetType,
          chosenLocationSource,
          geometryType: "point",
          linePointsCount: normalizedLinePoints.length,
        });
      }
      logSyncBreadcrumb("map create-from-asset draft ready", {
        sourceScreen: "Map",
        assetId: payload.assetId,
        assetType: payload.assetType,
        workType,
        chosenLocationSource,
        geometryType: "point",
      });
    },
    [applyFocus, canCreateWorkOrder],
  );

  const tryApplyPendingCreateFromAsset = useCallback(() => {
    const payload = pendingCreateFromAssetRef.current ?? peekLastMapCreateWorkOrder();
    if (!payload) return;
    if (!mapReady) {
      if (!pendingCreateMapNotReadyLoggedRef.current) {
        pendingCreateMapNotReadyLoggedRef.current = true;
        logSyncBreadcrumb("map create-from-asset waiting map ready", {
          sourceScreen: "Map",
          assetId: payload.assetId,
          assetType: payload.assetType,
          routeName: "Map",
          syncStage: "create_from_asset_wait_map_ready",
        });
      }
      return;
    }

    pendingCreateMapNotReadyLoggedRef.current = false;

    logSyncBreadcrumb("map create-from-asset payload consumed", {
      sourceScreen: "Map",
      assetId: payload.assetId,
      assetType: payload.assetType,
      routeName: "Map",
      syncStage: "create_from_asset_payload_consumed",
    });

    pendingCreateFromAssetRef.current = null;
    clearLastMapCreateWorkOrder();
    try {
      stageDraftFromAsset(payload);
    } catch (error) {
      recordErrorWithContext(error, {
        message: "map create-from-asset stage failed",
        extras: {
          sourceScreen: "Map",
          routeName: "Map",
          assetId: payload.assetId,
          assetType: payload.assetType,
          syncStage: "create_from_asset_stage_failed",
        },
      });
      Alert.alert("Unable to open create flow", "Please try again.");
    }
  }, [mapReady, stageDraftFromAsset]);

  // Apply focus when the Map tab becomes active
  useFocusEffect(
    useCallback(() => {
      // Delay to ensure MapView is rendered after tab switch
      const timer = setTimeout(() => {
        tryApplyPendingFocus();
        tryApplyPendingCreateFromAsset();
      }, 150);

      return () => clearTimeout(timer);
    }, [tryApplyPendingFocus, tryApplyPendingCreateFromAsset])
  );

  // Also try to apply focus when mapReady becomes true
  // (handles case where tab is already visible but map wasn't ready yet)
  useEffect(() => {
    if (mapReady) {
      const timer = setTimeout(() => {
        tryApplyPendingFocus();
        tryApplyPendingCreateFromAsset();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mapReady, tryApplyPendingFocus, tryApplyPendingCreateFromAsset]);

  function toggleMapType() {
    setMapType((prev) => (prev === "standard" ? "hybrid" : "standard"));
  }

  function handleOpenCreateWizard() {
    if (!canCreateWorkOrder && !canManageAssets) {
      Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
      return;
    }
    setWizardOpen(true);
  }

  function handleUseCurrentLocationAsset(type: AssetCreateType) {
    if (!canManageAssets) {
      Alert.alert("Permission denied", permissionDeniedMessage("manageAssets"));
      return;
    }

    const isLineAsset = type === "culvert" || type === "guardrail";
    const isBridgeAsset = type === "bridge";
    if (isBridgeAsset) {
      setWizardOpen(false);
      setPickingLocation(true);
      setPickType(null);
      setPickAssetType(type);
      setCreateGeometryMode("bridge_corners");
      setDraftLine([]);
      Alert.alert("Bridge Corners", "Tap map to capture corner 1 of 4.");
      return;
    }

    if (isLineAsset) {
      setWizardOpen(false);
      setPickingLocation(true);
      setPickType(null);
      setPickAssetType(type);
      setCreateGeometryMode("line");
      setDraftLine([]);
      Alert.alert("Linear Asset", "Tap map to add line points, then tap Finish.");
      return;
    }

    if (!myLoc) {
      Alert.alert("Location unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }

    setWizardOpen(false);
    stageAssetPoint(myLoc.lat, myLoc.lng, type);
  }

  function handleUseCurrentLocation(type: WorkType) {
    if (!canCreateWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
      return;
    }

    if (type === "culvert") {
      setWizardOpen(false);
      setPickingLocation(true);
      setPickType(type);
      setCreateGeometryMode("line");
      setDraftLine([]);
      Alert.alert(
        "Culvert Inlet/Outlet",
        "Tap map to place inlet first, then outlet so inlet/outlet capture can be enabled.",
      );
      return;
    }

    if (!myLoc) {
      Alert.alert("Location unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }

    setWizardOpen(false);
    stagePoint(myLoc.lat, myLoc.lng, type);
  }

  function handlePickLocation(type: WorkType, mode: "point" | "line") {
    if (!canCreateWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
      return;
    }

    const resolvedMode = type === "culvert" ? "line" : mode;

    setWizardOpen(false);
    setPickingLocation(true);
    setPickType(type);
    setPickAssetType(null);
    setCreateGeometryMode(resolvedMode);
    setDraftLine([]); // Clear any draft line
  }

  function handlePickLocationAsset(type: AssetCreateType, mode: "point" | "line" | "bridge_corners") {
    if (!canManageAssets) {
      Alert.alert("Permission denied", permissionDeniedMessage("manageAssets"));
      return;
    }

    const resolvedMode = type === "bridge"
      ? "bridge_corners"
      : type === "culvert" || type === "guardrail"
        ? "line"
        : mode;

    setWizardOpen(false);
    setPickingLocation(true);
    setPickType(null);
    setPickAssetType(type);
    setCreateGeometryMode(resolvedMode);
    setDraftLine([]);
  }

  const handleAssetTap = useCallback(
    (asset: any, _source: "marker" | "culvert-line" | "guardrail-line") => {
      if (pickingLocation) return;

      const id = String(asset?.id ?? "");
      if (!id) return;

      navigation.navigate("AssetDetail", { assetId: id });
    },
    [navigation, pickingLocation],
  );

  const handleLinearAssetWorkOrderTap = useCallback(
    (item: { id: string }) => {
      if (pickingLocation) return;
      setSelectedId(item.id);
    },
    [pickingLocation],
  );

  function onMapPress(e: MapPressEvent) {
    if (!pickingLocation) {
      const tap = normalizeMapCoordPair(
        e.nativeEvent.coordinate.latitude,
        e.nativeEvent.coordinate.longitude,
      );

      if (tap && isValidMapCoord(tap)) {
        let bestWorkOrderLine: { id: string; distM: number } | null = null;
        for (const item of dbItems) {
          if (item.geomType !== "line") continue;
          const linePoints = getWorkOrderLinePoints(item);
          const distM = distancePointToPolylineMeters(tap, linePoints);
          if (distM == null) continue;
          if (!bestWorkOrderLine || distM < bestWorkOrderLine.distM) {
            bestWorkOrderLine = { id: String(item.id), distM };
          }
        }

        if (bestWorkOrderLine && bestWorkOrderLine.distM <= 20) {
          setSelectedId(bestWorkOrderLine.id);
          return;
        }
      }

      if (showAssets) {
        if (tap && isValidMapCoord(tap)) {
          let best: { id: string; type: string; distM: number } | null = null;
          for (const asset of visibleAssets) {
            const center = getAssetCenter(asset);
            if (!center || !isValidMapCoord(center)) continue;
            const distM = mapDistanceMeters(tap, center);
            if (!best || distM < best.distM) {
              best = { id: String(asset.id), type: String(asset.assetType ?? "UNKNOWN"), distM };
            }
          }

          // Prefer linear-asset geometry when user taps along culvert/guardrail lines.
          let bestLinearAsset: { id: string; type: "CULVERT" | "GUARDRAIL"; distM: number } | null = null;
          let bestBridgeAsset: { id: string; distM: number } | null = null;
          for (const asset of visibleAssets) {
            const assetType = String(asset.assetType ?? "").toUpperCase();
            if (assetType === "CULVERT") {
              const endpoints = getCulvertEndpoints(asset);
              if (!endpoints) continue;
              const distM = distancePointToSegmentMeters(tap, endpoints.inlet, endpoints.outlet);
              if (!bestLinearAsset || distM < bestLinearAsset.distM) {
                bestLinearAsset = { id: String(asset.id), type: "CULVERT", distM };
              }
              continue;
            }

            if (assetType === "GUARDRAIL") {
              const linkedLines = dbItems.filter(
                (wo) =>
                  wo.geomType === "line" &&
                  String(wo.type ?? "").toLowerCase().includes("guardrail") &&
                  String(wo.assetId ?? "") === String(asset.id),
              );

              for (const wo of linkedLines) {
                const linePoints = getWorkOrderLinePoints(wo);
                const distM = distancePointToPolylineMeters(tap, linePoints);
                if (distM == null) continue;
                if (!bestLinearAsset || distM < bestLinearAsset.distM) {
                  bestLinearAsset = { id: String(asset.id), type: "GUARDRAIL", distM };
                }
              }
            }

            if (assetType === "BRIDGE") {
              const corners = getBridgeAssetCorners(asset);
              if (!corners || corners.length !== 4) continue;
              const distM = distancePointToBridgeMeters(tap, corners);
              if (distM == null) continue;
              if (!bestBridgeAsset || distM < bestBridgeAsset.distM) {
                bestBridgeAsset = { id: String(asset.id), distM };
              }
            }
          }

          if (bestBridgeAsset && bestBridgeAsset.distM <= 26) {
            const matched = visibleAssets.find((a) => String(a.id) === bestBridgeAsset.id);
            if (matched) {
              handleAssetTap(matched, "marker");
              return;
            }
          }

          if (bestLinearAsset && bestLinearAsset.distM <= 26) {
            const matched = visibleAssets.find((a) => String(a.id) === bestLinearAsset.id);
            if (matched) {
              handleAssetTap(matched, bestLinearAsset.type === "CULVERT" ? "culvert-line" : "guardrail-line");
              return;
            }
          }

          // Android fallback: if marker press is swallowed by map internals,
          // allow near-tap on culvert to open detail.
          if (best && best.type === "CULVERT" && best.distM <= 18) {
            const matched = visibleAssets.find((a) => String(a.id) === best.id);
            if (matched) {
              handleAssetTap(matched, "marker");
              return;
            }
          }
        }
      }
      return;
    }

    if (!pickingLocation || (!pickType && !pickAssetType)) return;

    const { latitude, longitude } = e.nativeEvent.coordinate;
    const p = { lat: latitude, lng: longitude };

    // Point mode: stage and wait for confirmation
    if (createGeometryMode === "point") {
      setPickingLocation(false);
      if (pickType) {
        stagePoint(latitude, longitude, pickType);
      } else if (pickAssetType) {
        stageAssetPoint(latitude, longitude, pickAssetType);
      }
      setPickType(null);
      setPickAssetType(null);
      return;
    }

    if (createGeometryMode === "bridge_corners") {
      if ((pickAssetType ?? null) !== "bridge") return;
      setDraftLine((prev) => {
        if (prev.length >= 4) return prev;
        const next = [...prev, p];
        if (next.length === 4) {
          const normalized = normalizeBridgeCorners(next);
          if (!normalized) {
            Alert.alert("Invalid bridge corners", "Please capture four valid corner points.");
            return prev;
          }
          const center = deriveBridgeCenter(normalized);
          setDraftAsset({
            type: "bridge",
            point: center,
            points: next,
            bridge: {
              geometryKind: "bridge_corners",
              corners: normalized,
              center,
            },
          });
          setPickingLocation(false);
          setPickType(null);
          setPickAssetType(null);
          return [];
        }
        return next;
      });
      return;
    }

    // Line mode: add point to draft
    setDraftLine(prev => [...prev, p]);
  }

  async function stagePoint(
    lat: number,
    lng: number,
    type: WorkType,
    linkedAsset?: { id: string; assetType?: "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE" | null },
  ) {
    const draft: DraftWorkOrder = {
      type,
      status: "Needs",
      priority: "High",
      point: { lat, lng },
      note: null,
      linkedAssetId: linkedAsset?.id ?? null,
      linkedAssetType: linkedAsset?.assetType ?? workTypeToAssetType(type),
    };
    setDraftWorkOrder(draft);
    setSelectedId(null);
  }

  async function stageLine(
    points: { lat: number; lng: number }[],
    type: WorkType,
    linkedAsset?: { id: string; assetType?: "SIGN" | "GUARDRAIL" | "CULVERT" | "BRIDGE" | null },
  ) {
    if (points.length < 2) return false;
    const draft: DraftWorkOrder = {
      type,
      status: "Needs",
      priority: "High",
      points: points,
      note: null,
      linkedAssetId: linkedAsset?.id ?? null,
      linkedAssetType: linkedAsset?.assetType ?? workTypeToAssetType(type),
    };
    setDraftWorkOrder(draft);
    setSelectedId(null);
    return true;
  }

  function stageAssetPoint(lat: number, lng: number, type: AssetCreateType) {
    setDraftAsset({
      type,
      point: { lat, lng },
    });
    setDraftWorkOrder(null);
    setSelectedId(null);
  }

  function stageAssetLine(points: Array<{ lat: number; lng: number }>, type: AssetCreateType) {
    if (points.length < 2) return false;
    setDraftAsset({
      type,
      points,
    });
    setDraftWorkOrder(null);
    setSelectedId(null);
    return true;
  }

  function stageAssetBridge(points: Array<{ lat: number; lng: number }>) {
    const normalized = normalizeBridgeCorners(points);
    if (!normalized) return false;

    const center = deriveBridgeCenter(normalized);
    setDraftAsset({
      type: "bridge",
      point: center,
      points,
      bridge: {
        geometryKind: "bridge_corners",
        corners: normalized,
        center,
      },
    });
    setDraftWorkOrder(null);
    setSelectedId(null);
    return true;
  }

  async function createFromDraft(draft: DraftWorkOrder) {
    if (!canCreateWorkOrder) {
      Alert.alert("Permission denied", permissionDeniedMessage("createWorkOrder"));
      return;
    }

    const t = Date.now();
    const itemId = uid();
    let createdOk = false;
    const linkedAssetId = String(draft.linkedAssetId ?? "").trim() || null;
    const linkedAssetType =
      linkedAssetId != null
        ? draft.linkedAssetType ?? workTypeToAssetType(draft.type)
        : null;

    // Resolve current identity snapshot (never blocks local write on failure).
    let creator = toCreatorIdentitySnapshot({});
    try {
      const snapshot = await getCurrentUserIdentitySnapshot();
      creator = toCreatorIdentitySnapshot(snapshot);
    } catch (authErr) {
      console.warn("[Offline] Could not resolve identity snapshot, using fallback", authErr);
    }

    const isLine = !draft.point && (draft.points?.length ?? 0) >= 2;

    try {
      const safeOrgId = requireOrgId(orgId);

      // ── Build canonical WorkOrder ──────────────────────────────────
      const wo: WorkOrder = {
        id: itemId,
        orgId: safeOrgId,
        type: draft.type,
        status: draft.status as WorkOrder["status"],
        priority: draft.priority as WorkOrder["priority"],
        geomType: isLine ? "line" : "point",
        lat: draft.point?.lat ?? null,
        lng: draft.point?.lng ?? null,
        line: isLine ? draft.points! : null,
        // bbox is computed by workOrdersRepo.upsert — seed with zeros
        minLat: 0,
        minLng: 0,
        maxLat: 0,
        maxLng: 0,
        note: draft.note ?? null,
        details: normalizeWorkOrderDetailsForType(draft.type, draft.details),
        createdAt: t,
        updatedAt: t,
        createdByUid: creator.uid,
        createdByEmail: creator.email,
        createdByFirstName: creator.firstName,
        createdByLastName: creator.lastName,
        createdByDisplayName: creator.displayName,
        assignedToUid: draft.assignedToUid ?? null,
        assignedToName: draft.assignedToName ?? null,
        assignedToEmail: draft.assignedToEmail ?? null,
        assetId: linkedAssetId,
        assetType: linkedAssetType,
      };

      if (__DEV__ && String(draft.type).toLowerCase().includes("culvert")) {
        console.log("[CULVERT][CREATE] staging work order", {
          workOrderId: wo.id,
          orgId: wo.orgId,
          geomType: wo.geomType,
          point: wo.lat != null && wo.lng != null ? { lat: wo.lat, lng: wo.lng } : null,
          linePoints: wo.line?.length ?? 0,
          center: getWorkOrderCenter(wo),
        });
      }

      // 1) Canonical write + outbox enqueue (single call)
      await workOrdersService.upsertAndEnqueue(wo);

      if (__DEV__ && String(draft.type).toLowerCase().includes("culvert")) {
        console.log("[CULVERT][CREATE] saved+enqueued", {
          workOrderId: wo.id,
          geomType: wo.geomType,
          center: getWorkOrderCenter(wo),
        });
      }

      // 2) Sign details (separate sign_details table)
      if (draft.type === "sign" && draft.signDetails) {
        updateSignDetails({
          workOrderId: itemId,
          signTypeId: draft.signDetails.signTypeId,
          category: draft.signDetails.category,
          condition: draft.signDetails.condition,
          action: draft.signDetails.action,
          reflectivityIssue: draft.signDetails.reflectivityIssue,
          inspectionVisible: draft.signDetails.inspectionVisible,
          reflectivityScore: draft.signDetails.reflectivityScore,
          delaminationScore: draft.signDetails.delaminationScore,
          appearanceScore: draft.signDetails.appearanceScore,
          postMaterial: draft.signDetails.postMaterial,
          postConditionScore: draft.signDetails.postConditionScore,
        });
      }

      // 2b) Persist draft photos once a real work-order id exists
      if (draft.photos?.length) {
        for (const photo of draft.photos) {
          await addWorkOrderPhoto({ workOrderId: itemId, photo });
        }
      }

      // 3) Best-effort sync
      console.log("[Offline] Saved work order + enqueued UPSERT_WORK_ORDER", { workOrderId: itemId });
      try { await manualSyncNow(); } catch {}
      if (__DEV__) debugLocalCounts(safeOrgId);
      createdOk = true;
    } catch (e: any) {
      console.error("[MapScreen] FAILED to create work order", e);
      Alert.alert("Save failed", e?.message ?? "Missing orgId — please select an organization.");
    }

    // 5) Notification (after try/catch so a notification error can't block work)
    const isHighPriority = draft.priority === "High" || draft.priority === "Urgent";
    if (createdOk && isHighPriority) {
      try {
        const settings = await getNotificationSettings();
        if (settings.notifyHighUrgentOnCreate) {
          const title = `${draft.priority.toUpperCase()} Priority Work Order`;
          const body = `${formatWorkType(draft.type)} created`;
          await notifyWorkOrderCreated(title, body, {
            workOrderId: itemId,
            type: formatWorkType(draft.type),
            priority: draft.priority,
          });
          console.log("[MapScreen] Notification sent for", itemId);
        }
      } catch (e) {
        console.warn("[MapScreen] Notification failed:", e);
      }
    }

    setDraftWorkOrder(null);
  }

  async function createAssetFromDraft(draft: DraftAsset, input: { subtype: string | null }) {
    if (!canManageAssets) {
      Alert.alert("Permission denied", permissionDeniedMessage("manageAssets"));
      return;
    }

    if (draft.type === "bridge") {
      const bridgeCorners = draft.bridge?.corners ?? normalizeBridgeCorners(draft.points ?? null);
      if (!bridgeCorners) {
        Alert.alert("Missing bridge geometry", "Capture exactly 4 bridge corners before saving.");
        return;
      }
    }

    if (!draft.point && (!draft.points || draft.points.length < 2)) {
      Alert.alert("Missing location", "Set a valid point or line location before creating the asset.");
      return;
    }

    const now = Date.now();
    const points = draft.points ?? [];
    const point =
      draft.bridge?.center ??
      draft.point ??
      (points.length >= 2
        ? {
            lat: (points[0].lat + points[points.length - 1].lat) / 2,
            lng: (points[0].lng + points[points.length - 1].lng) / 2,
          }
        : null);

    if (!point) {
      Alert.alert("Missing location", "Asset location is invalid or missing.");
      return;
    }

    let creator = toCreatorIdentitySnapshot({});
    try {
      const snapshot = await getCurrentUserIdentitySnapshot();
      creator = toCreatorIdentitySnapshot(snapshot);
    } catch (authErr) {
      console.warn("[Offline] Could not resolve identity snapshot for asset create", authErr);
    }

    const id = uid();
    const modelType = toAssetModelType(draft.type);

    const details: Record<string, any> | null =
      draft.type === "culvert" && points.length >= 2
        ? {
            culvert: {
              inlet: points[0],
              outlet: points[points.length - 1],
            },
          }
        : draft.type === "bridge" && draft.bridge && draft.bridge.corners.length === 4
          ? {
              bridge: {
                geometryKind: "bridge_corners",
                corners: draft.bridge.corners,
                center: draft.bridge.center,
              },
            }
        : draft.type === "guardrail" && points.length >= 2
          ? {
              guardrail: {
                linePoints: points,
              },
            }
          : draft.type === "delineator"
            ? {
                subtype: "DELINEATOR",
                category: "DELINEATOR",
              }
            : null;

    setSavingDraftAsset(true);
    try {
      const safeOrgId = requireOrgId(orgId);
      await assetsService.upsert({
        id,
        orgId: safeOrgId,
        assetType: modelType,
        subtype: input.subtype ?? (draft.type === "delineator" ? "DELINEATOR" : null),
        status: "ACTIVE",
        lat: point.lat,
        lng: point.lng,
        createdAt: now,
        updatedAt: now,
        createdByUid: creator.uid,
        createdByDisplayName: creator.displayName,
        installedAt: null,
        lastEventAt: null,
        lastInspectionAt: null,
        details,
      });
      await assetsService.addEvent({
        id: uid(),
        orgId: safeOrgId,
        assetId: id,
        kind: "NOTE",
        at: now,
        byUid: creator.uid,
        byDisplayName: creator.displayName,
        byEmail: creator.email,
        actorUid: creator.uid,
        actorDisplayName: creator.displayName,
        actorEmail: creator.email,
        notes: "Created asset record.",
        photoIds: null,
        details: {
          _assetLifecycleTag: "MANUAL_CREATE",
          assetType: modelType,
          subtype: input.subtype ?? (draft.type === "delineator" ? "DELINEATOR" : null),
        },
        createdAt: now,
        updatedAt: now,
      });
      try {
        await manualSyncNow();
      } catch {}

      setDraftAsset(null);
      navigation.navigate("AssetDetail", { assetId: id });
    } catch (e: any) {
      console.error("[MapScreen] FAILED to create asset", e);
      Alert.alert("Save failed", e?.message ?? "Could not create asset.");
    } finally {
      setSavingDraftAsset(false);
    }
  }

  async function handleFinishLine() {
    if (!pickType && !pickAssetType) return;
    if (createGeometryMode === "bridge_corners") {
      if (draftLine.length !== 4) {
        Alert.alert("Need 4 corners", "Capture exactly 4 bridge corners.");
        return;
      }
      if (!stageAssetBridge(draftLine)) {
        Alert.alert("Invalid bridge geometry", "Please re-capture the 4 bridge corners.");
        return;
      }
      setDraftLine([]);
      setPickingLocation(false);
      setPickType(null);
      setPickAssetType(null);
      return;
    }

    if (draftLine.length < 2) {
      Alert.alert("Need at least 2 points", "Tap more points to draw a line");
      return;
    }
    if (pickType) {
      await stageLine(draftLine, pickType);
    } else if (pickAssetType) {
      stageAssetLine(draftLine, pickAssetType);
    }
    setDraftLine([]);
    setPickingLocation(false);
    setPickType(null);
    setPickAssetType(null);
  }

  function handleUndoLinePoint() {
    setDraftLine(prev => prev.slice(0, -1));
  }

  function handleCancelLine() {
    setDraftLine([]);
    setPickingLocation(false);
    setPickType(null);
    setPickAssetType(null);
  }



  function recenterToMe() {
    if (!myLoc || !mapRef.current) {
      Alert.alert("Location unavailable", "No GPS fix yet.");
      return;
    }
    mapRef.current.animateToRegion(
      { latitude: myLoc.lat, longitude: myLoc.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      350
    );
  }

  // DEV: Test bootstrap function from MapScreen
  async function devBootstrapFromMap() {
    if (!__DEV__) return;
    try {
      console.log("[MapScreen] DEV bootstrap starting...");
      const auth = getAuth(getApp());
      console.log("[MapScreen] current uid:", auth.currentUser?.uid ?? null);

      const functions = getFunctions(getApp());
      const fn = httpsCallable(functions, "roadwork_devBootstrapOrg");
      const res = await fn({});

      console.log("[MapScreen] DEV bootstrap OK:", res.data);
      Alert.alert(
        "Bootstrap Success ✅",
        `OrgId: ${(res.data as any)?.orgId}\n\nCheck console for details.`
      );
    } catch (e: any) {
      console.error("[MapScreen] DEV bootstrap ERROR message:", e?.message ?? e);
      console.error("[MapScreen] DEV bootstrap ERROR full:", e);
      Alert.alert(
        "Bootstrap Failed ❌",
        `Error: ${e?.message || e}\n\nCheck console for details.`
      );
    }
  }

  const activeDraftColor = draftWorkOrder
    ? getWorkOrderTypeColor(draftWorkOrder.type, { colorblindMode })
    : assetCreateTypeColor(draftAsset?.type ?? pickAssetType);

  return (
    <View style={styles.container}>
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        region={mapRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={onMapPress}
        onPanDrag={() => setFollowMe(false)}
        onRegionChangeComplete={(region) => {
          // VIEWPORT GUARD: During native map recreation, Android fires
          // onRegionChangeComplete with its default region, which would
          // overwrite the user's saved viewport. focusLockUntilRef blocks
          // updates for 600ms after onMapReady to let the animateToRegion
          // restore complete without interference.
          if (Date.now() < focusLockUntilRef.current) return;
          setMapRegion((prev) => (hasMeaningfulRegionChange(prev, region) ? region : prev));
        }}
        mapType={mapType}
        onMapReady={() => {
          console.log("[MapScreen] onMapReady");
          setMapReady(true);

          // ── FOCUS LOCK ──
          // Prevent onRegionChangeComplete from overwriting our saved
          // viewport during the 600ms it takes for native map recreation
          // to settle. Without this, the map snaps to Android's default
          // region before animateToRegion can restore the user's position.
          focusLockUntilRef.current = Math.max(
            focusLockUntilRef.current,
            Date.now() + 600,
          );

          // ── MARKER SUPPRESSION ──
          // Android bug: markers added to GoogleMap during onMapReady
          // initialization silently vanish (React components exist but
          // native bitmaps don't paint). Fix: remove all <Marker> from
          // the render tree, wait 150ms for the native view to stabilize,
          // then re-add them so they paint correctly. See header docs.
          setSuppressMarkers(true);
          if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
          suppressTimerRef.current = setTimeout(() => {
            setSuppressMarkers(false);
            console.log("[MapScreen] markers unsuppressed");
          }, 150);

          // ── VIEWPORT RESTORE ──
          // After native map recreation, restore the user's last viewed
          // region instantly (duration=0) so they don't lose their place.
          if (mapRegion && mapRef.current) {
            requestAnimationFrame(() => {
              mapRef.current?.animateToRegion(mapRegion, 0);
            });
          }
        }}
      >
        {/* Render work orders — suppressed briefly after onMapReady to avoid
            the Android bug where markers added during view creation vanish.
            Uses native pinColor instead of custom View markers because pinColor
            survives native view lifecycle changes (no bitmap cache dependency). */}
        {!suppressMarkers && dbItems.map((item, idx) => {
          if (item.geomType === "point") {
            const center = normalizeMapCoordPair(item.lat, item.lng);
            if (!center || !isValidMapCoord(center)) {
              if (__DEV__ && String(item.type ?? "").toLowerCase().includes("culvert")) {
                console.warn("[CULVERT][MAP] Excluding point work order with invalid coordinates", {
                  workOrderId: item.id,
                  lat: item.lat,
                  lng: item.lng,
                });
              }
              return null;
            }
            const pinColor = getWorkOrderTypeColor(item.type as any, { colorblindMode });
            const typeStyle = getWorkOrderTypeStyle(item.type as any, { colorblindMode });
            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: center.lat, longitude: center.lng }}
                pinColor={pinColor}
                title={`${colorblindMode ? `${typeStyle.shortLabel} • ` : ""}${formatWorkType(item.type as any)} #${idx + 1}`}
                description={`${formatStatusLabel(item.status)} • ${item.priority}\nAssigned: ${assignmentSummaryLabel(item, { unassignedLabel: "Unassigned" })}\n${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}
                onPress={() => {
                  if (pickingLocation) return;
                  handleLinearAssetWorkOrderTap(item);
                }}
              />
            );
          }

          if (item.geomType === "line") {
            const points = getWorkOrderLinePoints(item);
            if (points.length < 2) {
              if (__DEV__ && String(item.type ?? "").toLowerCase().includes("culvert")) {
                console.warn("[CULVERT][MAP] Excluding line work order without valid geometry", {
                  workOrderId: item.id,
                  lineJson: item.lineJson ?? null,
                });
              }
              return null;
            }

            const coords = points.map((p) => ({ latitude: p.lat, longitude: p.lng }));
            const typeKey = String(item.type ?? "").toLowerCase();
            const isGuardrailWorkOrder = typeKey.includes("guardrail");
            const lineColor = getWorkOrderTypeColor(item.type as any, { colorblindMode });
            const dashPattern = getWorkOrderTypePattern(item.type as any, { colorblindMode });
            if (isGuardrailWorkOrder) {
              return (
                <React.Fragment key={item.id}>
                  <Polyline
                    coordinates={coords}
                    strokeWidth={7}
                    strokeColor="#111827"
                    tappable={false}
                  />
                  <Polyline
                    coordinates={coords}
                    strokeWidth={5}
                    strokeColor={lineColor}
                    {...(dashPattern ? { lineDashPattern: dashPattern } : null)}
                    tappable
                    onPress={() => {
                      handleLinearAssetWorkOrderTap(item);
                    }}
                  />
                </React.Fragment>
              );
            }

            return (
              <Polyline
                key={item.id}
                coordinates={coords}
                strokeWidth={5}
                strokeColor={lineColor}
                {...(dashPattern ? { lineDashPattern: dashPattern } : null)}
                tappable
                onPress={() => {
                  handleLinearAssetWorkOrderTap(item);
                }}
              />
            );
          }

          return null;
        })}

        {/* Draft line during drawing */}
        {draftLine.length >= 2 && (
          <Polyline
            coordinates={
              createGeometryMode === "bridge_corners" && draftLine.length >= 3
                ? [...draftLine, draftLine[0]].map((p) => ({ latitude: p.lat, longitude: p.lng }))
                : draftLine.map((p) => ({ latitude: p.lat, longitude: p.lng }))
            }
            strokeWidth={10}
            strokeColor={activeDraftColor}
            lineDashPattern={[10, 10]}
          />
        )}

        {/* Draft line points */}
        {draftLine.map((p, i) => (
          <Marker
            key={`draft-${i}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor={activeDraftColor}
            title={createGeometryMode === "bridge_corners" ? `Corner ${i + 1}` : `Point ${i + 1}`}
          />
        ))}

        {/* Draft point marker (unsaved work order) */}
        {draftWorkOrder?.point && (
          <Marker
            coordinate={{ latitude: draftWorkOrder.point.lat, longitude: draftWorkOrder.point.lng }}
            pinColor={getWorkOrderTypeColor(draftWorkOrder.type, { colorblindMode })}
            title={`Draft ${colorblindMode ? `${getWorkOrderTypeStyle(draftWorkOrder.type, { colorblindMode }).shortLabel} • ` : ""}${formatWorkType(draftWorkOrder.type)}`}
          />
        )}

        {/* Draft line marker (unsaved work order) */}
        {draftWorkOrder?.points && draftWorkOrder.points.length >= 2 && (
          <Polyline
            coordinates={draftWorkOrder.points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={5}
            strokeColor={getWorkOrderTypeColor(draftWorkOrder.type, { colorblindMode })}
            {...(getWorkOrderTypePattern(draftWorkOrder.type, { colorblindMode }) ? { lineDashPattern: getWorkOrderTypePattern(draftWorkOrder.type, { colorblindMode }) } : null)}
          />
        )}

        {draftAsset?.point && (
          <Marker
            coordinate={{ latitude: draftAsset.point.lat, longitude: draftAsset.point.lng }}
            pinColor={assetCreateTypeColor(draftAsset.type)}
            title={`Draft ${draftAsset.type}`}
          />
        )}

        {draftAsset?.points && draftAsset.points.length >= 2 && (
          <Polyline
            coordinates={
              draftAsset.type === "bridge" && draftAsset.points.length >= 3
                ? [...draftAsset.points, draftAsset.points[0]].map((p) => ({ latitude: p.lat, longitude: p.lng }))
                : draftAsset.points.map((p) => ({ latitude: p.lat, longitude: p.lng }))
            }
            strokeWidth={5}
            strokeColor={assetCreateTypeColor(draftAsset.type)}
          />
        )}

        {/* ── Bridge asset outlines (ordered corner ring) ── */}
        {!suppressMarkers && showAssets && visibleAssets.map((asset) => {
          if (String(asset.assetType ?? "").toUpperCase() !== "BRIDGE") return null;
          const corners = getBridgeAssetCorners(asset);
          if (!corners || corners.length !== 4) return null;

          const footprint = corners.map((p) => ({ latitude: p.lat, longitude: p.lng }));
          const ring = buildBridgeRing(corners).map((p) => ({ latitude: p.lat, longitude: p.lng }));
          return (
            <React.Fragment key={`asset-bridge-footprint-${asset.id}`}>
              <MapPolygon
                coordinates={footprint}
                strokeColor={bridgeOverlayStyle.strokeColor}
                strokeWidth={bridgeOverlayStyle.polygonStrokeWidth}
                fillColor={bridgeOverlayStyle.fillColor}
                tappable
                zIndex={1}
                onPress={() => {
                  handleAssetTap(asset, "marker");
                }}
              />
              <Polyline
                coordinates={ring}
                strokeWidth={bridgeOverlayStyle.ringStrokeWidth}
                strokeColor={bridgeOverlayStyle.strokeColor}
                lineCap="round"
                {...(bridgeOverlayStyle.ringDashPattern ? { lineDashPattern: bridgeOverlayStyle.ringDashPattern } : null)}
                tappable
                zIndex={2}
                onPress={() => {
                  handleAssetTap(asset, "marker");
                }}
              />
            </React.Fragment>
          );
        })}

        {!suppressMarkers && showAssets && visibleAssets.map((asset) => {
          if (String(asset.assetType ?? "").toUpperCase() !== "BRIDGE") return null;
          const center = getAssetCenter(asset);
          if (!center || !isValidMapCoord(center)) return null;
          return (
            <Marker
              key={`asset-bridge-marker-${asset.id}`}
              coordinate={{ latitude: center.lat, longitude: center.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              tracksViewChanges={false}
              zIndex={21}
              onPress={() => {
                handleAssetTap(asset, "marker");
              }}
            >
              <BridgeAssetMarker
                shortLabel={colorblindMode ? "BR" : "Bridge"}
                fillColor={bridgeOverlayStyle.centerFillColor}
                strokeColor={bridgeOverlayStyle.centerStrokeColor}
                textColor={bridgeOverlayStyle.centerTextColor}
              />
            </Marker>
          );
        })}

        {/* ── Culvert asset lines (inlet -> outlet) ── */}
        {!suppressMarkers && showAssets && visibleAssets.map((asset) => {
          const endpoints = getCulvertEndpoints(asset);
          if (!endpoints) return null;

          return (
            <Polyline
              key={`asset-culvert-line-${asset.id}`}
              coordinates={[
                { latitude: endpoints.inlet.lat, longitude: endpoints.inlet.lng },
                { latitude: endpoints.outlet.lat, longitude: endpoints.outlet.lng },
              ]}
              strokeWidth={12}
              strokeColor="#111827"
              lineCap="butt"
              tappable
              zIndex={1}
              onPress={() => {
                handleAssetTap(asset, "culvert-line");
              }}
            />
          );
        })}

        {/* ── Guardrail asset lines (from linked line work orders) ── */}
        {!suppressMarkers && showAssets && visibleAssets.flatMap((asset) => {
          if (String(asset.assetType ?? "").toUpperCase() !== "GUARDRAIL") return [];

          const linkedLineWorkOrders = dbItems.filter(
            (wo) =>
              wo.geomType === "line" &&
              String(wo.type ?? "").toLowerCase().includes("guardrail") &&
              String(wo.assetId ?? "") === String(asset.id),
          );

          return linkedLineWorkOrders
            .map((wo) => {
              const points = getWorkOrderLinePoints(wo);
              if (points.length < 2) return null;

              return (
                <React.Fragment key={`asset-guardrail-line-${asset.id}-${wo.id}`}>
                  <Polyline
                    coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                    strokeWidth={14}
                    strokeColor="#111827"
                    lineCap="butt"
                    tappable={false}
                    zIndex={1}
                  />
                  <Polyline
                    coordinates={points.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
                    strokeWidth={12}
                    strokeColor="#9ca3af"
                    lineCap="butt"
                    tappable
                    zIndex={2}
                    onPress={() => {
                      handleAssetTap(asset, "guardrail-line");
                    }}
                  />
                </React.Fragment>
              );
            })
            .filter((x): x is React.ReactElement => x != null);
        })}

        {/* ── Asset markers (signs, guardrails, culverts) ── */}
        {!suppressMarkers && showAssets && visibleAssets
          .map((asset) => {
            const center = getAssetCenter(asset);
            if (!center || !isValidMapCoord(center)) {
              if (__DEV__ && asset.assetType === "CULVERT") {
                console.warn("[CULVERT][MAP] Excluding asset marker with invalid center", {
                  assetId: asset.id,
                  lat: (asset as any)?.lat,
                  lng: (asset as any)?.lng,
                });
              }
              return null;
            }

            const assetTypeUpper = String(asset.assetType ?? "").toUpperCase();
            if (assetTypeUpper === "BRIDGE") {
              return null;
            }
            const isDelineator = getAssetLayerKind(asset) === "delineator";
            const signVisual = assetTypeUpper === "SIGN" || isDelineator
              ? (signVisualByAssetId[asset.id] ?? getAssetSignVisual(asset))
              : null;
            const useNativeCulvertPin = assetTypeUpper === "CULVERT";
            const forceStopFromAsset = !!signVisual && isStopAssetData(asset);

            if (__DEV__ && signVisual) {
              const forceStop = forceStopFromAsset || isStopVisual(signVisual);
              const finalComponent = forceStop
                ? "octagon"
                : signVisual.shape === "triangle"
                  ? "triangle"
                  : "generic";
              const logKey = `${asset.id}|${signVisual.kind}|${signVisual.shape}|${finalComponent}`;
              if (!signRenderLogKeysRef.current.has(logKey)) {
                signRenderLogKeysRef.current.add(logKey);
                console.log(
                  `[Map][SignRender] asset id=${asset.id} type=${asset.assetType} kind=${signVisual.kind} shape=${signVisual.shape}`,
                );
                if (forceStop) {
                  console.log(
                    `[Map][SignRender] STOP branch reached asset id=${asset.id} source=asset:${forceStopFromAsset ? "1" : "0"} visual:${isStopVisual(signVisual) ? "1" : "0"}`,
                  );
                }
                console.log(
                  `[Map][SignRender] final marker component=${finalComponent} asset id=${asset.id}`,
                );
              }
            }

            return (
              <Marker
                key={`asset-${asset.id}`}
                coordinate={{ latitude: center.lat, longitude: center.lng }}
                {...(!useNativeCulvertPin ? { anchor: { x: 0.5, y: 0.5 } } : null)}
                {...(!useNativeCulvertPin ? { tracksViewChanges: false } : null)}
                {...(useNativeCulvertPin ? { pinColor: "#6b7280" } : null)}
                zIndex={20}
                onPress={() => {
                  handleAssetTap(asset, "marker");
                }}
              >
                {!useNativeCulvertPin && signVisual ? (
                  <SignAssetMarker visual={signVisual} forceStop={forceStopFromAsset} />
                ) : !useNativeCulvertPin ? (
                  <EmojiAssetMarker emoji={assetEmoji(asset)} />
                ) : null}
              </Marker>
            );
          })}
      </MapView>

      {/* Line Drawing Controls */}
      {pickingLocation && (createGeometryMode === "line" || createGeometryMode === "bridge_corners") && (
        <View style={[styles.lineControls, { top: insets.top + 56 }]}>
          <Text style={styles.lineControlsText}>
            {createGeometryMode === "bridge_corners"
              ? `Corner ${Math.min(draftLine.length + 1, 4)} of 4 • Tap map to add corner`
              : `Points: ${draftLine.length} • Tap to add points`}
          </Text>
          <View style={styles.lineControlsButtons}>
            <Pressable onPress={handleUndoLinePoint} disabled={draftLine.length === 0} style={[styles.lineControlBtn, draftLine.length === 0 && styles.lineControlBtnDisabled]}>
              <Text style={styles.lineControlBtnText}>Undo</Text>
            </Pressable>
            <Pressable onPress={handleCancelLine} style={[styles.lineControlBtn, styles.lineControlBtnCancel]}>
              <Text style={styles.lineControlBtnText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleFinishLine}
              disabled={createGeometryMode === "bridge_corners" ? draftLine.length !== 4 : draftLine.length < 2}
              style={[
                styles.lineControlBtn,
                styles.lineControlBtnFinish,
                (createGeometryMode === "bridge_corners" ? draftLine.length !== 4 : draftLine.length < 2) && styles.lineControlBtnDisabled,
              ]}
            >
              <Text style={styles.lineControlBtnText}>{createGeometryMode === "bridge_corners" ? "Use 4 Corners" : "Finish"}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* GPS status badge — top right */}
      <View style={[
        styles.gpsBadge,
        { top: insets.top + 8 },
        gpsError && styles.gpsBadgeError,
        !gpsError && myLoc && (myLoc.accuracyM ?? 99) <= 10 && styles.gpsBadgeGood,
        !gpsError && myLoc && (myLoc.accuracyM ?? 99) > 10 && (myLoc.accuracyM ?? 99) <= 50 && styles.gpsBadgeFair,
        !gpsError && myLoc && (myLoc.accuracyM ?? 99) > 50 && styles.gpsBadgePoor,
      ]}>
        <View style={[
          styles.gpsDot,
          gpsError && { backgroundColor: "#ef4444" },
          !gpsError && !myLoc && { backgroundColor: "#94a3b8" },
          !gpsError && myLoc && (myLoc.accuracyM ?? 99) <= 10 && { backgroundColor: "#22c55e" },
          !gpsError && myLoc && (myLoc.accuracyM ?? 99) > 10 && (myLoc.accuracyM ?? 99) <= 50 && { backgroundColor: "#f59e0b" },
          !gpsError && myLoc && (myLoc.accuracyM ?? 99) > 50 && { backgroundColor: "#f97316" },
        ]} />
        <Text style={styles.gpsText}>
          {gpsError
            ? "No GPS"
            : myLoc
              ? `±${Math.round(myLoc.accuracyM ?? 0)}m`
              : "Acquiring…"}
        </Text>
      </View>

      {/* DEV: Debug overlay showing item count */}
      {__DEV__ && (
        <View style={{
          position: "absolute", top: insets.top + 52, left: 10,
          backgroundColor: "rgba(0,0,0,0.7)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4,
        }}>
          <Text style={{ color: "#fff", fontSize: 12, fontWeight: "bold" }}>
            Pins: {dbItems.filter(i => i.geomType === "point" && i.lat != null).length} / {dbItems.length} total
          </Text>
        </View>
      )}

      <View style={[styles.topLeftControls, { top: insets.top + 8 }]}>
        {/* Map type toggle */}
        <Pressable onPress={toggleMapType} style={styles.mapTypeBtn}>
          <Text style={styles.mapTypeText}>{mapType === "standard" ? "Street View" : "Satellite View"}</Text>
        </Pressable>

        {/* DEV: Bootstrap test overlay */}
        {__DEV__ && (
          <Pressable onPress={devBootstrapFromMap} style={styles.devBootstrapBtn}>
            <Text style={styles.devBootstrapText}>DEV Bootstrap</Text>
          </Pressable>
        )}
      </View>

      {/* Floating Create Button: opens wizard */}
      <Pressable
        onPress={handleOpenCreateWizard}
        style={[
          styles.fab,
          { bottom: rightFabBottom },
          !canCreateWorkOrder && !canManageAssets && styles.fabDisabled,
        ]}
      >
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      {/* Recenter Button */}
      <Pressable onPress={recenterToMe} style={[styles.recenter, { bottom: rightRecenterBottom }]}>
        <Text style={styles.recenterText}>◎</Text>
      </Pressable>

      {/* Follow toggle */}
      <Pressable onPress={() => setFollowMe(v => !v)} style={[styles.follow, { bottom: followBottom }]}>
        <Text style={styles.followText}>{followMe ? "Follow ON" : "Follow OFF"}</Text>
      </Pressable>

      {/* Filter button */}
      <Pressable onPress={() => setFilterSheetOpen(true)} style={[styles.filterBtn, { bottom: filterBottom }]}>
        <Text style={styles.filterText}>🔍 Filter</Text>
      </Pressable>

      <View style={[styles.legendCard, { bottom: legendBottom }]}>
        <Pressable onPress={() => setLegendCollapsed((v) => !v)} style={styles.legendHeader}>
          <Text style={styles.legendTitle}>Map key</Text>
          <Text style={styles.legendToggle}>{legendCollapsed ? "Show" : "Hide"}</Text>
        </Pressable>
        {!legendCollapsed && (
          <View style={styles.legendRows}>
            {MAP_LEGEND_SAMPLE_TYPES.map((sampleType) => {
              const typeStyle = getWorkOrderTypeStyle(sampleType, { colorblindMode });
              return (
                <View key={sampleType} style={styles.legendRow}>
                  <View style={[styles.legendSwatch, { backgroundColor: typeStyle.color, borderColor: typeStyle.color }]}>
                    {colorblindMode ? <Text style={styles.legendSwatchCode}>{typeStyle.shortLabel.slice(0, 2)}</Text> : null}
                  </View>
                  <View style={styles.legendTextWrap}>
                    <Text style={styles.legendLabel}>{formatWorkType(sampleType)}</Text>
                    {colorblindMode && typeStyle.usesPattern ? (
                      <Text style={styles.legendMeta}>Patterned line / code {typeStyle.shortLabel}</Text>
                    ) : null}
                  </View>
                </View>
              );
            })}

            <View style={styles.legendDivider} />
            <Text style={styles.legendSectionTitle}>Assets</Text>

            <View style={styles.legendRow}>
              <View style={styles.assetLegendMarkerSwatch}>
                <View style={styles.assetLegendMarkerDot} />
              </View>
              <Text style={styles.legendLabel}>Asset marker</Text>
            </View>

            <View style={styles.legendRow}>
              <View
                style={[
                  styles.assetLegendBridgeSwatch,
                  {
                    borderColor: bridgeOverlayStyle.strokeColor,
                    backgroundColor: bridgeOverlayStyle.fillColor,
                  },
                ]}
              >
                <View style={[styles.assetLegendBridgeDot, { backgroundColor: bridgeOverlayStyle.centerFillColor }]} />
              </View>
              <Text style={styles.legendLabel}>Bridge footprint + center</Text>
            </View>
          </View>
        )}
      </View>

      {selectedId && (
        <WorkItemSheet
          mode="existing"
          workItemId={selectedId}
          onClose={() => setSelectedId(null)}
        />
      )}

      {draftWorkOrder && (
        <WorkItemSheet
          mode="draft"
          draftWorkOrder={draftWorkOrder}
          onCreateDraft={createFromDraft}
          onClose={() => setDraftWorkOrder(null)}
        />
      )}

      {draftAsset && (
        <AssetDraftSheet
          draft={draftAsset}
          saving={savingDraftAsset}
          bottomOffset={tabBarTopFromBottom + 12}
          onCreate={(input) => {
            createAssetFromDraft(draftAsset, input);
          }}
          onClose={() => setDraftAsset(null)}
        />
      )}

      <CreateWizardModal
        visible={wizardOpen}
        canCreateWorkOrder={canCreateWorkOrder}
        canCreateAsset={canManageAssets}
        onCancel={() => setWizardOpen(false)}
        onUseCurrentLocation={handleUseCurrentLocation}
        onPickLocation={handlePickLocation}
        onUseCurrentLocationAsset={handleUseCurrentLocationAsset}
        onPickLocationAsset={handlePickLocationAsset}
      />

      <WorkOrderFilterSheet
        visible={filterSheetOpen}
        onClose={() => setFilterSheetOpen(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  assetEmojiText: {
    fontSize: 20,
  },
  assetEmojiMarkerBubble: {
    minWidth: 30,
    minHeight: 30,
    borderRadius: 16,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  bridgeMarkerBubble: {
    minWidth: 32,
    minHeight: 26,
    borderRadius: 9,
    borderWidth: 2,
    paddingHorizontal: 6,
    paddingVertical: 3,
    alignItems: "center",
    justifyContent: "center",
  },
  bridgeMarkerDeck: {
    position: "absolute",
    left: 5,
    right: 5,
    bottom: 4,
    height: 3,
    borderRadius: 999,
    opacity: 0.9,
  },
  bridgeMarkerText: {
    fontSize: 7.5,
    fontWeight: "900",
    letterSpacing: 0.2,
  },
  assetSignMarkerAnchor: {
    width: 44,
    height: 44,
    padding: 4,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  assetSignMarkerBase: {
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  assetSignMarkerText: {
    fontSize: 8,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  assetSignOctagon: {
    width: 26,
    height: 26,
    borderRadius: 6,
  },
  assetSignOctagonWrap: {
    width: 30,
    height: 30,
    alignItems: "center",
    justifyContent: "center",
  },
  assetSignOctagonSvg: {
    position: "absolute",
    left: 0,
    top: 0,
  },
  assetSignOctagonText: {
    fontSize: 6.8,
    fontWeight: "900",
    letterSpacing: 0.1,
  },
  assetSignRectangle: {
    width: 30,
    height: 22,
    borderRadius: 3,
  },
  assetSignDiamond: {
    width: 22,
    height: 22,
    borderRadius: 2,
  },
  assetSignDiamondRotation: {
    transform: [{ rotate: "45deg" }],
  },
  assetSignDiamondText: {
    transform: [{ rotate: "-45deg" }],
  },
  assetSignPentagon: {
    width: 28,
    height: 23,
    borderRadius: 5,
  },
  assetSignCrossbuck: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  assetSignCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
  },
  assetSignBar: {
    width: 32,
    height: 18,
    borderRadius: 3,
  },
  assetSignStreet: {
    width: 36,
    height: 18,
    borderRadius: 3,
  },
  assetSignUnknown: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
  assetSignTriangleWrap: {
    width: 30,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    overflow: "visible",
  },
  assetSignTriangleOuter: {
    position: "absolute",
    width: 0,
    height: 0,
    borderLeftWidth: 11,
    borderRightWidth: 11,
    borderTopWidth: 20,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  assetSignTriangleInner: {
    position: "absolute",
    top: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 8.5,
    borderRightWidth: 8.5,
    borderTopWidth: 15,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  assetSignTriangleText: {
    position: "absolute",
    top: 5,
    fontSize: 7,
    fontWeight: "900",
  },

  placeBar: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 88,
    padding: 12,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fab: {
    position: "absolute",
    right: 16,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#111827",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  fabText: { color: "white", fontSize: 28, fontWeight: "900", marginTop: -2 },
  fabDisabled: {
    opacity: 0.55,
  },

  recenter: {
    position: "absolute",
    right: 16,
    bottom: 90,
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
    justifyContent: "center",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  recenterText: { fontSize: 20, fontWeight: "900" },

  follow: {
    position: "absolute",
    left: 16,
    bottom: 24,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#111827",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  followText: { color: "white", fontWeight: "900", fontSize: 12 },

  topLeftControls: {
    position: "absolute",
    left: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  mapTypeBtn: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.88)",
    borderWidth: 1,
    borderColor: "#facc15",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  mapTypeText: { fontWeight: "900", fontSize: 12, color: "#facc15" },
  filterBtn: {
    position: "absolute",
    left: 16,
    bottom: 140,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: "#3b82f6",
    borderWidth: 1,
    borderColor: "#2563eb",
    elevation: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 3,
  },
  filterText: { fontWeight: "900", fontSize: 12, color: "white" },
  legendCard: {
    position: "absolute",
    left: 16,
    maxWidth: 180,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: "rgba(15,23,42,0.9)",
    borderWidth: 1,
    borderColor: "#334155",
  },
  legendHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  legendTitle: {
    color: "#f8fafc",
    fontSize: 11,
    fontWeight: "900",
  },
  legendToggle: {
    color: "#93c5fd",
    fontSize: 11,
    fontWeight: "800",
  },
  legendTextWrap: { flex: 1 },
  legendRows: {
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
    gap: 6,
  },
  legendSwatchCode: {
    fontSize: 8,
    fontWeight: "900",
    color: "#ffffff",
    lineHeight: 10,
  },
  legendDivider: {
    height: 1,
    backgroundColor: "#334155",
    marginVertical: 2,
  },
  legendMeta: {
    fontSize: 11,
    color: "#64748b",
    marginTop: 1,
  },
  legendSectionTitle: {
    color: "#cbd5e1",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  legendSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  legendLabel: {
    color: "#e2e8f0",
    fontSize: 11,
    fontWeight: "700",
  },
  assetLegendMarkerSwatch: {
    width: 10,
    height: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 7,
    backgroundColor: "transparent",
  },
  assetLegendMarkerDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  assetLegendBridgeSwatch: {
    width: 12,
    height: 9,
    borderRadius: 2,
    borderWidth: 1,
    marginRight: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  assetLegendBridgeDot: {
    width: 4,
    height: 4,
    borderRadius: 999,
  },
  assetFilterBarWrap: {
    position: "absolute",
    left: 16,
    right: 88,
  },
  assetFilterRow: {
    gap: 8,
    paddingRight: 8,
  },
  assetFilterChip: {
    paddingVertical: 7,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(15,23,42,0.92)",
    borderWidth: 1,
    borderColor: "#334155",
  },
  assetFilterChipActive: {
    backgroundColor: "#16a34a",
    borderColor: "#15803d",
  },
  assetFilterChipText: {
    color: "#e2e8f0",
    fontWeight: "800",
    fontSize: 11,
  },
  assetFilterChipTextActive: {
    color: "#f0fdf4",
  },
  lineControls: {
    position: "absolute",
    left: 16,
    right: 16,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    borderWidth: 2,
    borderColor: "#f59e0b",
  },
  lineControlsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 8,
    textAlign: "center",
  },
  lineControlsButtons: {
    flexDirection: "row",
  },
  lineControlBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#111827",
    alignItems: "center",
    marginHorizontal: 4,
  },
  lineControlBtnText: {
    color: "white",
    fontSize: 14,
    fontWeight: "700",
  },
  lineControlBtnCancel: {
    backgroundColor: "#ef4444",
  },
  lineControlBtnFinish: {
    backgroundColor: "#10b981",
  },
  lineControlBtnDisabled: {
    backgroundColor: "#cbd5e1",
  },
  gpsBadge: {
    position: "absolute",
    right: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.92)",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  gpsBadgeGood:  { borderColor: "#22c55e" },
  gpsBadgeFair:  { borderColor: "#f59e0b" },
  gpsBadgePoor:  { borderColor: "#f97316" },
  gpsBadgeError: { borderColor: "#ef4444" },
  gpsDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#94a3b8",
  },
  gpsText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1e293b",
  },
  devBootstrapBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: "rgba(30,58,138,0.92)",
    borderWidth: 1,
    borderColor: "#93c5fd",
  },
  devBootstrapText: {
    color: "#dbeafe",
    fontWeight: "800",
    fontSize: 11,
  },
});
