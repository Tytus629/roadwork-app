import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MoreScreen from "../screens/MoreScreen";
import LogScreen from "../screens/LogScreen";
import ToolsScreen from "../screens/ToolsScreen";
import SettingsScreen from "../screens/SettingsScreen";

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
    </Stack.Navigator>
  );
}
