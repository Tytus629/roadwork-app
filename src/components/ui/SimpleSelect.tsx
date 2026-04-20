import React, { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function SimpleSelect<T extends string>(props: {
  label: string;
  value: T | null | undefined;
  options: { label: string; value: T }[];
  onChange: (v: T | null) => void;
  placeholder?: string;
  allowNone?: boolean;
  noneLabel?: string;
}) {
  const [open, setOpen] = useState(false);

  const selectedLabel = useMemo(() => {
    if (props.value == null) return props.placeholder ?? "Select";
    return props.options.find((o) => o.value === props.value)?.label ?? String(props.value);
  }, [props.options, props.placeholder, props.value]);

  return (
    <View style={styles.container}>
      <Text style={styles.label}>{props.label}</Text>

      <Pressable
        onPress={() => setOpen(true)}
        style={[styles.selector, props.value != null && styles.selectorActive]}
      >
        <Text style={[styles.selectorText, props.value == null && styles.placeholderText]}>
          {selectedLabel}
        </Text>
        <Text style={styles.chevron}>v</Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownCard} onPress={() => {}}>
            <Text style={styles.dropdownTitle}>{props.label}</Text>
            <ScrollView style={styles.dropdownList}>
              {props.allowNone && (
                <Pressable
                  onPress={() => {
                    props.onChange(null);
                    setOpen(false);
                  }}
                  style={[
                    styles.option,
                    props.value == null && styles.selectedOption,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      props.value == null && styles.selectedOptionText,
                    ]}
                  >
                    {props.noneLabel ?? "N/A"}
                  </Text>
                </Pressable>
              )}

              {props.options.map((o) => (
                <Pressable
                  key={o.value}
                  onPress={() => {
                    props.onChange(o.value);
                    setOpen(false);
                  }}
                  style={[
                    styles.option,
                    props.value === o.value && styles.selectedOption,
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      props.value === o.value && styles.selectedOptionText,
                    ]}
                  >
                    {o.label}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 12,
  },
  label: {
    fontWeight: "700",
    fontSize: 13,
    marginBottom: 6,
    color: "#374151",
  },
  selector: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    backgroundColor: "#ffffff",
    minHeight: 44,
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  selectorActive: {
    borderColor: "#60a5fa",
  },
  selectorText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
  },
  placeholderText: {
    color: "#6b7280",
    fontWeight: "500",
  },
  chevron: {
    color: "#6b7280",
    fontWeight: "900",
    fontSize: 14,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.35)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  dropdownCard: {
    borderRadius: 12,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#d1d5db",
    maxHeight: "65%",
    overflow: "hidden",
  },
  dropdownTitle: {
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: "800",
    color: "#111827",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  dropdownList: {
    maxHeight: 320,
  },
  option: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  selectedOption: {
    backgroundColor: "#dbeafe",
  },
  optionText: {
    fontSize: 14,
    fontWeight: "500",
    color: "#374151",
  },
  selectedOptionText: {
    fontWeight: "700",
    color: "#1e40af",
  },
});
