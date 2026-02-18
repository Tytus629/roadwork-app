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
 */

import React, { useMemo, useRef, useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, Pressable, Alert, Button } from "react-native";
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, LatLng as MapLatLng, MapPressEvent, Region, MapType } from "react-native-maps";
import type { WorkType } from "../types/workItem";
import WorkItemSheet, { DraftWorkOrder } from "../components/WorkItemSheet";
import { createPointWorkOrder, createLineWorkOrder, updateSignDetails } from "../services/workOrdersService";
import { uid } from "../utils/uid";
import { requestLocationPermission } from "../native/location";
import Geolocation from "@react-native-community/geolocation";
import CreateWizardModal from "../components/CreateWizardModal";
import { formatWorkType } from "../constants/workOrderTypes";
import { useMapWorkOrders } from "../hooks/useMapWorkOrders";
import type { BBox, WorkOrderRow, LatLng } from "../db/types";
import { useWorkOrderFilter } from "../state/FilterContext";
import { WorkOrderFilterSheet } from "../components/WorkOrderFilterSheet";
import { useAppDispatch } from "../store/hooks";
import { addLog } from "../store/workLogSlice";
import { getNotificationSettings } from "./SettingsScreen";
import { notifyWorkOrderCreated } from "../services/notify";
import { subscribeMapFocus, peekLastMapFocus, clearLastMapFocus } from "../state/MapFocusEvents";
import { useFocusEffect } from "@react-navigation/native";
import { upsertSignForWorkOrder } from "../api/signs";
import { getOrgId } from "../services/orgSettings";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { getFunctions, httpsCallable } from "@react-native-firebase/functions";

/**
 * Helper: Convert map region (center + deltas) to bounding box (min/max corners)
 * Used for efficient SQLite queries - only fetch work orders in visible area
 */
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

/**
 * Helper: Convert zoom level to map deltas for animateToRegion
 */
function deltaFor(zoom?: "close" | "street" | "wide") {
  if (zoom === "close") return { latitudeDelta: 0.003, longitudeDelta: 0.003 };
  if (zoom === "wide") return { latitudeDelta: 0.06, longitudeDelta: 0.06 };
  return { latitudeDelta: 0.012, longitudeDelta: 0.012 }; // street default
}

/**
 * Helper: Convert zoom level to camera zoom number
 */
function zoomToNum(z?: "close" | "street" | "wide") {
  if (z === "close") return 18;
  if (z === "wide") return 13;
  return 16; // street default
}

export default function MapScreen() {
  const dispatch = useAppDispatch();
  const mapRef = useRef<MapView>(null);
  const pendingFocusRef = useRef<any>(null);
  const [mapReady, setMapReady] = useState(false);

  // Focus lock prevents "restore viewport" or GPS follow from overriding focus for ~1.5s
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
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // GPS TRACKING STATE
  // myLoc: Current device location with accuracy
  // followMe: When true, map auto-centers on GPS position (disable on manual pan)
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [followMe, setFollowMe] = useState(true);

  // MAP DISPLAY STATE
  // Toggle between satellite and standard map view
  const [mapType, setMapType] = useState<MapType>("satellite");

  // CREATION FLOW STATE
  // wizardOpen: CreateWizardModal visible (choose work type + creation method)
  // pickingLocation: User is tapping map to place work order
  // pickType: Type of work order being created (Sign, Pothole, etc.)
  // createGeometryMode: "point" for single tap, "line" for multi-tap polyline
  // draftLine: Accumulated tap points when drawing line work order
  const [wizardOpen, setWizardOpen] = useState(false);
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickType, setPickType] = useState<WorkType | null>(null);
  const [createGeometryMode, setCreateGeometryMode] = useState<"point" | "line">("point");
  const [draftLine, setDraftLine] = useState<{ lat: number; lng: number }[]>([]);

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
  const { filter } = useWorkOrderFilter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // Initial map position (adjust this for your region)
  const initialRegion: Region = {
    latitude: 46.9965,
    longitude: -120.5478,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  // LIVE DATA: Fetch work orders from SQLite based on visible map area + filters
  // useMapWorkOrders hook subscribes to DbEvents, so map updates when data changes
  const bbox = mapRegion ? regionToBBox(mapRegion) : null;
  const dbItems = useMapWorkOrders(bbox, filter);

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

          // Guard: Don't override if focus lock is active
          if (Date.now() < focusLockUntilRef.current) return;

          if (followMe && mapRef.current) {
            const gpsRegion = { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 };
            setMapRegion(gpsRegion);
            mapRef.current.animateToRegion(gpsRegion, 350);
          }
        },
        () => {},
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

  // Log DB items for debugging
  useEffect(() => {
    console.log(`[MapScreen] DB loaded ${dbItems.length} items in viewport`);
  }, [dbItems.length]);

  /**
   * Apply focus to a specific work order location.
   * Disables follow mode and sets focus lock to prevent GPS from overriding.
   * Sets mapRegion state (controlled) AND animates for smooth transition.
   */
  const applyFocus = useCallback((p: any) => {
    if (!p) return;

    const lat = Number(p.latitude);
    const lng = Number(p.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      console.log("[MapScreen] applyFocus: invalid coords", p);
      return;
    }

    console.log("[MapScreen] applyFocus:", p);

    // Disable follow mode so it doesn't snap back to user's GPS
    setFollowMe(false);
    // Set focus lock to prevent GPS follow from overriding for 1.5s
    focusLockUntilRef.current = Date.now() + 1500;
    setFocusedId(p.workOrderId ?? null);

    const cam = { center: { latitude: lat, longitude: lng }, zoom: zoomToNum(p.zoom) };
    const d = deltaFor(p.zoom);
    const region = { latitude: lat, longitude: lng, ...d };

    // KEY FIX: Set controlled region state - this FORCES the map to move
    setMapRegion(region);

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

  // Apply focus when the Map tab becomes active
  useFocusEffect(
    useCallback(() => {
      // Delay to ensure MapView is rendered after tab switch
      const timer = setTimeout(() => {
        tryApplyPendingFocus();
      }, 150);

      return () => clearTimeout(timer);
    }, [tryApplyPendingFocus])
  );

  // Also try to apply focus when mapReady becomes true
  // (handles case where tab is already visible but map wasn't ready yet)
  useEffect(() => {
    if (mapReady) {
      const timer = setTimeout(() => {
        tryApplyPendingFocus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [mapReady, tryApplyPendingFocus]);

  function toggleMapType() {
    setMapType((prev) => (prev === "standard" ? "satellite" : "standard"));
  }

  function handleUseCurrentLocation(type: WorkType) {
    if (!myLoc) {
      Alert.alert("Location unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }

    setWizardOpen(false);
    stagePoint(myLoc.lat, myLoc.lng, type);
  }

  function handlePickLocation(type: WorkType, mode: "point" | "line") {
    setWizardOpen(false);
    setPickingLocation(true);
    setPickType(type);
    setCreateGeometryMode(mode);
    setDraftLine([]); // Clear any draft line
  }

  function onMapPress(e: MapPressEvent) {
    if (!pickingLocation || !pickType) return;

    const { latitude, longitude } = e.nativeEvent.coordinate;
    const p = { lat: latitude, lng: longitude };

    // Point mode: stage and wait for confirmation
    if (createGeometryMode === "point") {
      setPickingLocation(false);
      stagePoint(latitude, longitude, pickType);
      setPickType(null);
      return;
    }

    // Line mode: add point to draft
    setDraftLine(prev => [...prev, p]);
  }

  async function stagePoint(lat: number, lng: number, type: WorkType) {
    const draft: DraftWorkOrder = {
      type,
      status: "Needs",
      priority: "High",
      point: { lat, lng },
      note: null,
    };
    setDraftWorkOrder(draft);
    setSelectedId(null);
  }

  async function createPoint(
    lat: number,
    lng: number,
    type: WorkType,
    status = "Needs",
    priority = "High",
    note: string | null = null
  ) {
    const now = Date.now();
    const itemId = uid();

    createPointWorkOrder({
      id: itemId,
      type,
      status,
      priority,
      note,
      point: { lat, lng },
      createdAt: now,
    });

    dispatch(addLog({
      id: uid(),
      at: Date.now(),
      workItemId: itemId,
      action: "created",
      message: `Created ${formatWorkType(type)} @ ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }));

    return itemId;
  }

  async function stageLine(points: { lat: number; lng: number }[], type: WorkType) {
    if (points.length < 2) return false;
    const draft: DraftWorkOrder = {
      type,
      status: "Needs",
      priority: "High",
      points: points,
      note: null,
    };
    setDraftWorkOrder(draft);
    setSelectedId(null);
    return true;
  }

  async function createFromDraft(draft: DraftWorkOrder) {
    const now = Date.now();
    const itemId = uid();

    if (draft.point) {
      // Point work order
      createPointWorkOrder({
        id: itemId,
        type: draft.type,
        status: draft.status,
        priority: draft.priority,
        note: draft.note ?? null,
        point: draft.point,
        createdAt: now,
      });

      // If it's a sign with details, upsert sign details separately
      if (draft.type === "sign" && draft.signDetails) {
        updateSignDetails({
          workOrderId: itemId,
          signTypeId: draft.signDetails.signTypeId,
          category: draft.signDetails.category,
          condition: draft.signDetails.condition,
          action: draft.signDetails.action,
          reflectivityIssue: draft.signDetails.reflectivityIssue,
          // Inspection fields
          inspectionVisible: draft.signDetails.inspectionVisible,
          reflectivityScore: draft.signDetails.reflectivityScore,
          delaminationScore: draft.signDetails.delaminationScore,
          appearanceScore: draft.signDetails.appearanceScore,
          postMaterial: draft.signDetails.postMaterial,
          postConditionScore: draft.signDetails.postConditionScore,
        });

        // Sync sign to Firestore (dedupe or create via Cloud Function)
        const orgId = await getOrgId();
        if (orgId && draft.signDetails.signCode && draft.signDetails.signName) {
          try {
            const result = await upsertSignForWorkOrder({
              orgId,
              signCategory: draft.signDetails.signCategory ?? "Other",
              signCode: draft.signDetails.signCode,
              signName: draft.signDetails.signName,
              lat: draft.point.lat,
              lng: draft.point.lng,
            });
            console.log("[MapScreen] Sign upserted via CF:", result.signId, result.merged ? "(merged)" : "(new)");
          } catch (e) {
            console.warn("[MapScreen] Firebase sign upsert failed:", e);
            // Continue - local work order is already saved
          }
        }
      }

      dispatch(addLog({
        id: uid(),
        at: Date.now(),
        workItemId: itemId,
        action: "created",
        message: `Created ${formatWorkType(draft.type)} @ ${draft.point.lat.toFixed(5)}, ${draft.point.lng.toFixed(5)}`,
      }));
    } else if (draft.points && draft.points.length >= 2) {
      // Line work order
      createLineWorkOrder({
        id: itemId,
        type: draft.type,
        status: draft.status,
        priority: draft.priority,
        note: draft.note ?? null,
        points: draft.points,
        createdAt: now,
      });

      // If it's a sign with details, upsert sign details separately
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

        // Sync sign to Firestore (use first point as sign location via Cloud Function)
        const orgId = await getOrgId();
        const firstPoint = draft.points[0];
        if (orgId && draft.signDetails.signCode && draft.signDetails.signName && firstPoint) {
          try {
            const result = await upsertSignForWorkOrder({
              orgId,
              signCategory: draft.signDetails.signCategory ?? "Other",
              signCode: draft.signDetails.signCode,
              signName: draft.signDetails.signName,
              lat: firstPoint.lat,
              lng: firstPoint.lng,
            });
            console.log("[MapScreen] Sign upserted (line) via CF:", result.signId, result.merged ? "(merged)" : "(new)");
          } catch (e) {
            console.warn("[MapScreen] Firebase sign upsert failed:", e);
          }
        }
      }

      dispatch(addLog({
        id: uid(),
        at: Date.now(),
        workItemId: itemId,
        action: "created",
        message: `Created ${formatWorkType(draft.type)} line with ${draft.points.length} points`,
      }));
    }

    // Trigger notification for High/Urgent priority work orders
    const isHighPriority = draft.priority === "High" || draft.priority === "Urgent";
    if (isHighPriority) {
      try {
        const settings = await getNotificationSettings();
        if (settings.notifyHighUrgentOnCreate) {
          const title = `${draft.priority.toUpperCase()} Priority Work Order`;
          const body = `${formatWorkType(draft.type)} created`;
          await notifyWorkOrderCreated(title, body);
          console.log("[MapScreen] Notification sent for", itemId);
        }
      } catch (e) {
        console.warn("[MapScreen] Notification failed:", e);
      }
    }

    setDraftWorkOrder(null);
  }

  async function createLine(
    points: { lat: number; lng: number }[],
    type: WorkType,
    status = "Needs",
    priority = "High",
    note: string | null = null
  ) {
    const now = Date.now();
    const itemId = uid();

    createLineWorkOrder({
      id: itemId,
      type,
      status,
      priority,
      note,
      points: points,
      createdAt: now,
    });

    dispatch(addLog({ 
      id: uid(), 
      at: now, 
      workItemId: itemId, 
      action: "created", 
      message: `Created ${formatWorkType(type)} line work order` 
    }));

    return itemId;
  }

  async function handleFinishLine() {
    if (!pickType) return;
    if (draftLine.length < 2) {
      Alert.alert("Need at least 2 points", "Tap more points to draw a line");
      return;
    }
    await stageLine(draftLine, pickType);
    setDraftLine([]);
    setPickingLocation(false);
    setPickType(null);
  }

  function handleUndoLinePoint() {
    setDraftLine(prev => prev.slice(0, -1));
  }

  function handleCancelLine() {
    setDraftLine([]);
    setPickingLocation(false);
    setPickType(null);
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Map</Text>
        <Text style={styles.subtitle}>
          {pickingLocation
            ? `TAP MAP TO PLACE${pickType ? ` ${formatWorkType(pickType).toUpperCase()}` : ""}`
            : `${followMe ? "Follow: ON" : "Follow: OFF"}${myLoc ? ` • GPS ±${Math.round(myLoc.accuracyM ?? 0)}m` : " • GPS: waiting..."}${mapType === "standard" ? " • Standard" : " • Satellite"}`}
        </Text>
      </View>

      {/* DEV: Bootstrap test button */}
      {__DEV__ && (
        <View style={{ padding: 8, backgroundColor: "#eff6ff" }}>
          <Button title="DEV: Bootstrap Org" onPress={devBootstrapFromMap} />
        </View>
      )}

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
          // Guard: Don't overwrite during focus lock period
          if (Date.now() < focusLockUntilRef.current) return;
          setMapRegion(region);
        }}
        mapType={mapType}
        onMapReady={() => {
          console.log("[MapScreen] onMapReady");
          setMapReady(true);
          // Focus will be applied by useFocusEffect when mapReady becomes true
        }}
      >
        {/* Render work orders from SQLite */}
        {dbItems.map(item => {
          if (item.geomType === "point" && item.lat != null && item.lng != null) {
            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: item.lat, longitude: item.lng }}
                title={formatWorkType(item.type as any)}
                description={`${item.status} • ${item.priority}`}
                onPress={() => {
                  // Don't open sheet if currently drawing a line
                  if (pickingLocation && createGeometryMode === "line") return;
                  setSelectedId(item.id);
                }}
              />
            );
          }

          if (item.geomType === "line" && item.lineJson) {
            try {
              const points = JSON.parse(item.lineJson) as {lat: number; lng: number}[];
              const coords = points.map(p => ({ latitude: p.lat, longitude: p.lng }));
              return <Polyline key={item.id} coordinates={coords} strokeWidth={5} />;
            } catch (e) {
              console.warn("Failed to parse line JSON for", item.id, e);
              return null;
            }
          }

          return null;
        })}

        {/* Draft line during drawing */}
        {draftLine.length >= 2 && (
          <Polyline
            coordinates={draftLine.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={10}
            strokeColor="#f59e0b"
            lineDashPattern={[10, 10]}
          />
        )}

        {/* Draft line points */}
        {draftLine.map((p, i) => (
          <Marker
            key={`draft-${i}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            pinColor="#f59e0b"
            title={`Point ${i + 1}`}
          />
        ))}

        {/* Draft point marker (unsaved work order) */}
        {draftWorkOrder?.point && (
          <Marker
            coordinate={{ latitude: draftWorkOrder.point.lat, longitude: draftWorkOrder.point.lng }}
            pinColor="#f59e0b"
            title={`Draft ${formatWorkType(draftWorkOrder.type)}`}
          />
        )}

        {/* Draft line marker (unsaved work order) */}
        {draftWorkOrder?.points && draftWorkOrder.points.length >= 2 && (
          <Polyline
            coordinates={draftWorkOrder.points.map(p => ({ latitude: p.lat, longitude: p.lng }))}
            strokeWidth={5}
            strokeColor="#f59e0b"
          />
        )}
      </MapView>

      {/* Line Drawing Controls */}
      {pickingLocation && createGeometryMode === "line" && (
        <View style={styles.lineControls}>
          <Text style={styles.lineControlsText}>
            Points: {draftLine.length} • Tap to add points
          </Text>
          <View style={styles.lineControlsButtons}>
            <Pressable onPress={handleUndoLinePoint} disabled={draftLine.length === 0} style={[styles.lineControlBtn, draftLine.length === 0 && styles.lineControlBtnDisabled]}>
              <Text style={styles.lineControlBtnText}>Undo</Text>
            </Pressable>
            <Pressable onPress={handleCancelLine} style={[styles.lineControlBtn, styles.lineControlBtnCancel]}>
              <Text style={styles.lineControlBtnText}>Cancel</Text>
            </Pressable>
            <Pressable onPress={handleFinishLine} disabled={draftLine.length < 2} style={[styles.lineControlBtn, styles.lineControlBtnFinish, draftLine.length < 2 && styles.lineControlBtnDisabled]}>
              <Text style={styles.lineControlBtnText}>Finish</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Floating Create Button: opens wizard */}
      <Pressable onPress={() => setWizardOpen(true)} style={styles.fab}>
        <Text style={styles.fabText}>＋</Text>
      </Pressable>

      {/* Recenter Button */}
      <Pressable onPress={recenterToMe} style={styles.recenter}>
        <Text style={styles.recenterText}>◎</Text>
      </Pressable>

      {/* Follow toggle */}
      <Pressable onPress={() => setFollowMe(v => !v)} style={styles.follow}>
        <Text style={styles.followText}>{followMe ? "Follow ON" : "Follow OFF"}</Text>
      </Pressable>

      {/* Map type toggle */}
      <Pressable onPress={toggleMapType} style={styles.mapTypeBtn}>
        <Text style={styles.mapTypeText}>{mapType === "standard" ? "Satellite" : "Standard"}</Text>
      </Pressable>

      {/* Filter button */}
      <Pressable onPress={() => setFilterSheetOpen(true)} style={styles.filterBtn}>
        <Text style={styles.filterText}>🔍 Filter</Text>
      </Pressable>

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

      <CreateWizardModal
        visible={wizardOpen}
        onCancel={() => setWizardOpen(false)}
        onUseCurrentLocation={handleUseCurrentLocation}
        onPickLocation={handlePickLocation}
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
  header: { padding: 12, paddingBottom: 8, gap: 4 },
  title: { fontSize: 22, fontWeight: "800" },
  subtitle: { fontSize: 12, opacity: 0.7 },
  map: { flex: 1 },

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
  },
  fabText: { color: "white", fontSize: 28, fontWeight: "900", marginTop: -2 },

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
  },
  followText: { color: "white", fontWeight: "900", fontSize: 12 },

  mapTypeBtn: {
    position: "absolute",
    left: 16,
    bottom: 90,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    elevation: 5,
  },
  mapTypeText: { fontWeight: "900", fontSize: 12 },
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
  },
  filterText: { fontWeight: "900", fontSize: 12, color: "white" },
  lineControls: {
    position: "absolute",
    top: 16,
    left: 16,
    right: 16,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    elevation: 8,
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
});
