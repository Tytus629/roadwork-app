import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  TextInput,
  FlatList,
  Platform,
} from "react-native";

export type ModalSelectItem = {
  key: string;
  label: string;
  search: string; // prebuilt lowercase search string
};

type Props = {
  title: string;
  placeholder: string;
  valueLabel: string | null;
  items: ModalSelectItem[];
  onSelect: (key: string) => void;
};

export default function ModalSelect(props: Props) {
  const { title, placeholder, valueLabel, items, onSelect } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter((i) => i.search.includes(query));
  }, [items, q]);

  return (
    <View style={{ marginTop: 12 }}>
      {/* Closed field */}
      <Pressable
        onPress={() => setOpen(true)}
        style={{
          borderWidth: 1,
          borderColor: "#d0d5dd",
          borderRadius: 12,
          paddingVertical: 12,
          paddingHorizontal: 12,
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontWeight: "700", marginBottom: 6 }}>{title}</Text>
        <Text style={{ color: valueLabel ? "#111" : "#667085" }}>
          {valueLabel ?? placeholder}
        </Text>
      </Pressable>

      <Modal
        visible={open}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setOpen(false)}
      >
        {/* backdrop */}
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
          }}
        />

        {/* sheet */}
        <View
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            maxHeight: "80%",
            backgroundColor: "white",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderWidth: 1,
            borderColor: "#e5e7eb",
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 14, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
            <Text style={{ fontSize: 18, fontWeight: "800" }}>{title}</Text>

            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search..."
              autoFocus
              style={{
                marginTop: 10,
                borderWidth: 1,
                borderColor: "#d0d5dd",
                borderRadius: 12,
                paddingHorizontal: 12,
                paddingVertical: Platform.OS === "ios" ? 12 : 10,
              }}
            />

            <Pressable
              onPress={() => setOpen(false)}
              style={{ marginTop: 10, alignSelf: "flex-start" }}
            >
              <Text style={{ fontWeight: "700" }}>Close</Text>
            </Pressable>
          </View>

          <FlatList
            keyboardShouldPersistTaps="handled"
            data={filtered}
            keyExtractor={(it) => it.key}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.key);
                  // CRITICAL: close immediately
                  setOpen(false);
                  setQ("");
                }}
                style={{
                  paddingVertical: 14,
                  paddingHorizontal: 14,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f0f0f0",
                }}
              >
                <Text style={{ fontSize: 16 }}>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      </Modal>
    </View>
  );
}
