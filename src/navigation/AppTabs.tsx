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
 * 
 * ─── IMPORTANT: detachInactiveScreens={false} ───
 * This is set on Tab.Navigator to prevent React Navigation from unmounting
 * screens when the user switches tabs. Without this, the MapScreen's native
 * GoogleMap view is destroyed and recreated every time the user leaves and
 * returns to the Map tab. The consequences of the default (true) are:
 *
 *   1. Android Google Maps native bitmap cache is lost — markers added during
 *      view creation silently vanish (they render but never paint on screen).
 *   2. onMapReady fires on every tab return, resetting viewport and state.
 *   3. User loses their map position and zoom level.
 *
 * Setting detachInactiveScreens={false} keeps all tab screens mounted in the
 * background. The tradeoff is slightly higher memory usage, but it's essential
 * for a stable map experience. MapScreen also has a marker suppression pattern
 * as a safety net (see MapScreen.tsx header docs) in case onMapReady fires
 * for other reasons (e.g., low-memory reclaim on Android).
 */
import React from "react";
import { Platform, Text } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import MapScreen from "../screens/MapScreen";
import { WorkOrdersScreen } from "../screens/WorkOrdersScreen";
import AssetsHomeScreen from "../screens/AssetsHomeScreen";
import { MoreStack } from "./MoreStack";

export type RootTabParamList = {
  Map: undefined;
  Work: undefined;
  Assets: undefined;
  More: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function AppTabs() {
  const insets = useSafeAreaInsets();
  const tabBarBottomOffset = Platform.OS === "android"
    ? Math.max(insets.bottom + 16, 28)
    : Math.max(insets.bottom, 8);
  const tabBarHeight = 40;

  return (
    <Tab.Navigator
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: true,
        tabBarIcon: () => null,
        tabBarIconStyle: { height: 0, width: 0 },
        tabBarActiveTintColor: "#ffb020",
        tabBarInactiveTintColor: "#ffb020",
        // Keep labels above Android nav controls with guaranteed bottom padding.
        tabBarStyle: {
          position: "absolute",
          left: 8,
          right: 8,
          bottom: tabBarBottomOffset - 5,
          height: tabBarHeight,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: "#11181f",
          borderRadius: 12,
          borderTopWidth: 1,
          borderTopColor: "#2b3742",
        },
        tabBarItemStyle: { paddingTop: 0, paddingBottom: 0, justifyContent: "center", alignItems: "center" },
        tabBarLabelStyle: {
          fontSize: 14,
          fontWeight: "800",
          letterSpacing: 0.3,
          lineHeight: 16,
          marginTop: 0,
          transform: [{ translateY: 5 }],
        },
      }}
    >
      <Tab.Screen 
        name="Map" 
        component={MapScreen}
        options={{
          headerShown: false,
        }}
      />
      <Tab.Screen 
        name="Work" 
        component={WorkOrdersScreen} 
        options={{ 
          title: "Active Work Orders",
          tabBarLabel: ({ color }) => (
            <Text
              numberOfLines={2}
              style={{
                color,
                fontSize: 11,
                fontWeight: "800",
                lineHeight: 12,
                textAlign: "center",
                includeFontPadding: false,
                transform: [{ translateY: 1 }],
              }}
            >
              {"Active\nWork Order"}
            </Text>
          ),
        }} 
      />
      <Tab.Screen 
        name="Assets" 
        component={AssetsHomeScreen} 
        options={{ 
          title: "Assets",
          tabBarLabel: "Assets",
        }} 
      />
      <Tab.Screen 
        name="More" 
        component={MoreStack}
        options={{
          headerShown: false,
        }}
      />
    </Tab.Navigator>
  );
}
