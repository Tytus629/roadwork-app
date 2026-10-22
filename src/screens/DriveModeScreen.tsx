/**
 * DriveModeScreen — Phase 0 road roughness logger (no AI).
 * Logs IMU + GPS while driving, stores ~100 m roughness segments and
 * bump/pothole spike events locally (SQLite, offline). Uncalibrated screening data.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, ScrollView, Alert, Image } from "react-native";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { DriveEngine, type DriveStatus, type LocatedEvent } from "../roughness/driveEngine";
import { startDriveSensors } from "../roughness/sensors";
import { requestLocationPermission } from "../native/location";
import { useOrg } from "../state/OrgContext";
import {
  createDriveSession,
  finishDriveSession,
  insertDriveEvent,
  insertDriveSegment,
  listDriveEvents,
  listDriveSessions,
  type DriveEventRow,
  type DriveSessionRow,
} from "../repositories/roughnessRepo";
import { ROUGHNESS_COLORS, type Segment } from "../roughness/signal";
import { requestMapCreateWorkOrderAtPoint } from "../state/MapCreateWorkOrderFromPointEvents";
import { RoughnessLegend } from "../roughness/RoughnessLegend";
import { LocationRefEditor } from "../components/LocationRefEditor";
import { DriveCamera, type DriveCameraHandle } from "../roughness/DriveCamera";
import { PhotoScheduler, DEFAULT_PHOTO_SETTINGS, type CaptureReason, type PhotoSettings } from "../roughness/photoPolicy";
import { loadPhotoSettings, pruneDrivePhotos, saveCapturedPhoto, savePhotoSettings } from "../roughness/drivePhotoService";
import { listDrivePhotos, markDrivePhotoWorkOrderLinked, type DrivePhotoRow } from "../repositories/drivePhotosRepo";
import type { GpsFix } from "../roughness/signal";
import type { WorkPhoto } from "../types/workItem";

const MPH = 2.23694;

export function drivePhotoToWorkPhoto(p: DrivePhotoRow): WorkPhoto {
  return { id: p.id, uri: p.localUri, width: p.width, height: p.height, fileName: `${p.id}.jpg`, mimeType: "image/jpeg", fileSize: p.sizeBytes, createdAt: p.capturedAt, source: "camera", lat: p.lat, lng: p.lng, accuracyM: p.accuracyM };
}

export function openEventAsWorkOrder(navigation: any, e: Pick<DriveEventRow, "lat" | "lng" | "severity" | "peakMps2" | "occurredAt"> & { id?: string }) {
  let photos: WorkPhoto[] = [];
  try {
    const rows = e.id ? listDrivePhotos({ eventId: e.id, limit: 3 }) : [];
    rows.forEach((r) => markDrivePhotoWorkOrderLinked(r.id));
    photos = rows.map(drivePhotoToWorkPhoto);
  } catch (err) {
    console.warn("[DriveMode] bump photos lookup failed", err);
  }
  requestMapCreateWorkOrderAtPoint({
    photos,
    lat: e.lat,
    lng: e.lng,
    type: "pothole",
    note: `Drive Mode ${e.severity} (${(e.peakMps2 / 9.81).toFixed(2)} g) at ${new Date(e.occurredAt).toLocaleString()}. Uncalibrated sensor flag — verify in field.`,
  });
  try {
    navigation.navigate("MainTabs", { screen: "Map" });
  } catch {
    navigation.navigate("Map");
  }
}

export default function DriveModeScreen() {
  const navigation = useNavigation() as any;
  const { orgId } = useOrg();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [lastSeg, setLastSeg] = useState<Segment | null>(null);
  const [counts, setCounts] = useState({ segments: 0, events: 0, distanceM: 0 });
  const [liveEvents, setLiveEvents] = useState<DriveEventRow[]>([]);
  const [sessions, setSessions] = useState<DriveSessionRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef<(() => void) | null>(null);
  const engineRef = useRef<DriveEngine | null>(null);
  const [photoSettings, setPhotoSettings] = useState<PhotoSettings>(DEFAULT_PHOTO_SETTINGS);
  const [photoCount, setPhotoCount] = useState(0);
  const cameraRef = useRef<DriveCameraHandle>(null);
  const schedRef = useRef<PhotoScheduler | null>(null);
  const lastFixRef = useRef<GpsFix | null>(null);
  useEffect(() => {
    loadPhotoSettings().then(setPhotoSettings);
  }, []);
  const updatePhotoSettings = (patch: Partial<PhotoSettings>) => {
    setPhotoSettings((s) => {
      const next = { ...s, ...patch };
      schedRef.current?.update(next);
      savePhotoSettings(next).catch(() => undefined);
      return next;
    });
  };
  const capture = useCallback(async (sid: string, reason: CaptureReason, eventId: string | null) => {
    const sched = schedRef.current;
    sched?.setBusy(true);
    try {
      const shot = await cameraRef.current?.snap();
      if (!shot) return;
      const f = lastFixRef.current;
      await saveCapturedPhoto(shot.path, shot, {
        orgId: orgId ?? null, sessionId: sid, eventId, reason,
        lat: f?.lat ?? null, lng: f?.lng ?? null, headingDeg: f?.headingDeg ?? null, speedMps: f?.speedMps ?? null, accuracyM: f?.accuracyM ?? null,
      });
      setPhotoCount((c) => c + 1);
    } catch (err) {
      console.warn("[DriveMode] photo save failed", err);
    } finally {
      sched?.setBusy(false);
    }
  }, [orgId]);

  const refreshHistory = useCallback(() => {
    try {
      setSessions(listDriveSessions(orgId ?? null, 10));
    } catch (e) {
      console.warn("[DriveMode] history load failed", e);
    }
  }, [orgId]);
  useFocusEffect(refreshHistory);

  const stop = useCallback(() => {
    stopRef.current?.();
    stopRef.current = null;
    schedRef.current = null;
    pruneDrivePhotos(photoSettings.storageCapMb).catch(() => undefined);
    engineRef.current?.stop();
    engineRef.current = null;
    setSessionId((id) => {
      if (id) {
        try {
          finishDriveSession(id);
        } catch (e) {
          console.warn("[DriveMode] finish failed", e);
        }
      }
      return null;
    });
    setStatus(null);
    setTimeout(refreshHistory, 50);
  }, [refreshHistory, photoSettings.storageCapMb]);

  useEffect(() => () => stopRef.current?.(), []);

  const start = useCallback(async () => {
    setError(null);
    const ok = await requestLocationPermission();
    if (!ok) {
      Alert.alert("Location needed", "Drive Mode needs precise location to map roughness.");
      return;
    }
    const id = createDriveSession(orgId ?? null);
    setSessionId(id);
    setCounts({ segments: 0, events: 0, distanceM: 0 });
    setLiveEvents([]);
    setLastSeg(null);
    setPhotoCount(0);
    const sched = photoSettings.mode !== "off" || photoSettings.photoOnBump ? new PhotoScheduler(photoSettings) : null;
    schedRef.current = sched;
    const engine = new DriveEngine({
      onSegment: (s) => {
        insertDriveSegment(id, s);
        setLastSeg(s);
        setCounts((c) => ({ ...c, segments: c.segments + 1, distanceM: c.distanceM + s.lengthM }));
      },
      onEvent: (e: LocatedEvent) => {
        const eid = insertDriveEvent(id, e);
        if (sched?.onBump(e.t)) capture(id, "bump", eid);
        setCounts((c) => ({ ...c, events: c.events + 1 }));
        setLiveEvents((l) =>
          [{ id: eid, sessionId: id, occurredAt: e.t, lat: e.lat, lng: e.lng, speedMps: e.speedMps, peakMps2: e.peakMps2, severity: e.severity, workOrderId: null }, ...l].slice(0, 20)
        );
      },
    });
    engineRef.current = engine;
    const unsub = startDriveSensors({
      onAccel: (t, a) => engine.pushAccel(t, a),
      onGyro: (g) => engine.pushGyro(g),
      onFix: (f) => {
        lastFixRef.current = f;
        engine.pushFix(f);
        const reason = sched?.onFix(f.t, f);
        if (reason) capture(id, reason, null);
      },
      onError: setError,
    });
    const timer = setInterval(() => setStatus(engine.status()), 1000);
    stopRef.current = () => {
      unsub();
      clearInterval(timer);
    };
  }, [orgId, photoSettings, capture]);

  const cameraOn = photoSettings.mode !== "off" || photoSettings.photoOnBump;
  const recording = !!sessionId;
  const warnings: string[] = [];
  if (status) {
    if (status.speed === "no_gps") warnings.push("Waiting for GPS speed…");
    if (status.speed === "too_slow") warnings.push("Too slow — hold a steady 20–45 mph (≈30 mph best). Not scoring below 10 mph.");
    if (status.speed === "too_fast") warnings.push("Too fast — readings above 45 mph are less reliable.");
    if (!status.mounted) warnings.push("Phone does not look mounted — data paused. Use a rigid windshield/dash mount.");
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Drive Mode</Text>
      <Text style={styles.subtitle}>
        Road roughness logger (beta). Mount the phone rigidly, plug into car power, and drive at a steady speed. Passenger operates.
      </Text>

      <Pressable onPress={recording ? stop : start} style={[styles.bigBtn, recording ? styles.stopBtn : styles.startBtn]}>
        <Text style={styles.bigBtnText}>{recording ? "Stop drive" : "Start drive"}</Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.section}>Photos (optional)</Text>
        <View style={styles.chipRow}>
          {([["off", "Off"], ["time", `Every ${photoSettings.everySeconds}s`], ["distance", `Every ${photoSettings.everyMeters} m`]] as const).map(([k, label]) => (
            <Pressable key={k} disabled={recording} onPress={() => updatePhotoSettings({ mode: k })} style={[styles.chip, photoSettings.mode === k && styles.chipOn]}>
              <Text style={[styles.chipText, photoSettings.mode === k && styles.chipTextOn]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        {photoSettings.mode === "time" && (
          <View style={styles.chipRow}>
            {[5, 10, 30].map((n) => (
              <Pressable key={n} disabled={recording} onPress={() => updatePhotoSettings({ everySeconds: n })} style={[styles.chip, photoSettings.everySeconds === n && styles.chipOn]}>
                <Text style={[styles.chipText, photoSettings.everySeconds === n && styles.chipTextOn]}>{n}s</Text>
              </Pressable>
            ))}
          </View>
        )}
        {photoSettings.mode === "distance" && (
          <View style={styles.chipRow}>
            {[25, 50, 100].map((n) => (
              <Pressable key={n} disabled={recording} onPress={() => updatePhotoSettings({ everyMeters: n })} style={[styles.chip, photoSettings.everyMeters === n && styles.chipOn]}>
                <Text style={[styles.chipText, photoSettings.everyMeters === n && styles.chipTextOn]}>{n} m</Text>
              </Pressable>
            ))}
          </View>
        )}
        <Pressable disabled={recording} onPress={() => updatePhotoSettings({ photoOnBump: !photoSettings.photoOnBump })} style={[styles.chip, photoSettings.photoOnBump && styles.chipOn]}>
          <Text style={[styles.chipText, photoSettings.photoOnBump && styles.chipTextOn]}>Photo at each bump: {photoSettings.photoOnBump ? "On" : "Off"}</Text>
        </Pressable>
        <Text style={styles.hint}>Low resolution (~720p), max one every {photoSettings.minGapMs / 1000}s. Local storage cap {photoSettings.storageCapMb} MB, oldest uploaded photos removed first. Photos may show people and plates — don't share outside the crew.</Text>
        {recording && <Text>Photos this drive: {photoCount}</Text>}
        <DriveCamera ref={cameraRef} active={recording && cameraOn} />
      </View>
      {warnings.map((w) => (
        <Text key={w} style={styles.warn}>⚠️ {w}</Text>
      ))}

      {recording && (
        <View style={styles.card}>
          <Text>Speed: {status?.speedMps != null ? `${(status.speedMps * MPH).toFixed(0)} mph` : "—"}</Text>
          <Text>Sensor rate: {status?.sampleRateHz ?? 0} Hz</Text>
          <Text>Distance: {(counts.distanceM / 1609.344).toFixed(2)} mi • Segments: {counts.segments} • Bumps: {counts.events}</Text>
          {lastSeg && (
            <Text style={{ color: ROUGHNESS_COLORS[lastSeg.roughnessClass], fontWeight: "800" }}>
              Last 100 m: {lastSeg.roughnessIndex.toFixed(2)} ({lastSeg.roughnessClass.replace("_", " ")})
            </Text>
          )}
        </View>
      )}

      {liveEvents.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.section}>Bumps this drive</Text>
          {liveEvents.map((e) => (
            <View key={e.id} style={styles.eventRow}>
              <Text style={{ flex: 1 }}>{e.severity} • {(e.peakMps2 / 9.81).toFixed(2)} g • {new Date(e.occurredAt).toLocaleTimeString()}</Text>
            </View>
          ))}
          <Text style={styles.hint}>Stop the drive, then tap a pin on the Road Condition map to make a work order.</Text>
        </View>
      )}

      <Pressable onPress={() => navigation.navigate("RoadConditionDashboard")} style={styles.linkBtn}>
        <Text style={styles.linkText}>Open Road Condition map →</Text>
      </Pressable>

      {!recording && sessions.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.section}>Recent drives</Text>
          {sessions.map((s) => (
            <Text key={s.id}>
              {new Date(s.startedAt).toLocaleString()} • {(s.distanceM / 1609.344).toFixed(2)} mi • {s.eventCount} bumps
              {s.endedAt ? "" : " (not finished)"}
            </Text>
          ))}
          <LocationRefEditor driveSessionId={sessions[0].id} />
          <SessionPhotos sessionId={sessions[0].id} />
          <RecentEventActions navigation={navigation} sessionId={sessions[0].id} />
        </View>
      )}

      <RoughnessLegend />
    </ScrollView>
  );
}

function SessionPhotos({ sessionId }: { sessionId: string }) {
  const [photos, setPhotos] = useState<DrivePhotoRow[]>([]);
  useEffect(() => {
    try {
      setPhotos(listDrivePhotos({ sessionId, limit: 30 }));
    } catch {
      setPhotos([]);
    }
  }, [sessionId]);
  if (!photos.length) return null;
  return (
    <ScrollView horizontal contentContainerStyle={styles.thumbRow}>
      {photos.map((p) => (
        <View key={p.id}>
          <Image source={{ uri: p.localUri }} style={styles.thumb} />
          <Text style={styles.thumbLabel}>{p.reason === "bump" ? "Bump" : new Date(p.capturedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

function RecentEventActions({ navigation, sessionId }: { navigation: any; sessionId: string }) {
  const [events, setEvents] = useState<DriveEventRow[]>([]);
  useEffect(() => {
    try {
      setEvents(listDriveEvents({ sessionId }, 10));
    } catch {
      setEvents([]);
    }
  }, [sessionId]);
  if (!events.length) return null;
  return (
    <View style={{ marginTop: 8, gap: 6 }}>
      <Text style={styles.section}>Last drive bumps</Text>
      {events.map((e) => (
        <View key={e.id} style={styles.eventRow}>
          <Text style={{ flex: 1 }}>{e.severity} • {(e.peakMps2 / 9.81).toFixed(2)} g</Text>
          <Pressable onPress={() => openEventAsWorkOrder(navigation, e)} style={styles.smallBtn}>
            <Text style={styles.smallBtnText}>Work order</Text>
          </Pressable>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 14, gap: 12 },
  title: { fontSize: 24, fontWeight: "900" },
  subtitle: { fontSize: 13, opacity: 0.75 },
  bigBtn: { paddingVertical: 18, borderRadius: 16, alignItems: "center" },
  startBtn: { backgroundColor: "#16a34a" },
  stopBtn: { backgroundColor: "#dc2626" },
  bigBtnText: { color: "white", fontSize: 18, fontWeight: "900" },
  warn: { color: "#b45309", fontWeight: "700" },
  error: { color: "#dc2626" },
  card: { padding: 12, borderRadius: 12, borderWidth: 1, borderColor: "#e2e8f0", backgroundColor: "#f8fafc", gap: 4 },
  section: { fontWeight: "800" },
  eventRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  smallBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: "#1e293b", borderRadius: 8 },
  smallBtnText: { color: "white", fontWeight: "700", fontSize: 12 },
  hint: { fontSize: 12, opacity: 0.7 },
  linkBtn: { paddingVertical: 12, alignItems: "center" },
  linkText: { fontWeight: "800", color: "#2563eb" },
  chipRow: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1" },
  chipOn: { backgroundColor: "#1e293b", borderColor: "#1e293b" },
  chipText: { fontSize: 12, fontWeight: "700" },
  chipTextOn: { color: "white" },
  thumbRow: { gap: 8, paddingVertical: 6 },
  thumb: { width: 96, height: 54, borderRadius: 6, backgroundColor: "#e2e8f0" },
  thumbLabel: { fontSize: 10, opacity: 0.7, textAlign: "center" },
});
