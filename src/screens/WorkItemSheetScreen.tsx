import React from "react";
import { View } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import WorkItemSheet from "../components/WorkItemSheet";

export default function WorkItemSheetScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const workItemId = route?.params?.id ?? null;

  if (!workItemId) {
    return null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <WorkItemSheet mode="existing" workItemId={workItemId} onClose={() => navigation.goBack()} />
    </View>
  );
}
