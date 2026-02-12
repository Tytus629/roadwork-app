import React, { useMemo, useState } from "react";
import { View, Text, Pressable, TextInput, FlatList } from "react-native";

type Item = {
  key: string;          // unique id (ex: "R1-1")
  label: string;        // display (ex: "STOP (R1-1)")
  rawLabel: string;     // for searching (ex: "STOP R1-1 Regulatory")
};

type Props = {
  title: string;                    // "Sign Type"
  placeholder: string;              // "Select sign"
  valueLabel: string | null;        // current selected name
  items: Item[];
  onSelect: (key: string) => void;  // called on selection
};

export default function InlineDropdownPicker(props: Props) {
  const { title, placeholder, valueLabel, items, onSelect } = props;

  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return items;
    return items.filter(i => i.rawLabel.toLowerCase().includes(query));
  }, [items, q]);

  return (
    <View style={{ marginTop: 10 }}>
      {/* CLOSED ROW */}
      <Pressable
        onPress={() => setOpen(v => !v)}
        style={{
          paddingVertical: 12,
          paddingHorizontal: 12,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: "#ddd",
          backgroundColor: "white",
        }}
      >
        <Text style={{ fontWeight: "700" }}>{title}</Text>
        <Text style={{ marginTop: 6 }}>
          {valueLabel ?? placeholder}
        </Text>
      </Pressable>

      {/* OPEN LIST (ONLY EXISTS WHEN open === true) */}
      {open && (
        <View
          style={{
            marginTop: 10,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: "#ddd",
            backgroundColor: "white",
            overflow: "hidden",
          }}
        >
          <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: "#eee" }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search..."
              autoFocus
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 10,
                paddingHorizontal: 10,
                paddingVertical: 8,
              }}
            />
          </View>

          <FlatList
            keyboardShouldPersistTaps="handled"
            data={filtered}
            keyExtractor={(it) => it.key}
            style={{ maxHeight: 260 }}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onSelect(item.key);
                  // CRITICAL: collapse + cleanup immediately
                  setOpen(false);
                  setQ("");
                }}
                style={{
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: "#f0f0f0",
                }}
              >
                <Text>{item.label}</Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </View>
  );
}
