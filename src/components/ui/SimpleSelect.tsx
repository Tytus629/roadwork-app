import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";

export function SimpleSelect<T extends string>(props: {
  label: string;
  value: T | null | undefined;
  options: { label: string; value: T }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.optionsContainer}>
        {props.options.map((o, idx) => (
          <Pressable
            key={o.value}
            onPress={() => props.onChange(o.value)}
            style={[
              styles.option,
              idx === 0 && styles.firstOption,
              idx === props.options.length - 1 && styles.lastOption,
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
      </View>
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
  optionsContainer: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    overflow: "hidden",
  },
  option: {
    padding: 12,
    backgroundColor: "#ffffff",
    borderTopWidth: 1,
    borderTopColor: "#e5e7eb",
  },
  firstOption: {
    borderTopWidth: 0,
  },
  lastOption: {
    // No specific style needed
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
