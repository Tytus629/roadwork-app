/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGNS MAP SCREEN - "Signs Near Me"
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Shows sign assets on a map with radius filtering centered on user location.
 * 
 * Features:
 * - Map view with sign asset markers
 * - Adjustable radius filter (miles)
 * - Circle overlay showing search radius
 * - Recenter to user location
 * - Refresh to reload sign assets
 * - Tap marker to view details (future: open detail sheet)
 */

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import MapView, { Marker, Circle, PROVIDER_GOOGLE } from "react-native-maps";
import Geolocation from "@react-native-community/geolocation";
import { requestLocationPermission } from "../native/location";
import { getAllSigns } from "../storage/signRepo";
import type { SignAsset } from "../types/Sign";
import { haversineMeters, milesToMeters } from "../utils/geo";

export default function SignsMapScreen() {
  const mapRef = useRef<MapView>(null);
  
  // User location state
  const [myLoc, setMyLoc] = useState<{ lat: number; lng: number; accuracyM?: number } | null>(null);
  
  // Sign assets state
  const [assets, setAssets] = useState<SignAsset[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filter state
  const [radiusMi, setRadiusMi] = useState(2);
  
  // Initial region (default to Yakima, WA area)
  const initialRegion = {
    latitude: myLoc?.lat ?? 46.602,
    longitude: myLoc?.lng ?? -120.505,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  };

  // Watch user location
  useEffect(() => {
    let watchId: number | null = null;

    (async () => {
      const ok = await requestLocationPermission();
      if (!ok) {
        setLoading(false);
        return;
      }

      watchId = Geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, accuracy } = pos.coords;
          setMyLoc({ lat: latitude, lng: longitude, accuracyM: accuracy });
        },
        (error) => console.warn("[SignsMap] Location error:", error),
        { enableHighAccuracy: false, distanceFilter: 10, interval: 5000 }
      );
    })();

    return () => {
      if (watchId !== null) {
        Geolocation.clearWatch(watchId);
      }
    };
  }, []);

  // Load sign assets
  useEffect(() => {
    loadAssets();
  }, []);

  const loadAssets = async () => {
    setLoading(true);
    try {
      const signs = await getAllSigns();
      setAssets(signs);
    } catch (error) {
      console.warn("[SignsMap] Failed to load assets:", error);
    } finally {
      setLoading(false);
    }
  };

  // Filter assets by radius
  const filteredAssets = useMemo(() => {
    if (!myLoc) return [];
    const radiusM = milesToMeters(radiusMi);
    return assets.filter((asset) => {
      const distance = haversineMeters(myLoc, { lat: asset.lat, lng: asset.lng });
      return distance <= radiusM;
    });
  }, [assets, myLoc, radiusMi]);

  // Recenter map to user location
  const recenter = () => {
    if (!myLoc || !mapRef.current) return;
    mapRef.current.animateToRegion(
      {
        latitude: myLoc.lat,
        longitude: myLoc.lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      },
      350
    );
  };

  // Handle marker press (future: open detail sheet)
  const handleMarkerPress = (assetId: string) => {
    console.log("[SignsMap] Tapped sign:", assetId);
    // TODO: Navigate to SignAsset detail screen/sheet
  };

  // Show loading state while getting GPS
  if (!myLoc && loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Getting GPS location...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Map */}
      <MapView
        ref={mapRef}
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton={false}
      >
        {/* Radius circle */}
        {myLoc && (
          <Circle
            center={{ latitude: myLoc.lat, longitude: myLoc.lng }}
            radius={milesToMeters(radiusMi)}
            strokeWidth={2}
            strokeColor="rgba(59, 130, 246, 0.5)"
            fillColor="rgba(59, 130, 246, 0.1)"
          />
        )}

        {/* Sign markers */}
        {filteredAssets.map((asset) => (
          <Marker
            key={asset.id}
            coordinate={{ latitude: asset.lat, longitude: asset.lng }}
            title={asset.message || asset.mutcdCode || asset.signType}
            description={`${asset.mutcdCode || ""} • Installed: ${asset.installedAt ? new Date(asset.installedAt).toLocaleDateString() : "Unknown"}`}
            onPress={() => handleMarkerPress(asset.id)}
            pinColor="#3b82f6"
          />
        ))}
      </MapView>

      {/* Control Panel Overlay */}
      <View style={styles.controlPanel}>
        <View style={styles.header}>
          <Text style={styles.title}>Signs Near Me</Text>
          <Text style={styles.subtitle}>
            {myLoc ? `GPS ±${Math.round(myLoc.accuracyM ?? 0)}m` : "GPS: waiting..."}
          </Text>
        </View>

        {/* Radius Input */}
        <View style={styles.radiusControl}>
          <Text style={styles.label}>Radius (miles)</Text>
          <TextInput
            style={styles.input}
            value={String(radiusMi)}
            keyboardType="numeric"
            onChangeText={(text) => {
              const num = Number(text);
              if (!Number.isFinite(num)) return;
              setRadiusMi(Math.max(0.1, Math.min(50, num)));
            }}
          />
        </View>

        {/* Action Buttons */}
        <View style={styles.buttonRow}>
          <Pressable onPress={recenter} style={styles.button}>
            <Text style={styles.buttonText}>◎ Recenter</Text>
          </Pressable>
          <Pressable onPress={loadAssets} style={styles.buttonAlt}>
            <Text style={styles.buttonAltText}>⟳ Refresh</Text>
          </Pressable>
        </View>

        {/* Results Count */}
        <Text style={styles.resultsText}>
          {filteredAssets.length} of {assets.length} signs shown
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  loadingText: {
    fontSize: 16,
    color: "#64748b",
    fontWeight: "600",
  },
  controlPanel: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(255, 255, 255, 0.97)",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    elevation: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  header: {
    gap: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: "800",
    color: "#111827",
  },
  subtitle: {
    fontSize: 12,
    color: "#64748b",
    fontWeight: "500",
  },
  radiusControl: {
    gap: 6,
  },
  label: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  input: {
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    padding: 10,
    fontSize: 16,
    backgroundColor: "white",
    fontWeight: "600",
  },
  buttonRow: {
    flexDirection: "row",
    gap: 10,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  buttonText: {
    color: "white",
    fontWeight: "900",
    fontSize: 14,
  },
  buttonAlt: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  buttonAltText: {
    fontWeight: "900",
    fontSize: 14,
    color: "#111827",
  },
  resultsText: {
    fontSize: 13,
    color: "#64748b",
    fontWeight: "600",
    textAlign: "center",
  },
});
