import React, { useEffect, useMemo, useState } from "react";
import { Modal, ScrollView, Text, TouchableOpacity, View, StyleSheet } from "react-native";
import { useWorkOrderFilter } from "../state/FilterContext";
import type { WorkOrderFilter } from "../db/types";
import {
  PRIORITY_OPTIONS,
  SIGN_CATEGORY_OPTIONS,
  SIGN_CONDITION_OPTIONS,
  STATUS_OPTIONS,
} from "../constants/filterOptions";
import { getDistinctWorkOrderTypes } from "../db/workOrdersRepo";
import { subscribeDbChanged, getDbTick } from "../state/DbEvents";

function toggleInList(list: string[] | undefined, value: string) {
  const cur = list ?? [];
  return cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value];
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
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text style={[styles.chipText, active && styles.chipTextActive]}>
        {active ? `✓ ${label}` : label}
      </Text>
    </TouchableOpacity>
  );
}

export function WorkOrderFilterSheet({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const { filter, setFilter, clearFilter } = useWorkOrderFilter();

  const [types, setTypes] = useState<string[]>([]);
  const [dbTick, setDbTick] = useState(0);

  useEffect(() => {
    return subscribeDbChanged(() => setDbTick(getDbTick()));
  }, []);

  useEffect(() => {
    if (!visible) return;
    const t = getDistinctWorkOrderTypes();
    setTypes(t);
  }, [visible, dbTick]);

  const safeTypes = useMemo(() => types, [types]);

  const next = (patch: Partial<WorkOrderFilter>) => setFilter({ ...filter, ...patch });

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} transparent>
      <View style={styles.overlay}>
        <View style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>Filters</Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.scroll}>
            {/* TYPE */}
            <Text style={styles.sectionTitle}>Type</Text>
            <View style={styles.chipRow}>
              {safeTypes.map((t) => (
                <Chip
                  key={t}
                  label={t}
                  active={(filter.types ?? []).includes(t)}
                  onPress={() => next({ types: toggleInList(filter.types, t) })}
                />
              ))}
            </View>

            {/* STATUS */}
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.chipRow}>
              {STATUS_OPTIONS.map((s) => (
                <Chip
                  key={s}
                  label={s}
                  active={(filter.status ?? []).includes(s)}
                  onPress={() => next({ status: toggleInList(filter.status as any, s) as any })}
                />
              ))}
            </View>

            {/* PRIORITY */}
            <Text style={styles.sectionTitle}>Priority</Text>
            <View style={styles.chipRow}>
              {PRIORITY_OPTIONS.map((p) => (
                <Chip
                  key={p}
                  label={p}
                  active={(filter.priority ?? []).includes(p)}
                  onPress={() => next({ priority: toggleInList(filter.priority as any, p) as any })}
                />
              ))}
            </View>

            {/* SIGN CATEGORY */}
            <Text style={styles.sectionTitle}>Sign Category</Text>
            <View style={styles.chipRow}>
              {SIGN_CATEGORY_OPTIONS.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={(filter.signCategory ?? []).includes(c)}
                  onPress={() => next({ signCategory: toggleInList(filter.signCategory, c) })}
                />
              ))}
            </View>

            {/* SIGN CONDITION */}
            <Text style={styles.sectionTitle}>Sign Condition</Text>
            <View style={styles.chipRow}>
              {SIGN_CONDITION_OPTIONS.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  active={(filter.signCondition ?? []).includes(c)}
                  onPress={() => next({ signCondition: toggleInList(filter.signCondition, c) })}
                />
              ))}
            </View>

            <View style={{ height: 12 }} />

            <TouchableOpacity onPress={clearFilter} style={styles.clearButton}>
              <Text style={styles.clearButtonText}>Clear all filters</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={onClose} style={styles.applyButton}>
              <Text style={styles.applyButtonText}>Apply</Text>
            </TouchableOpacity>

            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "flex-end",
  },
  container: {
    backgroundColor: "white",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "85%",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontWeight: "800",
    fontSize: 20,
    color: "#111827",
  },
  closeText: {
    fontSize: 24,
    fontWeight: "600",
    color: "#64748b",
  },
  scroll: {
    padding: 16,
  },
  sectionTitle: {
    fontWeight: "700",
    fontSize: 15,
    marginTop: 16,
    marginBottom: 10,
    color: "#111827",
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
  },
  chipActive: {
    backgroundColor: "#3b82f6",
    borderColor: "#3b82f6",
  },
  chipText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#475569",
  },
  chipTextActive: {
    color: "white",
  },
  clearButton: {
    padding: 14,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
    marginBottom: 10,
    backgroundColor: "white",
  },
  clearButtonText: {
    fontWeight: "700",
    fontSize: 15,
    color: "#475569",
  },
  applyButton: {
    padding: 14,
    borderRadius: 12,
    alignItems: "center",
    backgroundColor: "#111827",
  },
  applyButtonText: {
    fontWeight: "700",
    fontSize: 15,
    color: "white",
  },
});
