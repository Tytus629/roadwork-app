import React, { useMemo, useRef, useState, useEffect } from "react";
import { View, Text, StyleSheet, Pressable, Alert } from "react-native";
import MapView, { Marker, Polyline, Polygon, PROVIDER_GOOGLE, LatLng, MapPressEvent, Region, MapType } from "react-native-maps";
import { useAppDispatch, useAppSelector } from "../store/hooks";
import { selectVisibleWorkItems } from "../utils/selectWorkItems";
import type { WorkItem, WorkType } from "../types/workItem";
import WorkItemSheet from "../components/WorkItemSheet";
import { createPointWorkOrder, createLineWorkOrder } from "../services/workOrdersService";
import { addLog } from "../store/workLogSlice";
import { uid } from "../utils/uid";
import { requestLocationPermission } from "../native/location";
import Geolocation from "@react-native-community/geolocation";
import CreateWizardModal from "../components/CreateWizardModal";
import { formatWorkType } from "../constants/workOrderTypes";
import { useMapWorkOrders } from "../hooks/useMapWorkOrders";
import type { BBox } from "../db/types";
import { useWorkOrderFilter } from "../state/FilterContext";
import { WorkOrderFilterSheet } from "../components/WorkOrderFilterSheet";
import { WORK_ORDER_TYPE_OPTIONS } from "../constants/workOrderTypes";

// Helper: Convert map region to bbox
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

// Helper function to display user-friendly status labels
function formatStatus(status: string): string {
  if (status === "in_progress") return "In Progress";
  if (status === "completed") return "Completed";
  if (status === "needs") return "Needs";
  if (status === "deferred") return "Deferred";
  return status;
}

export default function MapScreen() {
  const dispatch = useAppDispatch();
  const mapRef = useRef<MapView>(null);

  const items = useAppSelector(s => s.workItems.items);
  const filters = useAppSelector(s => s.workItems.filters);
  const sortMode = useAppSelector(s => s.workItems.sortMode);

  const visible = useMemo(() => selectVisibleWorkItems(items, filters, sortMode), [items, filters, sortMode]);

  // ✅ Store selected ID, not full item (prevents stale data)
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // ✅ Live location
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  const [followMe, setFollowMe] = useState(true);

  // ✅ Map type toggle
  const [mapType, setMapType] = useState<MapType>("satellite");

  // ✅ Wizard modal
  const [wizardOpen, setWizardOpen] = useState(false);

  // ✅ Pick location mode (after choosing "Pick Location" in wizard)
  const [pickingLocation, setPickingLocation] = useState(false);
  const [pickType, setPickType] = useState<WorkType | null>(null);

  // ✅ Line drawing mode
  const [createGeometryMode, setCreateGeometryMode] = useState<"point" | "line">("point");
  const [draftLine, setDraftLine] = useState<{ lat: number; lng: number }[]>([]);

  // ✅ Track map region for bbox queries
  const [currentRegion, setCurrentRegion] = useState<Region | null>(null);

  // ✅ Filter state
  const { filter } = useWorkOrderFilter();
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  const initialRegion: Region = {
    latitude: 46.9965,
    longitude: -120.5478,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  // ✅ Load DB pins based on bbox + filters
  const bbox = currentRegion ? regionToBBox(currentRegion) : null;
  const dbItems = useMapWorkOrders(bbox, filter);

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

          if (followMe && mapRef.current) {
            mapRef.current.animateToRegion(
              { latitude: lat, longitude: lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
              350
            );
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

  function toggleMapType() {
    setMapType((prev) => (prev === "standard" ? "satellite" : "standard"));
  }

  function handleUseCurrentLocation(type: WorkType) {
    if (!myLoc) {
      Alert.alert("Location unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }

    setWizardOpen(false);
    createPoint(myLoc.lat, myLoc.lng, type);
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

    // Point mode: create immediately
    if (createGeometryMode === "point") {
      setPickingLocation(false);
      createPoint(latitude, longitude, pickType);
      setPickType(null);
      return;
    }

    // Line mode: add point to draft
    setDraftLine(prev => [...prev, p]);
  }

  async function createPoint(lat: number, lng: number, type: WorkType) {
    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      type,
      status: "needs",
      priority: "high",
      title: formatWorkType(type),
      notes: "",
      geometry: { kind: "point", coordinates: { lat, lng } },
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
      assignedTo: null,
      photos: [],
      needsSync: true,
    };

    // Initialize type-specific details with sensible defaults
    if (type === "pothole") {
      item.potholeDetails = { severity: "medium", hazard: false, needsPatch: true };
    }
    if (type === "sign") {
      item.signDetails = { signType: "stop", mutcdCode: null, condition: "good", reflectivityIssue: false, obstructed: false, replacementNeeded: false, postLeaning: false, heightOk: true };
    }
    if (type === "spraying") {
      item.sprayingDetails = { target: "weeds", areaType: "shoulder", nearWater: false, posted: false };
    }
    if (type === "brushing") {
      item.brushingDetails = { scope: "spot", areaType: "shoulder", sightDistanceIssue: false, debrisLeft: false };
    }
    if (type === "culvert") {
      item.culvertDetails = { issue: "plugged", standingWater: false, inletBlocked: true, outletBlocked: false, needsJetting: false };
    }
    if (type === "guardrail") {
      item.guardrailDetails = { component: "end_treatment", endTreatmentType: "unknown", damageLevel: "moderate", needsReplacement: true };
    }
    if (type === "danger_tree") {
      item.dangerTreeDetails = { issue: "in_road", blockingLane: true, needsTrafficControl: true, removed: false };
    }
    if (type === "ditching") {
      item.ditchingDetails = { issue: "silted", equipmentNeeded: "grader" };
    }
    if (type === "asphalt") {
      item.asphaltDetails = { workType: "patch", mix: "unknown", depthIn: null, areaFt2: null };
    }

    createPointWorkOrder({
      id: item.id,
      type: item.type,
      status: item.status,
      priority: item.priority,
      note: item.notes ?? null,
      point: { lat, lng },
      createdAt: now,
    });
    dispatch(addLog({
      id: uid(),
      at: Date.now(),
      workItemId: item.id,
      action: "created",
      message: `Created ${formatWorkType(type)} @ ${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    }));

    setSelectedId(item.id);  // Changed from setSelected(item)
  }

  async function createLine(points: { lat: number; lng: number }[], type: WorkType) {
    if (points.length < 2) {
      Alert.alert("Need at least 2 points", "Tap more points to draw a line");
      return;
    }

    const now = Date.now();
    const item: WorkItem = {
      id: uid(),
      type,
      status: "needs",
      priority: "high",
      title: `${formatWorkType(type)} (Line)`,
      notes: "",
      geometry: { kind: "line", coordinates: points },
      createdAt: now,
      updatedAt: now,
      lastActionAt: now,
      assignedTo: null,
      photos: [],
      needsSync: true,
    };

    // Initialize type-specific details
    if (type === "pothole") item.potholeDetails = { severity: "medium", hazard: false, needsPatch: true };
    if (type === "sign") item.signDetails = { signType: "stop", mutcdCode: null, condition: "good", reflectivityIssue: false, obstructed: false, replacementNeeded: false, postLeaning: false, heightOk: true };
    if (type === "spraying") item.sprayingDetails = { target: "weeds", areaType: "shoulder", nearWater: false, posted: false };
    if (type === "brushing") item.brushingDetails = { scope: "spot", areaType: "shoulder", sightDistanceIssue: false, debrisLeft: false };
    if (type === "culvert") item.culvertDetails = { issue: "plugged", standingWater: false, inletBlocked: true, outletBlocked: false, needsJetting: false };
    if (type === "guardrail") item.guardrailDetails = { component: "end_treatment", endTreatmentType: "unknown", damageLevel: "moderate", needsReplacement: true };
    if (type === "danger_tree") item.dangerTreeDetails = { species: "unknown", dbhInches: null, hazardRating: "moderate", deadTop: false, leaningOver: false, rootIssues: false };
    if (type === "ditching") item.ditchingDetails = { issue: "plugged", standingWater: false, debrisType: "vegetation", needsJetting: false };
    if (type === "asphalt") item.asphaltDetails = { workType: "patch", mix: "unknown", depthIn: null, areaFt2: null };

    createLineWorkOrder({
      id: item.id,
      type: item.type,
      status: item.status,
      priority: item.priority,
      note: item.notes ?? null,
      points: points,
      createdAt: now,
    });
    dispatch(addLog({ id: uid(), at: now, workItemId: item.id, action: "created", message: `Created ${formatWorkType(type)} line work order` }));

    setDraftLine([]);
    setPickingLocation(false);
    setPickType(null);
    setSelectedId(item.id);
  }

  function handleFinishLine() {
    if (!pickType) return;
    createLine(draftLine, pickType);
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

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
        onPress={onMapPress}
        onPanDrag={() => setFollowMe(false)}
        onRegionChangeComplete={(region) => setCurrentRegion(region)}
        mapType={mapType}
      >
        {/* TODO: Convert dbItems (WorkOrderRow) to render as markers/lines */}
        {visible.map(item => {
          if (item.geometry.kind === "point") {
            const c = item.geometry.coordinates;
            return (
              <Marker
                key={item.id}
                coordinate={{ latitude: c.lat, longitude: c.lng }}
                title={item.title ?? item.type}
                description={`${formatStatus(item.status)} • ${item.priority}`}
                onPress={() => {
                  // Don't open sheet if currently drawing a line
                  if (pickingLocation && createGeometryMode === "line") return;
                  setSelectedId(item.id);
                }}
              />
            );
          }

          if (item.geometry.kind === "line") {
            const coords: LatLng[] = item.geometry.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng }));
            return <Polyline key={item.id} coordinates={coords} strokeWidth={5} />;
          }

          const coords: LatLng[] = item.geometry.coordinates.map(p => ({ latitude: p.lat, longitude: p.lng }));
          return <Polygon key={item.id} coordinates={coords} strokeWidth={2} />;
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

      <WorkItemSheet workItemId={selectedId} onClose={() => setSelectedId(null)} />  {/* Changed from item={selected} */}

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
