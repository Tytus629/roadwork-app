import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import AppTabs from "./AppTabs";
import ToolsScreen from "../screens/ToolsScreen";
import WorkItemSheetScreen from "../screens/WorkItemSheetScreen";
import { AsphaltCalculatorScreen } from "../tools/asphalt/AsphaltCalculatorScreen";
import { MeasureDistanceScreen } from "../tools/measure/MeasureDistanceScreen";
import AssetDetailScreen from "../screens/AssetDetailScreen";
import DmiScreen from "../screens/DmiScreen";
import CounterScreen from "../screens/CounterScreen";
import DriveModeScreen from "../screens/DriveModeScreen";
import ExportScreen from "../screens/ExportScreen";
import RoadConditionDashboardScreen from "../screens/RoadConditionDashboardScreen";

export type RootStackParamList = {
  MainTabs: undefined;
  Tools: undefined;
  WorkItemSheet: { id: string };
  AssetDetail: { assetId: string };
  AsphaltCalculator: undefined;
  MeasureDistance: undefined;
  Dmi: undefined;
  Counter: undefined;
  DriveMode: undefined;
  RoadConditionDashboard: undefined;
  IntegrationExport: undefined;
};

const Stack = createStackNavigator<RootStackParamList>();

export default function RootNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: true }}>
      <Stack.Screen 
        name="MainTabs" 
        component={AppTabs} 
        options={{ headerShown: false }}
      />
      <Stack.Screen 
        name="Tools" 
        component={ToolsScreen}
        options={{ title: "Tools" }}
      />
      <Stack.Screen
        name="WorkItemSheet"
        component={WorkItemSheetScreen}
        options={{ title: "Work Order", presentation: "modal" }}
      />
      <Stack.Screen
        name="AssetDetail"
        component={AssetDetailScreen}
        options={{ title: "Asset Detail" }}
      />
      <Stack.Screen 
        name="AsphaltCalculator" 
        component={AsphaltCalculatorScreen}
        options={{ title: "Asphalt Calculator" }}
      />
      <Stack.Screen 
        name="MeasureDistance" 
        component={MeasureDistanceScreen}
        options={{ title: "Measure Distance" }}
      />
      <Stack.Screen
        name="Dmi"
        component={DmiScreen}
        options={{ title: "DMI" }}
      />
      <Stack.Screen
        name="Counter"
        component={CounterScreen}
        options={{ title: "Counter" }}
      />
      <Stack.Screen
        name="DriveMode"
        component={DriveModeScreen}
        options={{ title: "Drive Mode" }}
      />
      <Stack.Screen
        name="RoadConditionDashboard"
        component={RoadConditionDashboardScreen}
        options={{ title: "Road Condition" }}
      />
      <Stack.Screen
        name="IntegrationExport"
        component={ExportScreen}
        options={{ title: "Export to GIS" }}
      />
    </Stack.Navigator>
  );
}
