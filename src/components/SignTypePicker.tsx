/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SIGN TYPE PICKER MODAL
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Searchable modal picker for selecting traffic signs from the MUTCD catalog.
 * 
 * Features:
 * - Real-time search/typeahead filtering
 * - Grouped by category (Regulatory, Warning, Guide, etc.)
 * - Displays MUTCD code and sign name
 * - Supports custom signs
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  TextInput,
  ScrollView,
  SectionList,
} from "react-native";
import { SIGN_CATALOG, type SignCatalogItem } from "../data/signCatalog";
import type { SignCategory } from "../types/workItem";

type Props = {
  visible: boolean;
  onClose: () => void;
  onSelect: (item: SignCatalogItem) => void;
};

export default function SignTypePicker({ visible, onClose, onSelect }: Props) {
  const [searchQuery, setSearchQuery] = useState("");

  // Filter and group signs by category
  const sections = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    
    // Filter signs based on search query
    const filtered = query
      ? SIGN_CATALOG.filter(
          sign =>
            sign.name.toLowerCase().includes(query) ||
            sign.code.toLowerCase().includes(query) ||
            sign.category.toLowerCase().includes(query)
        )
      : SIGN_CATALOG;

    // Group by category
    const grouped = new Map<SignCategory, SignCatalogItem[]>();
    filtered.forEach(sign => {
      const existing = grouped.get(sign.category) || [];
      grouped.set(sign.category, [...existing, sign]);
    });

    // Convert to section list format
    return Array.from(grouped.entries()).map(([category, items]) => ({
      title: category,
      data: items,
    }));
  }, [searchQuery]);

  const handleSelect = (item: SignCatalogItem) => {
    onSelect(item);
    setSearchQuery(""); // Reset search
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Select Sign Type</Text>
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </Pressable>
          </View>

          {/* Search Input */}
          <View style={styles.searchContainer}>
            <TextInput
              style={styles.searchInput}
              placeholder="Search signs (e.g., STOP, speed, merge)..."
              placeholderTextColor="#94a3b8"
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
          </View>

          {/* Results Count */}
          <Text style={styles.resultCount}>
            {sections.reduce((sum, s) => sum + s.data.length, 0)} signs
            {searchQuery ? ` matching "${searchQuery}"` : ""}
          </Text>

          {/* Sign List */}
          <SectionList
            sections={sections}
            keyExtractor={(item, index) => `${item.code}-${index}`}
            renderSectionHeader={({ section: { title } }) => (
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>{title}</Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                style={({ pressed }) => [
                  styles.item,
                  pressed && styles.itemPressed,
                ]}
                onPress={() => handleSelect(item)}
              >
                <View style={styles.itemContent}>
                  <Text style={styles.itemCode}>{item.code}</Text>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.needsValue && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>Needs Value</Text>
                    </View>
                  )}
                </View>
              </Pressable>
            )}
            stickySectionHeadersEnabled
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.empty}>
                <Text style={styles.emptyText}>No signs found</Text>
                <Text style={styles.emptyHint}>Try a different search term</Text>
              </View>
            }
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    height: "90%",
    paddingTop: 16,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    backgroundColor: "#f1f5f9",
  },
  closeText: {
    fontSize: 20,
    color: "#64748b",
    fontWeight: "600",
  },
  searchContainer: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 8,
  },
  searchInput: {
    backgroundColor: "#f1f5f9",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: "#111827",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  resultCount: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    fontSize: 13,
    color: "#64748b",
    fontWeight: "500",
  },
  listContent: {
    paddingBottom: 20,
  },
  sectionHeader: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  item: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  itemPressed: {
    backgroundColor: "#f8fafc",
  },
  itemContent: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  itemCode: {
    fontSize: 13,
    fontWeight: "700",
    color: "#3b82f6",
    backgroundColor: "#eff6ff",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    minWidth: 60,
    textAlign: "center",
  },
  itemName: {
    flex: 1,
    fontSize: 15,
    fontWeight: "600",
    color: "#111827",
  },
  badge: {
    backgroundColor: "#fef3c7",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: "#fde047",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#854d0e",
    textTransform: "uppercase",
  },
  empty: {
    padding: 40,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#64748b",
    marginBottom: 4,
  },
  emptyHint: {
    fontSize: 14,
    color: "#94a3b8",
  },
});
