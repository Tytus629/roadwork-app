/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APP TABS NAVIGATOR - Bottom Tab Navigation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * PERSISTENCE MODEL:
 * SQLite is the source of truth. Screens use hooks that query the DB directly:
 * - useMapWorkOrders() - for Map screen
 * - useActiveWorkOrders() - for Work List screen
 * - DbEvents system provides reactivity when data changes
 * 
 * NO REDUX HYDRATION:
 * We previously loaded all work orders into Redux on startup. That's been removed.
 * Each screen now reads from SQLite on demand, subscribes to changes via DbEvents.
 * 
 * GRACEFUL FAILURE:
 * - If DB unavailable, hooks return empty arrays
 * - App continues to work (create operations will fail gracefully)
 */
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import MapScreen from "../screens/MapScreen";
import WorkListScreen from "../screens/WorkListScreen";
import SignsHomeScreen from "../screens/SignsHomeScreen";
import { MoreStack } from "./MoreStack";

export type RootTabParamList = {
  Map: undefined;
  Work: undefined;
  Signs: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function AppTabs() {
  return (
    <Tab.Navigator screenOptions={{ headerShown: true }}>
      <Tab.Screen 
        name="Map" 
        component={MapScreen}
        options={{
          tabBarIcon: ({ color, size }) => <Icon name="map" size={size} color={color} />
        }}
      />
      <Tab.Screen 
        name="Work" 
        component={WorkListScreen} 
        options={{ 
          title: "Work Orders",
          tabBarIcon: ({ color, size }) => <Icon name="format-list-bulleted" size={size} color={color} />
        }} 
      />
      <Tab.Screen 
        name="Signs" 
        component={SignsHomeScreen} 
        options={{ 
          title: "Signs",
          tabBarIcon: ({ color, size }) => <Icon name="sign-direction" size={size} color={color} />
        }} 
      />
      <Tab.Screen 
        name="More" 
        component={MoreStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Icon name="dots-horizontal" size={size} color={color} />
        }}
      />
    </Tab.Navigator>
  );
}        component={MoreStack}
        options={{
          headerShown: false,
          tabBarIcon: ({ color, size }) => <Icon name="dots-horizontal" size={size} color={color} />
        }}
      />
    </Tab.Navigator>
  );
}
