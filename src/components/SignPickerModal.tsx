import React, { useMemo, useState } from "react";
import {
  Modal,
  View,
  Text,
  Pressable,
  FlatList,
  TextInput,
  StyleSheet,
} from "react-native";
import { SIGN_CATALOG, SignCatalogItem, SignCategory } from "../constants/signCatalog";

const separatorStyle = { height: 1, opacity: 0.2, marginLeft: 16 };

function ItemSeparator() {
  return <View style={separatorStyle} />;
}

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: SignCatalogItem) => void;
  initialCategory?: SignCategory | "All";
};

export function SignPickerModal({
  visible,
  onClose,
  onSelect,
  initialCategory = "All",
}: Props) {
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<SignCategory | "All">(initialCategory);

  const filtered = useMemo(() => {
    const query = q.trim().toLowerCase();
    return SIGN_CATALOG.filter((s) => {
      if (cat !== "All" && s.category !== cat) return false;
      if (!query) return true;
      const hay = [
        s.code,
        s.name,
        s.category,
        ...(s.keywords ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(query);
    });
  }, [q, cat]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.header}>
          <Text style={styles.title}>Select Sign</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeTxt}>Close</Text>
          </Pressable>
        </View>

        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Search: STOP, R1-1, SPEED LIMIT, deer…"
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
        />

        <View style={styles.catRow}>
          {(["All","Regulatory","Warning","Guide","School","Work Zone (TTC)","Railroad","Bike/Ped"] as const).map((c) => (
            <Pressable
              key={c}
              onPress={() => setCat(c as any)}
              style={[styles.catChip, cat === c && styles.catChipOn]}
            >
              <Text style={[styles.catChipTxt, cat === c && styles.catChipTxtOn]} numberOfLines={1}>
                {c}
              </Text>
            </Pressable>
          ))}
        </View>

        <FlatList
          data={filtered}
          keyExtractor={(item) => `${item.category}:${item.code}:${item.name}`}
          ItemSeparatorComponent={ItemSeparator}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item)}
              style={styles.row}
            >
              <View style={styles.rowLeft}>
                <Text style={styles.code}>{item.code}</Text>
                <Text style={styles.name}>{item.name}</Text>
              </View>
              <Text style={styles.cat} numberOfLines={1}>{item.category}</Text>
            </Pressable>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, paddingTop: 16 },
  header: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { fontSize: 18, fontWeight: "700" },
  closeBtn: { padding: 10 },
  closeTxt: { fontSize: 16, fontWeight: "600" },
  search: {
    marginHorizontal: 16,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 10,
  },
  catRow: {
    paddingHorizontal: 12,
    paddingBottom: 10,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  catChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  catChipOn: { },
  catChipTxt: { fontSize: 12, fontWeight: "600" },
  catChipTxtOn: { },
  row: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  rowLeft: { flexShrink: 1 },
  code: { fontSize: 13, fontWeight: "800" },
  name: { fontSize: 15, fontWeight: "700", marginTop: 2 },
  cat: { fontSize: 12, fontWeight: "600", opacity: 0.8, maxWidth: 140 },
});
