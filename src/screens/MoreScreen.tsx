import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useNotifications } from "../hooks/useNotifications";
import { useOrg } from "../state/OrgContext";
import { hasRolePermission } from "../permissions/rolePermissions";

function Row({
  title,
  subtitle,
  onPress,
}: {
  title: string;
  subtitle?: string;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity onPress={onPress} style={styles.row}>
      <Text style={styles.rowTitle}>{title}</Text>
      {subtitle ? <Text style={styles.rowSubtitle}>{subtitle}</Text> : null}
    </TouchableOpacity>
  );
}

export default function MoreScreen() {
  const navigation = useNavigation<any>();
  const { role, orgId } = useOrg();
  const validationAssetId = "asset_1775949152653_5712fe5c8babd4";
  const canUseTools =
    hasRolePermission("createDmi", role) ||
    hasRolePermission("createCounter", role);
  const canUseTailgate = hasRolePermission("createTailgate", role);
  const canUseVehicleAssets = hasRolePermission("viewVehicleAssets", role);
  const canUseMaintenance = hasRolePermission("viewMaintenanceSlip", role);
  const { unreadCount } = useNotifications(80, orgId);

  return (
    <View style={styles.container}>
      <Row
        title="Notifications"
        subtitle={
          unreadCount > 0
            ? `${unreadCount} unread assignment, status, and asset alerts`
            : "Assignment, status, and important asset alerts"
        }
        onPress={() => navigation.navigate("Notifications")}
      />
      <Row
        title="Crew Activity"
        subtitle="Recent work orders, assignments, and asset activity"
        onPress={() => navigation.navigate("CrewActivity")}
      />
      <Row
        title="Log / Archive"
        subtitle="Audit trail and completed items"
        onPress={() => navigation.navigate("LogArchive")}
      />
      <Row
        title="Assets Due"
        subtitle="Items needing attention"
        onPress={() => navigation.navigate("AssetsDue")}
      />
      <Row
        title="DEV: Open Linked Asset Validation"
        subtitle="Open known asset detail for timeline tap validation"
        onPress={() => navigation.navigate("AssetDetail", { assetId: validationAssetId })}
      />
      {canUseTools ? (
        <Row
          title="Tools"
          subtitle="Field calculators and utilities"
          onPress={() => navigation.navigate("Tools")}
        />
      ) : null}
      {canUseTailgate ? (
        <Row
          title="Tailgate Logs"
          subtitle="Daily safety checklists"
          onPress={() => navigation.navigate("TailgateLogs")}
        />
      ) : null}
      {canUseMaintenance ? (
        <Row
          title="Vehicle Maintenance"
          subtitle="Problem sheets for trucks, equipment, and shop repairs"
          onPress={() => navigation.navigate("MaintenanceSlips")}
        />
      ) : null}
      {canUseVehicleAssets ? (
        <Row
          title="Vehicle Assets"
          subtitle="Fleet records for mechanics and maintenance workflows"
          onPress={() => navigation.navigate("VehicleAssets")}
        />
      ) : null}
      <Row
        title="Operations Lists"
        subtitle="Shared program/route progress across crews"
        onPress={() => navigation.navigate("OperationsLists")}
      />
      <Row
        title="Settings"
        subtitle="Notifications, preferences, and app info"
        onPress={() => navigation.navigate("Settings")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "white",
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#eee",
  },
  rowTitle: {
    fontWeight: "700",
    fontSize: 16,
  },
  rowSubtitle: {
    marginTop: 4,
    color: "#666",
  },
});
