// src/screens/DmiScreen.tsx
//
// DMI (Distance Measuring Instrument) — field-safe MVP.
// Crews enter vehicle odometer / DMI readings at start and end.
// Saves to SQLite offline-first.

import React, { useMemo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  Alert,
} from "react-native";
import { useOrg } from "../state/OrgContext";
import { makeClientId } from "../repositories/repoUtils";
import { dmiService } from "../services/dmiService";
import { getApp } from "@react-native-firebase/app";
import { getAuth } from "@react-native-firebase/auth";
import { hasRolePermission, permissionDeniedMessage } from "../permissions/rolePermissions";

type DmiUnit = "mi" | "ft";

const FEET_PER_MILE = 5280;
const METERS_PER_MILE = 1609.344;

function sanitizeReadingInput(raw: string, unit: DmiUnit): string {
  const maxDecimals = unit === "mi" ? 2 : 1;
  let next = String(raw ?? "").replace(/[^\d.]/g, "");

  const firstDot = next.indexOf(".");
  if (firstDot >= 0) {
    next = next.slice(0, firstDot + 1) + next.slice(firstDot + 1).replace(/\./g, "");
  }

  if (next.startsWith(".")) {
    next = `0${next}`;
  }

  const parts = next.split(".");
  if (parts.length === 1) return parts[0];

  const whole = parts[0];
  const fraction = (parts[1] ?? "").slice(0, maxDecimals);
  return `${whole}.${fraction}`;
}

function parseReadingInput(value: string): number | null {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function toMiles(value: number, unit: DmiUnit): number {
  return unit === "mi" ? value : value / FEET_PER_MILE;
}

function fromMiles(miles: number, unit: DmiUnit): number {
  return unit === "mi" ? miles : miles * FEET_PER_MILE;
}

function formatMiles(miles: number): string {
  return miles.toFixed(2);
}

function formatFeet(feet: number): string {
  const rounded = Number(feet.toFixed(1));
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}

function formatInputReading(value: number, unit: DmiUnit): string {
  return unit === "mi" ? formatMiles(value) : formatFeet(value);
}

function formatDistancePrimary(distanceMiles: number, unit: DmiUnit): string {
  if (unit === "mi") return `${formatMiles(distanceMiles)} mi`;
  return `${formatFeet(distanceMiles * FEET_PER_MILE)} ft`;
}

function formatDistanceSecondary(distanceMiles: number, unit: DmiUnit): string {
  if (unit === "mi") return `${formatFeet(distanceMiles * FEET_PER_MILE)} ft`;
  return `${formatMiles(distanceMiles)} mi`;
}

export default function DmiScreen() {
  const { orgId, role } = useOrg();
  const canCreateDmi = hasRolePermission("createDmi", role);

  const [startAt, setStartAt] = useState<number | null>(null);
  const [unit, setUnit] = useState<DmiUnit>("mi");
  const [startReading, setStartReading] = useState("");
  const [endReading, setEndReading] = useState("");
  const [notes, setNotes] = useState("");

  const running = startAt != null;

  const delta = useMemo(() => {
    const s = parseReadingInput(startReading);
    const e = parseReadingInput(endReading);
    if (s == null || e == null) return null;
    const deltaInUnit = e - s;
    return {
      deltaInUnit,
      deltaMiles: toMiles(deltaInUnit, unit),
    };
  }, [startReading, endReading, unit]);

  function convertReadingForUnit(rawValue: string, fromUnit: DmiUnit, toUnit: DmiUnit): string {
    const parsed = parseReadingInput(rawValue);
    if (parsed == null) return sanitizeReadingInput(rawValue, toUnit);
    const miles = toMiles(parsed, fromUnit);
    const converted = fromMiles(miles, toUnit);
    return formatInputReading(converted, toUnit);
  }

  function onChangeUnit(nextUnit: DmiUnit) {
    if (nextUnit === unit) return;
    setStartReading((cur) => convertReadingForUnit(cur, unit, nextUnit));
    setEndReading((cur) => convertReadingForUnit(cur, unit, nextUnit));
    setUnit(nextUnit);
  }

  function start() {
    if (!canCreateDmi) {
      Alert.alert("Permission denied", permissionDeniedMessage("createDmi"));
      return;
    }

    setStartAt(Date.now());
    setStartReading("");
    setEndReading("");
    setNotes("");
  }

  async function stopAndSave() {
    if (startAt == null) return;
    if (!canCreateDmi) {
      Alert.alert("Permission denied", permissionDeniedMessage("createDmi"));
      return;
    }

    const s = parseReadingInput(startReading);
    const e = parseReadingInput(endReading);

    if (s == null || e == null) {
      const label = unit === "mi" ? "miles" : "feet";
      Alert.alert("Missing reading", `Enter start and end readings in ${label}.`);
      return;
    }

    const deltaInUnit = e - s;
    if (deltaInUnit < 0) {
      Alert.alert("Invalid", "End reading must be greater than or equal to start reading.");
      return;
    }

    const miles = toMiles(deltaInUnit, unit);
    const meters = miles * METERS_PER_MILE;

    let uid: string | null = null;
    let displayName: string | null = null;
    try {
      const user = getAuth(getApp()).currentUser;
      uid = user?.uid ?? null;
      displayName = user?.displayName ?? null;
    } catch {}

    const now = Date.now();
    const rec = {
      id: makeClientId("dmi"),
      orgId: orgId!,
      createdAt: now,
      updatedAt: now,
      createdByUid: uid,
      createdByDisplayName: displayName,
      startAt,
      endAt: now,
      startLat: null,
      startLng: null,
      endLat: null,
      endLng: null,
      inputUnit: unit,
      startReadingRaw: startReading.trim(),
      endReadingRaw: endReading.trim(),
      startReadingMiles: toMiles(s, unit),
      endReadingMiles: toMiles(e, unit),
      distanceMiles: miles,
      distanceMeters: meters,
      notes: notes.trim() || null,
    };

    await dmiService.insertAndEnqueue(rec);

    setStartAt(null);
    setStartReading("");
    setEndReading("");
    setNotes("");

    Alert.alert(
      "Saved",
      `${formatDistancePrimary(miles, unit)} (${formatDistanceSecondary(miles, unit)})`,
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>DMI</Text>

      <Text style={styles.hint}>
        Enter your vehicle odometer/DMI start and end readings. Miles supports hundredths (0.01).
      </Text>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Input Unit</Text>
        <View style={styles.unitRow}>
          <TouchableOpacity
            onPress={() => onChangeUnit("mi")}
            style={[styles.unitButton, unit === "mi" && styles.unitButtonActive]}
          >
            <Text style={[styles.unitButtonText, unit === "mi" && styles.unitButtonTextActive]}>Miles</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => onChangeUnit("ft")}
            style={[styles.unitButton, unit === "ft" && styles.unitButtonActive]}
          >
            <Text style={[styles.unitButtonText, unit === "ft" && styles.unitButtonTextActive]}>Feet</Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Start reading ({unit === "mi" ? "miles" : "feet"})</Text>
        <TextInput
          keyboardType="decimal-pad"
          value={startReading}
          editable={running && canCreateDmi}
          onChangeText={(text) => setStartReading(sanitizeReadingInput(text, unit))}
          placeholder={unit === "mi" ? "e.g. 12.34" : "e.g. 652"}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>End reading ({unit === "mi" ? "miles" : "feet"})</Text>
        <TextInput
          keyboardType="decimal-pad"
          value={endReading}
          editable={running && canCreateDmi}
          onChangeText={(text) => setEndReading(sanitizeReadingInput(text, unit))}
          placeholder={unit === "mi" ? "e.g. 12.89" : "e.g. 1175"}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="Guardrail MP 8.4 to 9.2…"
          editable={canCreateDmi}
          style={styles.input}
        />
      </View>

      <View style={styles.fieldGroup}>
        <Text style={styles.label}>Distance</Text>
        <Text style={styles.distance}>
          {delta == null
            ? "—"
            : delta.deltaInUnit < 0
              ? "End reading is less than start reading"
              : `${formatDistancePrimary(delta.deltaMiles, unit)} (${formatDistanceSecondary(
                  delta.deltaMiles,
                  unit,
                )})`}
        </Text>
        <Text style={styles.hintSmall}>
          Allowed input: numbers and decimal point. Miles up to 2 decimals; feet up to 1 decimal.
        </Text>
      </View>

      {!running ? (
        <TouchableOpacity onPress={start} disabled={!canCreateDmi} style={[styles.button, !canCreateDmi && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>{canCreateDmi ? "Start" : "Not allowed for this role"}</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity onPress={stopAndSave} disabled={!canCreateDmi} style={[styles.button, !canCreateDmi && styles.buttonDisabled]}>
          <Text style={styles.buttonText}>Stop &amp; Save</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  title: { fontSize: 22, fontWeight: "900" },
  hint: { marginTop: 8, color: "#666", fontSize: 13 },
  fieldGroup: { marginTop: 16 },
  label: { fontWeight: "700" },
  unitRow: { flexDirection: "row", marginTop: 8 },
  unitButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    marginRight: 10,
  },
  unitButtonActive: { backgroundColor: "#111827", borderColor: "#111827" },
  unitButtonText: { fontWeight: "700", color: "#111827" },
  unitButtonTextActive: { color: "#ffffff" },
  input: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 8,
    padding: 10,
    marginTop: 6,
    fontSize: 16,
  },
  distance: { fontSize: 18, marginTop: 6 },
  hintSmall: { marginTop: 4, color: "#666", fontSize: 12 },
  button: {
    marginTop: 22,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#333",
    alignItems: "center",
  },
  buttonText: { fontWeight: "700", fontSize: 16 },
  buttonDisabled: { opacity: 0.5 },
});
