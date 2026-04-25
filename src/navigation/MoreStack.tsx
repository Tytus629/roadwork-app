import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MoreScreen from "../screens/MoreScreen";
import CrewActivityScreen from "../screens/CrewActivityScreen";
import NotificationsScreen from "../screens/NotificationsScreen";
import LogScreen from "../screens/LogScreen";
import ToolsScreen from "../screens/ToolsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import PrivacyPolicyScreen from "../screens/PrivacyPolicyScreen";
import AssetsDueScreen from "../screens/AssetsDueScreen";
import TailgateListScreen from "../screens/TailgateListScreen";
import TailgateCreateScreen from "../screens/TailgateCreateScreen";
import TailgateDetailScreen from "../screens/TailgateDetailScreen";
import MaintenanceSlipListScreen from "../screens/MaintenanceSlipListScreen";
import MaintenanceSlipCreateScreen from "../screens/MaintenanceSlipCreateScreen";
import MaintenanceSlipDetailScreen from "../screens/MaintenanceSlipDetailScreen";
import VehicleAssetsListScreen from "../screens/VehicleAssetsListScreen";
import VehicleAssetCreateScreen from "../screens/VehicleAssetCreateScreen";
import VehicleAssetDetailScreen from "../screens/VehicleAssetDetailScreen";
import OutboxFailedScreen from "../screens/OutboxFailedScreen";
import OperationsListsScreen from "../screens/OperationsListsScreen";
import OperationsListDetailScreen from "../screens/OperationsListDetailScreen";
import CreateOperationsListScreen from "../screens/CreateOperationsListScreen";
import AddOperationsListItemScreen from "../screens/AddOperationsListItemScreen";

const Stack = createNativeStackNavigator();

export function MoreStack() {
  return (
    <Stack.Navigator>
      <Stack.Screen 
        name="MoreHome" 
        component={MoreScreen} 
        options={{ title: "More" }} 
      />
      <Stack.Screen
        name="CrewActivity"
        component={CrewActivityScreen}
        options={{ title: "Crew Activity" }}
      />
      <Stack.Screen
        name="Notifications"
        component={NotificationsScreen}
        options={{ title: "Notifications" }}
      />
      <Stack.Screen 
        name="LogArchive" 
        component={LogScreen} 
        options={{ title: "Log / Archive" }} 
      />
      <Stack.Screen 
        name="Tools" 
        component={ToolsScreen} 
        options={{ title: "Tools" }} 
      />
      <Stack.Screen 
        name="Settings" 
        component={SettingsScreen} 
        options={{ title: "Settings" }} 
      />
      <Stack.Screen
        name="PrivacyPolicy"
        component={PrivacyPolicyScreen}
        options={{ title: "Privacy Policy" }}
      />
      <Stack.Screen 
        name="AssetsDue" 
        component={AssetsDueScreen} 
        options={{ title: "Assets Due" }} 
      />
      <Stack.Screen
        name="TailgateLogs"
        component={TailgateListScreen}
        options={{ title: "Tailgate Logs" }}
      />
      <Stack.Screen
        name="TailgateCreate"
        component={TailgateCreateScreen}
        options={{ title: "New Tailgate" }}
      />
      <Stack.Screen
        name="TailgateDetail"
        component={TailgateDetailScreen}
        options={{ title: "Tailgate Detail" }}
      />
      <Stack.Screen
        name="MaintenanceSlips"
        component={MaintenanceSlipListScreen}
        options={{ title: "Vehicle Maintenance" }}
      />
      <Stack.Screen
        name="VehicleAssets"
        component={VehicleAssetsListScreen}
        options={{ title: "Vehicle Assets" }}
      />
      <Stack.Screen
        name="VehicleAssetCreate"
        component={VehicleAssetCreateScreen}
        options={{ title: "New Vehicle Asset" }}
      />
      <Stack.Screen
        name="VehicleAssetDetail"
        component={VehicleAssetDetailScreen}
        options={{ title: "Vehicle Asset" }}
      />
      <Stack.Screen
        name="MaintenanceSlipCreate"
        component={MaintenanceSlipCreateScreen}
        options={{ title: "New Maintenance Slip" }}
      />
      <Stack.Screen
        name="MaintenanceSlipDetail"
        component={MaintenanceSlipDetailScreen}
        options={{ title: "Maintenance Slip" }}
      />
      <Stack.Screen
        name="OperationsLists"
        component={OperationsListsScreen}
        options={{ title: "Operations Lists" }}
      />
      <Stack.Screen
        name="OperationsListDetail"
        component={OperationsListDetailScreen}
        options={{ title: "Operations List" }}
      />
      <Stack.Screen
        name="OperationsListCreate"
        component={CreateOperationsListScreen}
        options={{ title: "New Operations List" }}
      />
      <Stack.Screen
        name="OperationsListAddItem"
        component={AddOperationsListItemScreen}
        options={{ title: "Add List Item" }}
      />
      <Stack.Screen
        name="OutboxFailed"
        component={OutboxFailedScreen}
        options={{ title: "Failed Jobs" }}
      />
    </Stack.Navigator>
  );
}
