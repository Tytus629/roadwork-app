import React, { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, TouchableOpacity, FlatList } from "react-native";
import { SIGN_TYPES } from "../constants/signTypes";

type SignTypeItem = {
  id: string;
  label: string;
  category: string;
};

function norm(s: any) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function Chip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity
      onPress={onPress}
      style={{
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 16,
        borderWidth: 1,
        marginRight: 8,
        marginBottom: 8,
      }}
    >
      <Text style={{ fontWeight: "800" }}>{active ? `OK ${label}` : label}</Text>
    </TouchableOpacity>
  );
}

export function SignTypePickerModal({
  visible,
  onClose,
  selectedId,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selectedId?: string | null;
  onSelect: (st: SignTypeItem) => void;
}) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = ["All"];
    for (const s of SIGN_TYPES as any[]) {
      const c = String(s.category ?? "Unknown").trim();
      if (!c) continue;
      if (seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }, []);

  const filtered = useMemo(() => {
    const q = norm(query);

    return (SIGN_TYPES as any[]).filter((s) => {
      const id = String(s.id ?? "");
      const label = String(s.label ?? "");
      const cat = String(s.category ?? "Unknown");
      const code = String(s.mutcdCode ?? "");

      if (category !== "All" && cat !== category) return false;
      if (!q) return true;

      return (
        norm(id).includes(q) ||
        norm(label).includes(q) ||
        norm(cat).includes(q) ||
        norm(code).includes(q)
      );
    });
  }, [query, category]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: "white" }}>
        <View
          style={{
            padding: 16,
            borderBottomWidth: 1,
            borderBottomColor: "#eee",
          }}
        >
          <Text style={{ fontWeight: "900", fontSize: 18 }}>Select Sign Type</Text>
          <Text style={{ marginTop: 6, color: "#666" }}>
            Type to search (e.g., stop, speed, curve, R1-1)
          </Text>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search sign code..."
            autoCorrect={false}
            style={{
              marginTop: 12,
              borderWidth: 1,
              borderRadius: 12,
              paddingHorizontal: 12,
              paddingVertical: 10,
            }}
          />

          <Text style={{ marginTop: 12, fontWeight: "900" }}>Category</Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 10 }}>
            {categories.map((c) => (
              <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
            ))}
          </View>

          <TouchableOpacity
            onPress={onClose}
            style={{
              marginTop: 8,
              paddingVertical: 10,
              borderWidth: 1,
              borderRadius: 12,
              alignItems: "center",
            }}
          >
            <Text style={{ fontWeight: "900" }}>Close</Text>
          </TouchableOpacity>
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(x: any) => String(x.id)}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }: any) => {
            const active = (selectedId ?? null) === item.id;
            const code = item.mutcdCode ? ` ${item.mutcdCode}` : "";
            return (
              <TouchableOpacity
                onPress={() => onSelect(item)}
                style={{
                  paddingVertical: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#eee",
                }}
              >
                <Text style={{ fontWeight: active ? "900" : "700" }}>
                  {active ? `OK ${item.label}` : item.label}
                </Text>
                <Text style={{ marginTop: 4, color: "#666" }}>
                  {item.id}{code} • {item.category}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={{ paddingTop: 16 }}>
              <Text style={{ color: "#666" }}>No matches.</Text>
            </View>
          }
        />
      </View>
    </Modal>
  );
}
