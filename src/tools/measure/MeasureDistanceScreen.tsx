import React, { useMemo, useState, useEffect, useRef } from "react";
import { View, Text, Pressable, StyleSheet, Alert } from "react-native";
import MapView, { Marker, MapPressEvent, PROVIDER_GOOGLE, Polyline } from "react-native-maps";
import { haversineMeters, metersToFeet, metersToMiles, LatLng } from "./haversine";
import { requestLocationPermission } from "../../native/location";
import Geolocation from "@react-native-community/geolocation";

export function MeasureDistanceScreen() {
  const mapRef = useRef<MapView>(null);
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<"unknown" | "granted" | "denied">("unknown");
  const hasAnimatedToLocation = useRef(false);

  const [a, setA] = useState<LatLng | null>(null);
  const [b, setB] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<"setA" | "setB">("setA");

  // Auto-center to location when first acquired
  useEffect(() => {
    if (myLoc && !hasAnimatedToLocation.current && mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: myLoc.lat,
        longitude: myLoc.lng,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      }, 1000);
      hasAnimatedToLocation.current = true;
    }
  }, [myLoc]);

  useEffect(() => {
    let watchId: number | null = null;

    (async () => {
      const ok = await requestLocationPermission();
      setPermissionStatus(ok ? "granted" : "denied");
      if (!ok) {
        Alert.alert("Location Permission Required", "Please enable location permissions to use GPS features.");
        return;
      }

      // Get initial position immediately
      Geolocation.getCurrentPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log("[MeasureDistance] Got initial GPS fix:", newLoc);
          setMyLoc(newLoc);
        },
        (error) => {
          console.warn("[MeasureDistance] Initial GPS error:", error);
        },
        {
          enableHighAccuracy: true,
          timeout: 15000,
          maximumAge: 0,
        }
      );

      // Then watch for updates
      watchId = Geolocation.watchPosition(
        (pos) => {
          const newLoc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          console.log("[MeasureDistance] GPS update:", newLoc);
          setMyLoc(newLoc);
        },
        (error) => {
          console.warn("[MeasureDistance] GPS watch error:", error);
        },
        {
          enableHighAccuracy: true,
          distanceFilter: 10,
          interval: 2000,
        } as any
      );
    })();

    return () => {
      if (watchId != null) Geolocation.clearWatch(watchId);
    };
  }, []);

  const dist = useMemo(() => {
    if (!a || !b) return null;
    const m = haversineMeters(a, b);
    return {
      meters: m,
      feet: metersToFeet(m),
      miles: metersToMiles(m),
    };
  }, [a, b]);

  function onMapPress(e: MapPressEvent) {
    const p = e.nativeEvent.coordinate;
    const point = { lat: p.latitude, lng: p.longitude };
    if (mode === "setA") {
      setA(point);
      setMode("setB");
    } else {
      setB(point);
    }
  }

  function setFromCurrent(which: "A" | "B") {
    if (!myLoc) {
      Alert.alert("GPS unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }
    const point = { lat: myLoc.lat, lng: myLoc.lng };
    if (which === "A") {
      setA(point);
      setMode("setB");
    } else {
      setB(point);
    }
  }

  function centerOnGPS() {
    if (!myLoc) {
      Alert.alert("GPS unavailable", "No GPS fix yet. Wait a moment and try again.");
      return;
    }
    if (mapRef.current) {
      mapRef.current.animateToRegion({
        latitude: myLoc.lat,
        longitude: myLoc.lng,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      }, 500);
    }
  }

  function clearPoints() {
    setA(null);
    setB(null);
    setMode("setA");
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Measure Distance</Text>
        <Text style={styles.subtitle}>
          Tap map to set points, or use your current GPS location.
        </Text>

        {permissionStatus === "denied" && (
          <Text style={styles.warningText}>
            ⚠ Location permission denied — you can still tap the map to measure.
          </Text>
        )}

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => setMode("setA")}
            style={[styles.modeButton, mode === "setA" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, mode === "setA" && styles.modeButtonTextActive]}>
              Set Point A (tap map)
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setMode("setB")}
            style={[styles.modeButton, mode === "setB" && styles.modeButtonActive]}
          >
            <Text style={[styles.modeButtonText, mode === "setB" && styles.modeButtonTextActive]}>
              Set Point B (tap map)
            </Text>
          </Pressable>
        </View>

        <View style={styles.buttonRow}>
          <Pressable
            onPress={() => setFromCurrent("A")}
            style={[styles.gpsButton, !myLoc && styles.gpsButtonDisabled]}
            disabled={!myLoc}
          >
            <Text style={[styles.gpsButtonText, !myLoc && styles.disabledText]}>
              Use GPS for A
            </Text>
          </Pressable>

          <Pressable
            onPress={() => setFromCurrent("B")}
            style={[styles.gpsButton, !myLoc && styles.gpsButtonDisabled]}
            disabled={!myLoc}
          >
            <Text style={[styles.gpsButtonText, !myLoc && styles.disabledText]}>
              Use GPS for B
            </Text>
          </Pressable>
        </View>

        <View style={styles.buttonRow}>
          <Pressable 
            onPress={centerOnGPS}
            style={[styles.iconButton, !myLoc && styles.gpsButtonDisabled]}
            disabled={!myLoc}
          >
            <Text style={[styles.iconButtonText, !myLoc && styles.disabledText]}>
              📍
            </Text>
          </Pressable>

          <Pressable onPress={clearPoints} style={styles.clearButton}>
            <Text style={styles.clearButtonText}>Clear Points</Text>
          </Pressable>
        </View>

        {dist && (
          <View style={styles.resultsCard}>
            <Text style={styles.resultsTitle}>Distance</Text>
            <Text style={styles.resultsPrimary}>{dist.feet.toFixed(1)} ft</Text>
            <Text style={styles.resultsSecondary}>
              {dist.meters.toFixed(1)} m • {dist.miles.toFixed(3)} mi
            </Text>
          </View>
        )}
      </View>

      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        mapType="hybrid"
        onPress={onMapPress}
        showsUserLocation
        showsMyLocationButton={false}
        initialRegion={{
          latitude: 46.602,
          longitude: -120.505,
          latitudeDelta: 0.05,
          longitudeDelta: 0.05,
        }}
      >
        {a && <Marker coordinate={{ latitude: a.lat, longitude: a.lng }} title="Point A" pinColor="green" />}
        {b && <Marker coordinate={{ latitude: b.lat, longitude: b.lng }} title="Point B" pinColor="red" />}
        {a && b && (
          <Polyline
            coordinates={[
              { latitude: a.lat, longitude: a.lng },
              { latitude: b.lat, longitude: b.lng },
            ]}
            strokeColor="#111827"
            strokeWidth={3}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { padding: 12, gap: 10 },
  title: { fontSize: 20, fontWeight: "800" },
  subtitle: { fontSize: 13, opacity: 0.85 },
  warningText: { marginTop: 8, fontWeight: "700", color: "#dc2626" },

  buttonRow: { flexDirection: "row", gap: 8 },
  modeButton: { padding: 10, borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 10, flex: 1 },
  modeButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  modeButtonText: { fontWeight: "600", fontSize: 13, textAlign: "center" },
  modeButtonTextActive: { color: "white", fontWeight: "800" },

  gpsButton: { padding: 10, borderWidth: 1, borderColor: "#10b981", borderRadius: 10, flex: 1, backgroundColor: "#dcfce7" },
  gpsButtonDisabled: { borderColor: "#cbd5e1", backgroundColor: "#f8fafc" },
  gpsButtonText: { fontWeight: "700", fontSize: 13, textAlign: "center", color: "#065f46" },
  disabledText: { opacity: 0.4, color: "#6b7280" },

  iconButton: { padding: 10, borderWidth: 1, borderColor: "#3b82f6", borderRadius: 10, width: 48, alignItems: "center", justifyContent: "center", backgroundColor: "#dbeafe" },
  iconButtonText: { fontSize: 24 },
  clearButton: { padding: 10, borderWidth: 1, borderColor: "#e2e8f0", borderRadius: 10, flex: 1, backgroundColor: "#fee2e2" },
  clearButtonText: { fontWeight: "700", textAlign: "center", color: "#991b1b" },

  resultsCard: { padding: 12, borderWidth: 1, borderColor: "#86efac", borderRadius: 12, backgroundColor: "#dcfce7" },
  resultsTitle: { fontWeight: "800", fontSize: 16 },
  resultsPrimary: { marginTop: 6, fontWeight: "800", fontSize: 24, color: "#14532d" },
  resultsSecondary: { marginTop: 2, fontSize: 13, opacity: 0.85 },

  map: { flex: 1 },
});
