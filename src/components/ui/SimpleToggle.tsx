import React from "react";
import { View, Text, Switch, StyleSheet } from "react-native";

export function SimpleToggle(props: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>{props.label}</Text>
      <Switch value={props.value} onValueChange={props.onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingVertical: 4,
  },
  label: {
    fontWeight: "700",
    fontSize: 13,
    flex: 1,
    paddingRight: 12,
    color: "#374151",
  },
});
