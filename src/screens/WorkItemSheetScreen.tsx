import React from "react";
import { View, Text, Pressable } from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import WorkItemSheet from "../components/WorkItemSheet";
import { LocationRefEditor } from "../components/LocationRefEditor";
import {
  logSyncBreadcrumb,
  recordErrorWithContext,
  setCustomKeySafe,
} from "../telemetry/crashlytics";

export default function WorkItemSheetScreen() {
  const navigation = useNavigation();
  const route = useRoute<any>();
  const workItemId = route?.params?.id ?? null;

  React.useEffect(() => {
    setCustomKeySafe("routeName", "WorkItemSheet");
    setCustomKeySafe("workOrderId", workItemId ?? "");
    if (!workItemId) {
      logSyncBreadcrumb("work item route missing id", {
        routeName: "WorkItemSheet",
        routeState: "existing",
      });
      recordErrorWithContext(new Error("work item route missing id"), {
        message: "work item screen opened without id",
        extras: {
          routeName: "WorkItemSheet",
          routeState: "existing",
        },
      });
    }
  }, [workItemId]);

  if (!workItemId) {
    return (
      <View style={{ flex: 1, backgroundColor: "white", justifyContent: "center", alignItems: "center", padding: 20 }}>
        <Text style={{ fontSize: 18, fontWeight: "700", marginBottom: 8 }}>Work Order Unavailable</Text>
        <Text style={{ fontSize: 14, color: "#475569", textAlign: "center", marginBottom: 16 }}>
          This work-order route is missing an ID.
        </Text>
        <Pressable
          onPress={() => navigation.goBack()}
          style={{ backgroundColor: "#1d4ed8", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8 }}
        >
          <Text style={{ color: "#ffffff", fontWeight: "700" }}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "white" }}>
      <View style={{ paddingHorizontal: 12 }}>
        <LocationRefEditor entityType="work_order" entityId={workItemId} />
      </View>
      <WorkItemSheet mode="existing" workItemId={workItemId} onClose={() => navigation.goBack()} />
    </View>
  );
}
