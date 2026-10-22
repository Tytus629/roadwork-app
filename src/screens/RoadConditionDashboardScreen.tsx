/**
 * RoadConditionDashboardScreen — heat map of Drive Mode roughness segments plus
 * bump/pothole markers, filtered by date range and session. Local data only.
 */
import React, { useCallback, useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Image } from "react-native";
import { listDrivePhotos, type DrivePhotoRow } from "../repositories/drivePhotosRepo";
import MapView, { PROVIDER_GOOGLE } from "react-native-maps";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { useOrg } from "../state/OrgContext";
import {
  listDriveEvents,
  listDriveSegments,
  listDriveSessions,
  type DriveEventRow,
  type DriveSegmentRow,
  type DriveSessionRow,
} from "../repositories/roughnessRepo";
import { RoughnessOverlay } from "../roughness/RoughnessOverlay";
import { RoughnessLegend } from "../roughness/RoughnessLegend";
import { openEventAsWorkOrder } from "./DriveModeScreen";

const DAY = 86400000;
const RANGES: Array<{ key: string; label: string; days: number | null }> = [
  { key: "1", label: "24 h", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "365", label: "1 year", days: 365 },
  { key: "all", label: "All", days: null },
];

export function regionFor(points: Array<{ lat: number; lng: number }>) {
  if (!points.length) return undefined;
  const lats = points.map((p) => p.lat);
  const lngs = points.map((p) => p.lng);
  const minLat = Math.min(...lats), maxLat = Math.max(...lats), minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.005, (maxLat - minLat) * 1.3),
    longitudeDelta: Math.max(0.005, (maxLng - minLng) * 1.3),
  };
}

export default function RoadConditionDashboardScreen() {
  const navigation = useNavigation() as any;
  const { orgId } = useOrg();
  const [rangeKey, setRangeKey] = useState("30");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessions, setSessions] = useState<DriveSessionRow[]>([]);
  const [segments, setSegments] = useState<DriveSegmentRow[]>([]);
  const [events, setEvents] = useState<DriveEventRow[]>([]);
  const [selected, setSelected] = useState<DriveEventRow | null>(null);
  const [selectedPhoto, setSelectedPhoto] = useState<DrivePhotoRow | null>(null);
  const selectEvent = useCallback((e: DriveEventRow) => {
    setSelected(e);
    try {
      setSelectedPhoto(listDrivePhotos({ eventId: e.id, limit: 1 })[0] ?? null);
    } catch {
      setSelectedPhoto(null);
    }
  }, []);

  const load = useCallback(() => {
    try {
      const days = RANGES.find((r) => r.key === rangeKey)?.days ?? null;
      const f = { orgId: orgId ?? null, sessionId, fromMs: days ? Date.now() - days * DAY : null };
      setSessions(listDriveSessions(orgId ?? null, 30));
      setSegments(listDriveSegments(f));
      setEvents(listDriveEvents(f));
    } catch (e) {
      console.warn("[RoadCondition] load failed", e);
    }
  }, [orgId, rangeKey, sessionId]);
  useFocusEffect(load);

  const region = useMemo(
    () => regionFor([...segments.flatMap((s) => s.path), ...events.map((e) => ({ lat: e.lat, lng: e.lng }))]),
    [segments, events]
  );
  const miles = segments.reduce((a, s) => a + s.lengthM, 0) / 1609.344;
  const roughPct = segments.length
    ? Math.round((100 * segments.filter((s) => s.roughnessClass === "rough" || s.roughnessClass === "very_rough").length) / segments.length)
    : 0;

  return (
    <View style={{ flex: 1 }}>
      <ScrollView horizontal style={styles.filterBar} contentContainerStyle={styles.filterRow}>
        {RANGES.map((r) => (
          <Chip key={r.key} label={r.label} active={rangeKey === r.key} onPress={() => setRangeKey(r.key)} />
        ))}
      </ScrollView>
      <ScrollView horizontal style={styles.filterBar} contentContainerStyle={styles.filterRow}>
        <Chip label="All drives" active={!sessionId} onPress={() => setSessionId(null)} />
        {sessions.map((s) => (
          <Chip
            key={s.id}
            label={`${new Date(s.startedAt).toLocaleDateString()} ${new Date(s.startedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}`}
            active={sessionId === s.id}
            onPress={() => setSessionId(s.id)}
          />
        ))}
      </ScrollView>
      <Text style={styles.summary}>
        {miles.toFixed(1)} mi scored • {roughPct}% rough or worse • {events.length} bumps
      </Text>
      <View style={{ flex: 1 }}>
        <MapView key={`${rangeKey}-${sessionId ?? "all"}`} style={{ flex: 1 }} provider={PROVIDER_GOOGLE} initialRegion={region} mapType="hybrid">
          <RoughnessOverlay segments={segments} events={events} onEventPress={(e) => openEventAsWorkOrder(navigation, e)} onEventSelect={selectEvent} />
        </MapView>
        {!segments.length && !events.length && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No Drive Mode data for this filter yet. Record a drive from Tools → Drive Mode.</Text>
          </View>
        )}
        {selected && (
          <View style={styles.popup}>
            {selectedPhoto ? (
              <Image source={{ uri: selectedPhoto.localUri }} style={styles.popupImg} />
            ) : (
              <View style={[styles.popupImg, styles.noImg]}><Text style={styles.noImgText}>No photo</Text></View>
            )}
            <View style={styles.popupBody}>
              <Text style={styles.popupTitle}>
                {selected.severity === "bump" ? "Bump" : selected.severity === "pothole" ? "Possible pothole" : "Severe hit"} · {(selected.peakMps2 / 9.81).toFixed(2)} g
              </Text>
              <Text style={styles.popupMeta}>{new Date(selected.occurredAt).toLocaleString()}</Text>
              <View style={styles.popupRow}>
                <Pressable onPress={() => openEventAsWorkOrder(navigation, selected)} style={styles.popupBtn}><Text style={styles.popupBtnText}>Work order</Text></Pressable>
                <Pressable onPress={() => setSelected(null)}><Text style={styles.popupClose}>Close</Text></Pressable>
              </View>
            </View>
          </View>
        )}
        <View style={styles.legend}>
          <RoughnessLegend />
          <Text style={styles.tip}>Tap a pin, then its label, to start a work order.</Text>
        </View>
      </View>
    </View>
  );
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  filterBar: { flexGrow: 0 },
  filterRow: { gap: 8, paddingHorizontal: 10, paddingVertical: 6 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" },
  chipActive: { backgroundColor: "#1e293b", borderColor: "#1e293b" },
  chipText: { fontSize: 12, fontWeight: "700" },
  chipTextActive: { color: "white" },
  summary: { paddingHorizontal: 12, paddingBottom: 6, fontSize: 12, fontWeight: "700" },
  legend: { position: "absolute", left: 10, right: 10, bottom: 16 },
  tip: { fontSize: 11, color: "white", textAlign: "center", marginTop: 4 },
  empty: { position: "absolute", top: 20, left: 20, right: 20, backgroundColor: "rgba(255,255,255,0.95)", padding: 12, borderRadius: 12 },
  emptyText: { textAlign: "center" },
  popup: { position: "absolute", top: 10, left: 10, right: 10, flexDirection: "row", gap: 10, backgroundColor: "white", borderRadius: 12, padding: 8, elevation: 6 },
  popupImg: { width: 120, height: 68, borderRadius: 8, backgroundColor: "#e2e8f0" },
  noImg: { alignItems: "center", justifyContent: "center" },
  noImgText: { fontSize: 11, opacity: 0.6 },
  popupBody: { flex: 1, gap: 2 },
  popupTitle: { fontWeight: "800" },
  popupMeta: { fontSize: 12, opacity: 0.7 },
  popupRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 4 },
  popupBtn: { backgroundColor: "#1e293b", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  popupBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  popupClose: { fontWeight: "700", color: "#2563eb" },
});
