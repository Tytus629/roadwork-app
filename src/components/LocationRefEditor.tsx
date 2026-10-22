/** Small button + modal to view/edit route ID, road name and begin/end milepost. */
import React, { useEffect, useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  getLocationRef, parseMilepost, saveLocationRef, saveDriveSessionRoute,
  type LocationEntityType, type LocationRef,
} from "../integration/locationRefs";
import { useOrg } from "../state/OrgContext";

type Props =
  | { entityType: LocationEntityType; entityId: string; driveSessionId?: undefined; showEndMp?: boolean }
  | { driveSessionId: string; entityType?: undefined; entityId?: undefined; showEndMp?: undefined };

export function formatRef(r: LocationRef | null): string {
  if (!r || (!r.routeId && !r.roadName && r.beginMp == null)) return "Add route / milepost";
  const mp = r.beginMp != null ? ` MP ${r.beginMp}${r.endMp != null ? `–${r.endMp}` : ""}` : "";
  return `${[r.routeId, r.roadName].filter(Boolean).join(" · ")}${mp}`.trim();
}

export function LocationRefEditor(props: Props) {
  const isSession = !!props.driveSessionId;
  const { orgId } = useOrg();
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState<LocationRef | null>(null);
  const [routeId, setRouteId] = useState("");
  const [roadName, setRoadName] = useState("");
  const [beginMp, setBeginMp] = useState("");
  const [endMp, setEndMp] = useState("");

  useEffect(() => {
    if (isSession || !props.entityType || !props.entityId) return;
    try {
      setRef(getLocationRef(props.entityType, props.entityId));
    } catch {
      setRef(null);
    }
  }, [isSession, props.entityType, props.entityId, open]);

  const openEditor = () => {
    setRouteId(ref?.routeId ?? "");
    setRoadName(ref?.roadName ?? "");
    setBeginMp(ref?.beginMp != null ? String(ref.beginMp) : "");
    setEndMp(ref?.endMp != null ? String(ref.endMp) : "");
    setOpen(true);
  };

  const save = () => {
    if (isSession) saveDriveSessionRoute(props.driveSessionId!, routeId.trim() || null, roadName.trim() || null, orgId ?? null);
    else saveLocationRef(props.entityType!, props.entityId!, { routeId: routeId.trim() || null, roadName: roadName.trim() || null, beginMp: parseMilepost(beginMp), endMp: parseMilepost(endMp) }, orgId ?? null);
    setOpen(false);
  };

  return (
    <>
      <Pressable onPress={openEditor} style={styles.chip} accessibilityRole="button">
        <Text style={styles.chipText}>📍 {isSession ? "Set route for this drive" : formatRef(ref)}</Text>
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.card}>
            <Text style={styles.title}>{isSession ? "Route for whole drive" : "Location reference"}</Text>
            <Text style={styles.hint}>Optional. Use your county road log IDs so exports line up with GIS-Mo / VUEWorks / Esri.</Text>
            <TextInput style={styles.input} placeholder="Route ID (county road number)" value={routeId} onChangeText={setRouteId} autoCapitalize="characters" />
            <TextInput style={styles.input} placeholder="Road name" value={roadName} onChangeText={setRoadName} />
            {!isSession && (
              <View style={styles.row}>
                <TextInput style={[styles.input, styles.flex]} placeholder="Begin MP" value={beginMp} onChangeText={setBeginMp} keyboardType="decimal-pad" />
                {props.showEndMp !== false && (
                  <TextInput style={[styles.input, styles.flex]} placeholder="End MP" value={endMp} onChangeText={setEndMp} keyboardType="decimal-pad" />
                )}
              </View>
            )}
            <View style={styles.row}>
              <Pressable onPress={() => setOpen(false)} style={[styles.btn, styles.cancel]}><Text>Cancel</Text></Pressable>
              <Pressable onPress={save} style={[styles.btn, styles.saveBtn]}><Text style={styles.saveText}>Save</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  chip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1, borderColor: "#cbd5e1", backgroundColor: "#f8fafc", marginTop: 6 },
  chipText: { fontSize: 12, fontWeight: "700", color: "#334155" },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.4)", justifyContent: "center", padding: 20 },
  card: { backgroundColor: "white", borderRadius: 14, padding: 16, gap: 10 },
  title: { fontSize: 18, fontWeight: "800" },
  hint: { fontSize: 12, opacity: 0.7 },
  input: { borderWidth: 1, borderColor: "#cbd5e1", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  row: { flexDirection: "row", gap: 8 },
  flex: { flex: 1 },
  btn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" },
  cancel: { backgroundColor: "#e2e8f0" },
  saveBtn: { backgroundColor: "#1d4ed8" },
  saveText: { color: "white", fontWeight: "800" },
});
