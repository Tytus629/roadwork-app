import React, { useMemo, useState } from "react";
import { View, Text, StyleSheet, Pressable, TextInput } from "react-native";
import type { AssetCreateType } from "./CreateWizardModal";

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

type Props = {
  draft: DraftAsset;
  saving?: boolean;
  onCreate: (input: { subtype: string | null }) => void;
  onClose: () => void;
};

function labelForType(type: AssetCreateType): string {
  if (type === "sign") return "Sign";
  if (type === "culvert") return "Culvert";
  if (type === "guardrail") return "Guardrail";
  if (type === "bridge") return "Bridge";
  return "Delineator";
}

export default function AssetDraftSheet({ draft, saving = false, onCreate, onClose }: Props) {
  const [subtype, setSubtype] = useState("");

  const geometrySummary = useMemo(() => {
    if (draft.bridge && draft.bridge.corners.length === 4) {
      const center = draft.bridge.center;
      return `Bridge corners (4) • Center ${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`;
    }
    if (draft.points && draft.points.length >= 2) {
      return `Line (${draft.points.length} points)`;
    }
    if (draft.point) {
      return `Point (${draft.point.lat.toFixed(5)}, ${draft.point.lng.toFixed(5)})`;
    }
    return "Unknown";
  }, [draft.point, draft.points]);

  return (
    <View style={styles.wrap}>
      <View style={styles.sheet}>
        <Text style={styles.title}>Create Asset</Text>
        <Text style={styles.hint}>Use this quick asset form. Work-order-only fields are not shown.</Text>

        <View style={styles.row}>
          <Text style={styles.label}>Type</Text>
          <Text style={styles.value}>{labelForType(draft.type)}</Text>
        </View>

        <View style={styles.row}>
          <Text style={styles.label}>Geometry</Text>
          <Text style={styles.value}>{geometrySummary}</Text>
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{draft.type === "bridge" ? "Bridge Name/ID (optional)" : "Subtype (optional)"}</Text>
          <TextInput
            value={subtype}
            onChangeText={setSubtype}
            placeholder="e.g. STOP, W_BEAM, DELINEATOR"
            placeholderTextColor="#94a3b8"
            style={styles.input}
            editable={!saving}
          />
        </View>

        <View style={styles.footerRow}>
          <Pressable onPress={onClose} style={styles.secondary} disabled={saving}>
            <Text style={styles.secondaryText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={() => onCreate({ subtype: subtype.trim() || null })}
            style={[styles.primary, saving && styles.primaryDisabled]}
            disabled={saving}
          >
            <Text style={styles.primaryText}>{saving ? "Saving..." : "Create Asset"}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0,0,0,0.28)",
    paddingHorizontal: 10,
    paddingBottom: 10,
  },
  sheet: {
    backgroundColor: "#ffffff",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    gap: 10,
  },
  title: {
    fontSize: 16,
    fontWeight: "900",
    color: "#0f172a",
  },
  hint: {
    fontSize: 12,
    color: "#475569",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  label: {
    fontWeight: "800",
    color: "#0f172a",
  },
  value: {
    color: "#334155",
    fontWeight: "700",
  },
  field: {
    gap: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 9,
    color: "#0f172a",
    backgroundColor: "#f8fafc",
    fontSize: 14,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 2,
  },
  secondary: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#f1f5f9",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    alignItems: "center",
  },
  secondaryText: {
    fontWeight: "900",
    color: "#0f172a",
  },
  primary: {
    flex: 1,
    padding: 12,
    borderRadius: 12,
    backgroundColor: "#111827",
    alignItems: "center",
  },
  primaryDisabled: {
    opacity: 0.6,
  },
  primaryText: {
    color: "#ffffff",
    fontWeight: "900",
  },
});
