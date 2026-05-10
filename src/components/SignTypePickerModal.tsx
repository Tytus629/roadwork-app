import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import { SIGN_CATALOG } from "../constants/signCatalog";
import { SIGN_TYPES } from "../constants/signTypes";
import type { SignDetailsInfo } from "../types/workItem";

export type SignTypeItem = {
  id: string;
  label: string;
  category: string;
  mutcdCode?: string;
  keywords?: string[];
};

function norm(s: unknown) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function makeCatalogId(code: string, name: string): string {
  return `mutcd_${norm(code).replace(/[^a-z0-9]+/g, "_")}_${norm(name).replace(/[^a-z0-9]+/g, "_")}`;
}

function clean(v: string): string | undefined {
  const t = String(v ?? "").trim();
  return t.length ? t : undefined;
}

function dedupeSignItems(items: SignTypeItem[]): SignTypeItem[] {
  const seen = new Set<string>();
  const out: SignTypeItem[] = [];
  for (const item of items) {
    const key = String(item.id ?? "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function firstNonBlank(...values: unknown[]): string | null {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text.length) return text;
  }
  return null;
}

function toSignItemFromDetails(raw: unknown): SignTypeItem | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;

  const id = firstNonBlank(rec.signTypeId, rec.id, rec.type);
  const label = firstNonBlank(rec.signName, rec.signType, rec.label, rec.name, id);
  if (!id || !label) return null;

  return {
    id,
    label,
    category: firstNonBlank(rec.category, "Other") ?? "Other",
    mutcdCode: firstNonBlank(rec.signCode, rec.mutcdCode, rec.MUTCDCode, rec.code) ?? undefined,
    keywords: [],
  };
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
    <TouchableOpacity onPress={onPress} style={[styles.chip, active ? styles.chipActive : styles.chipIdle]}>
      <Text style={[styles.chipText, active ? styles.chipTextActive : styles.chipTextIdle]}>{label}</Text>
    </TouchableOpacity>
  );
}

export function SignTypePickerModal({
  visible,
  onClose,
  selectedId,
  initialDetails,
  onSelect,
}: {
  visible: boolean;
  onClose: () => void;
  selectedId?: string | null;
  initialDetails?: SignDetailsInfo | null;
  onSelect: (selection: {
    signType: SignTypeItem;
    detailsPatch: Partial<SignDetailsInfo>;
  }) => void;
}) {
  const { height: windowHeight } = useWindowDimensions();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");
  const [draftSelectedId, setDraftSelectedId] = useState<string | null>(null);
  const [selectedSigns, setSelectedSigns] = useState<SignTypeItem[]>([]);

  const [postType, setPostType] = useState<"Wood" | "Steel" | "Other" | "">("");
  const [signSize, setSignSize] = useState("");
  const [mountType, setMountType] = useState("");

  const footerMaxHeight = Math.max(220, Math.min(Math.round(windowHeight * 0.46), 360));
  const selectedSignsMaxHeight = Math.max(96, Math.min(Math.round(windowHeight * 0.2), 170));

  const allSignTypes = useMemo<SignTypeItem[]>(() => {
    const out: SignTypeItem[] = [];
    const seenIds = new Set<string>();
    const seenMutcd = new Set<string>();

    for (const s of SIGN_TYPES as any[]) {
      const id = String(s.id ?? "").trim();
      if (!id || seenIds.has(id)) continue;
      const mutcdCode = String(s.mutcdCode ?? "").trim();
      out.push({
        id,
        label: String(s.label ?? id),
        category: String(s.category ?? "Other"),
        mutcdCode: mutcdCode || undefined,
        keywords: [],
      });
      seenIds.add(id);
      if (mutcdCode) seenMutcd.add(norm(mutcdCode));
    }

    // Add MUTCD catalog entries missing from the sign type list.
    for (const s of SIGN_CATALOG) {
      const codeKey = norm(s.code);
      if (codeKey && seenMutcd.has(codeKey)) continue;

      const id = makeCatalogId(s.code, s.name);
      if (seenIds.has(id)) continue;

      out.push({
        id,
        label: s.name,
        category: s.category,
        mutcdCode: s.code,
        keywords: Array.isArray(s.keywords) ? s.keywords : [],
      });
      seenIds.add(id);
      if (codeKey) seenMutcd.add(codeKey);
    }

    out.sort((a, b) => {
      const c = a.category.localeCompare(b.category);
      if (c !== 0) return c;
      return a.label.localeCompare(b.label);
    });

    return out;
  }, []);

  const categories = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = ["All"];
    for (const s of allSignTypes) {
      const c = String(s.category ?? "Unknown").trim();
      if (!c || seen.has(c)) continue;
      seen.add(c);
      out.push(c);
    }
    return out;
  }, [allSignTypes]);

  const filtered = useMemo(() => {
    const q = norm(query);
    return allSignTypes.filter((s) => {
      if (category !== "All" && s.category !== category) return false;
      if (!q) return true;
      return (
        norm(s.id).includes(q) ||
        norm(s.label).includes(q) ||
        norm(s.category).includes(q) ||
        norm(s.mutcdCode).includes(q) ||
        (s.keywords ?? []).some((k) => norm(k).includes(q))
      );
    });
  }, [allSignTypes, category, query]);

  const selected = useMemo(
    () => allSignTypes.find((s) => s.id === draftSelectedId) ?? null,
    [allSignTypes, draftSelectedId],
  );

  useEffect(() => {
    if (!visible) return;
    setDraftSelectedId(selectedId ?? null);
    setQuery("");
    setCategory("All");
    setPostType((initialDetails?.supportType as any) ?? "");
    setSignSize(initialDetails?.size ?? "");
    setMountType(initialDetails?.mountType ?? "");

    const existingFromDetails: SignTypeItem[] = [];
    if (Array.isArray(initialDetails?.signs)) {
      for (const raw of initialDetails.signs) {
        const parsed = toSignItemFromDetails(raw);
        if (parsed) existingFromDetails.push(parsed);
      }
    }

    if (!existingFromDetails.length) {
      const legacyItem = toSignItemFromDetails({
        signTypeId: (initialDetails as any)?.signTypeId ?? selectedId,
        signName: (initialDetails as any)?.signName ?? initialDetails?.signType,
        signCode: (initialDetails as any)?.signCode ?? initialDetails?.MUTCDCode,
        category: (initialDetails as any)?.category,
      });
      if (legacyItem) existingFromDetails.push(legacyItem);
    }

    const hydrated = dedupeSignItems(
      existingFromDetails.map((item) => allSignTypes.find((s) => s.id === item.id) ?? item),
    );
    setSelectedSigns(hydrated);
  }, [visible, selectedId, initialDetails, allSignTypes]);

  function addSelectedSign() {
    if (!selected) return;
    setSelectedSigns((prev) => dedupeSignItems([...prev, selected]));
  }

  function removeSelectedSign(id: string) {
    const key = String(id ?? "").trim().toLowerCase();
    setSelectedSigns((prev) => prev.filter((item) => item.id.toLowerCase() !== key));
  }

  function applySelection() {
    let signsToApply = selectedSigns;
    if (!signsToApply.length && selected) {
      signsToApply = [selected];
    }
    if (!signsToApply.length) return;

    const primary = signsToApply[0];

    const signEntries = signsToApply.map((sign, index) => ({
      signTypeId: sign.id,
      signName: sign.label,
      signType: sign.label,
      signCode: sign.mutcdCode ?? null,
      MUTCDCode: sign.mutcdCode ?? null,
      category: sign.category,
      position: index + 1,
    }));

    onSelect({
      signType: primary,
      detailsPatch: {
        signType: primary.label,
        MUTCDCode: primary.mutcdCode || undefined,
        size: clean(signSize),
        supportType: clean(postType),
        material: clean(postType),
        mountType: clean(mountType),
        signTypeId: primary.id,
        signName: primary.label,
        signCode: primary.mutcdCode ?? null,
        category: primary.category,
        signs: signEntries,
      },
    });
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Choose Sign Type</Text>
          <Text style={styles.headerSub}>
            Search standard sign types and MUTCD catalog entries.
          </Text>

          <Text style={styles.categoryTitle}>Category</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollContent}
            style={styles.categoryScroll}
          >
            {categories.map((c) => (
              <Chip key={c} label={c} active={c === category} onPress={() => setCategory(c)} />
            ))}
          </ScrollView>

          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search sign code..."
            autoCorrect={false}
            style={styles.searchInput}
          />
        </View>

        <FlatList
          style={styles.resultsList}
          data={filtered}
          keyExtractor={(x) => String(x.id)}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const active = draftSelectedId === item.id;
            const code = item.mutcdCode ? ` ${item.mutcdCode}` : "";
            return (
              <TouchableOpacity
                onPress={() => setDraftSelectedId(item.id)}
                style={[styles.resultRow, active && styles.resultRowActive]}
              >
                <Text style={[styles.resultTitle, active ? styles.resultTitleActive : styles.resultTitleIdle]}>
                  {active ? `OK ${item.label}` : item.label}
                </Text>
                <Text style={styles.resultSub}>
                  {item.id}{code} • {item.category}
                </Text>
              </TouchableOpacity>
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Text style={styles.emptyText}>No matches.</Text>
            </View>
          }
        />

        <View style={styles.footer}>
          <ScrollView
            style={[styles.footerScroll, { maxHeight: footerMaxHeight }]}
            contentContainerStyle={styles.footerScrollContent}
            showsVerticalScrollIndicator
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.footerTitle}>Signs On This Post</Text>
            {!!selectedSigns.length && (
              <ScrollView
                style={[styles.selectedSignsList, { maxHeight: selectedSignsMaxHeight }]}
                nestedScrollEnabled
                showsVerticalScrollIndicator
              >
                {selectedSigns.map((item, index) => (
                  <View key={item.id} style={styles.selectedSignRow}>
                    <View style={styles.selectedSignTextWrap}>
                      <Text style={styles.selectedSignTitle}>
                        {index + 1}. {item.label}
                      </Text>
                      <Text style={styles.selectedSignSub}>
                        {item.id}{item.mutcdCode ? ` ${item.mutcdCode}` : ""}
                      </Text>
                    </View>
                    <TouchableOpacity onPress={() => removeSelectedSign(item.id)} style={styles.removeSignButton}>
                      <Text style={styles.removeSignButtonText}>Remove</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </ScrollView>
            )}
            {!selectedSigns.length && (
              <Text style={styles.selectedSignEmptyText}>
                No signs added yet. Pick a sign above, then tap Add Sign.
              </Text>
            )}

            <TouchableOpacity
              onPress={addSelectedSign}
              disabled={!selected}
              style={[styles.addSignButton, !selected && styles.addSignButtonDisabled]}
            >
              <Text style={styles.addSignButtonText}>Add Sign</Text>
            </TouchableOpacity>

            <Text style={styles.footerTitle}>Additional Sign Info</Text>

            <Text style={styles.footerLabel}>Post Type</Text>
            <View style={styles.chipRowCompact}>
              {(["Wood", "Steel", "Other"] as const).map((pt) => (
                <Chip
                  key={pt}
                  label={pt}
                  active={postType === pt}
                  onPress={() => setPostType((prev) => (prev === pt ? "" : pt))}
                />
              ))}
            </View>

            <TextInput
              value={signSize}
              onChangeText={setSignSize}
              placeholder='Sign size / diameter (e.g. 30" x 30")'
              style={styles.detailInput}
            />

            <TextInput
              value={mountType}
              onChangeText={setMountType}
              placeholder="Mount type (optional)"
              style={styles.detailInput}
            />

            <View style={styles.footerButtons}>
              <TouchableOpacity
                onPress={onClose}
                style={styles.cancelButton}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={applySelection}
                disabled={!selectedSigns.length && !selected}
                style={[styles.applyButton, !selectedSigns.length && !selected && styles.applyButtonDisabled]}
              >
                <Text style={styles.applyText}>Apply</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  header: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  headerTitle: {
    fontWeight: "900",
    fontSize: 18,
  },
  headerSub: {
    marginTop: 6,
    color: "#666",
  },
  searchInput: {
    marginTop: 8,
    borderWidth: 1,
    borderRadius: 12,
    borderColor: "#d1d5db",
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  categoryTitle: {
    marginTop: 10,
    fontWeight: "900",
  },
  categoryScroll: {
    marginTop: 8,
  },
  categoryScrollContent: {
    paddingRight: 8,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginTop: 10,
  },
  chipRowCompact: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    marginRight: 8,
    marginBottom: 8,
  },
  chipIdle: {
    borderColor: "#d1d5db",
    backgroundColor: "white",
  },
  chipActive: {
    borderColor: "#111827",
    backgroundColor: "#111827",
  },
  chipText: {
    fontWeight: "800",
  },
  chipTextIdle: {
    color: "#111827",
  },
  chipTextActive: {
    color: "white",
  },
  listContent: {
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 16,
  },
  resultsList: {
    flex: 1,
  },
  resultRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
    borderRadius: 8,
    paddingHorizontal: 8,
  },
  resultRowActive: {
    backgroundColor: "#eff6ff",
  },
  resultTitle: {
    fontWeight: "700",
  },
  resultTitleIdle: {
    fontWeight: "700",
  },
  resultTitleActive: {
    fontWeight: "900",
  },
  resultSub: {
    marginTop: 4,
    color: "#666",
  },
  emptyWrap: {
    paddingTop: 16,
  },
  emptyText: {
    color: "#666",
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  footerScroll: {
    width: "100%",
  },
  footerScrollContent: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  footerTitle: {
    fontWeight: "900",
    fontSize: 14,
    marginBottom: 10,
  },
  selectedSignsList: {
    marginBottom: 10,
  },
  selectedSignRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: "#e5e7eb",
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: "#f9fafb",
  },
  selectedSignTextWrap: {
    flex: 1,
    paddingRight: 8,
  },
  selectedSignTitle: {
    fontWeight: "800",
    color: "#111827",
  },
  selectedSignSub: {
    marginTop: 2,
    color: "#6b7280",
    fontSize: 12,
  },
  selectedSignEmptyText: {
    marginBottom: 10,
    color: "#6b7280",
  },
  addSignButton: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111827",
    alignItems: "center",
    paddingVertical: 10,
    marginBottom: 12,
    backgroundColor: "#111827",
  },
  addSignButtonDisabled: {
    backgroundColor: "#9ca3af",
    borderColor: "#9ca3af",
  },
  addSignButtonText: {
    color: "white",
    fontWeight: "900",
  },
  removeSignButton: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#d1d5db",
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: "white",
  },
  removeSignButtonText: {
    color: "#374151",
    fontWeight: "700",
    fontSize: 12,
  },
  footerLabel: {
    fontWeight: "700",
    fontSize: 12,
    color: "#374151",
    marginBottom: 8,
  },
  detailInput: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: "white",
    marginBottom: 10,
  },
  footerButtons: {
    flexDirection: "row",
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 10,
    alignItems: "center",
    marginRight: 5,
  },
  cancelText: {
    fontWeight: "900",
  },
  applyButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    marginLeft: 5,
    backgroundColor: "#111827",
  },
  applyButtonDisabled: {
    backgroundColor: "#9ca3af",
  },
  applyText: {
    fontWeight: "900",
    color: "white",
  },
});
