/**
 * ═══════════════════════════════════════════════════════════════════════════
 * APP TABS NAVIGATOR - Bottom Tab Navigation
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * STARTUP PERSISTENCE LOADING:
 * On mount, loads all work orders from SQLite into Redux.
 * This is how work orders persist across app restarts.
 * 
 * LOADING SEQUENCE:
 * 1. Component mounts
 * 2. useEffect runs once (dependency: [dispatch])
 * 3. Calls getAllWorkItems() from workRepo
 * 4. Dispatches loadAllWorkItems(items) to Redux
 * 5. All screens now have access to persisted data
 * 
 * LOGGING:
 * - Before: "[startup] Loading persisted work orders..."
 * - Success: "[startup] Loaded X work orders from DB"
 * - Failure: "[startup] Load failed - running without DB"
 * 
 * GRACEFUL FAILURE:
 * - If DB unavailable, logs warning but continues
 * - App starts with empty Redux state (no crash)
 * - User can still create new work orders (in-memory only)
 * 
 * CHANGE HISTORY:
 * - Added comprehensive startup logging
 * - Enhanced error handling for DB failures
 * - Logs work order count on successful load
 */
import React, { useEffect } from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { useAppDispatch } from "../store/hooks";
import { loadAllWorkItems } from "../store/workItemsSlice";
import { getAllWorkItems, isDbAvailable } from "../storage/workRepo";
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
  const dispatch = useAppDispatch();

  /**
   * STARTUP PERSISTENCE RESTORATION
   * Runs once when app starts to load persisted work orders from SQLite.
   * This is the critical path that makes work orders survive app restarts.
   */
  useEffect(() => {
    (async () => {
      try {
        console.log("[startup] Loading persisted work orders...");
        const items = await getAllWorkItems();
        dispatch(loadAllWorkItems(items));
        console.log("[startup] Loaded", items.length, "work orders from DB");
      } catch (e) {
        console.warn("[startup] Load failed - running without DB:", e);
      }
    })();
  }, [dispatch]);

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
}
