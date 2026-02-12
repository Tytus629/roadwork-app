import React from "react";
import { createStackNavigator } from "@react-navigation/stack";
import AppTabs from "./AppTabs";
import ToolsScreen from "../screens/ToolsScreen";
import { AsphaltCalculatorScreen } from "../tools/asphalt/AsphaltCalculatorScreen";
import { MeasureDistanceScreen } from "../tools/measure/MeasureDistanceScreen";

export type RootStackParamList = {
  MainTabs: undefined;
  Tools: undefined;
  AsphaltCalculator: undefined;
  MeasureDistance: undefined;
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
        name="AsphaltCalculator" 
        component={AsphaltCalculatorScreen}
        options={{ title: "Asphalt Calculator" }}
      />
      <Stack.Screen 
        name="MeasureDistance" 
        component={MeasureDistanceScreen}
        options={{ title: "Measure Distance" }}
      />
    </Stack.Navigator>
  );
}
