import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import MoreScreen from "../screens/MoreScreen";
import LogScreen from "../screens/LogScreen";
import ToolsScreen from "../screens/ToolsScreen";
import SettingsScreen from "../screens/SettingsScreen";
import PrivacyPolicyScreen from "../screens/PrivacyPolicyScreen";
import SignsDueScreen from "../screens/SignsDueScreen";
import TailgateListScreen from "../screens/TailgateListScreen";
import TailgateCreateScreen from "../screens/TailgateCreateScreen";
import TailgateDetailScreen from "../screens/TailgateDetailScreen";
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
        name="SignsDue" 
        component={SignsDueScreen} 
        options={{ title: "Signs Due" }} 
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
