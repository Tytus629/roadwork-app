import React, { useCallback } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { openWorkOrderDetail } from "../navigation/openWorkOrderDetail";
import { useNotifications, type NotificationItem } from "../hooks/useNotifications";
import { useOrg } from "../state/OrgContext";

function NotificationSeparator() {
  return <View style={styles.separator} />;
}

function formatTimestamp(ts: number): string {
  if (!Number.isFinite(ts) || ts <= 0) return "Unknown time";
  return new Date(ts).toLocaleString();
}

export default function NotificationsScreen() {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
  const { items, loading, error, unreadCount, markAllRead, markOpened } = useNotifications(120, orgId);

  const handleMarkAllRead = useCallback(() => {
    markAllRead().catch(() => {
      Alert.alert("Unable to mark notifications read", "Please try again.");
    });
  }, [markAllRead]);

  const handleOpenItem = useCallback(async (item: NotificationItem) => {
    await markOpened(item.notification.id);

    const targetId = String(item.notification.targetId ?? "").trim();
    if (item.notification.targetType === "work_order") {
      if (!targetId || !item.workOrder) {
        Alert.alert(
          "Work order unavailable",
          "This notification points to a work order that is not available on this device yet.",
        );
        return;
      }

      openWorkOrderDetail(navigation, targetId, {
        missingMessage: "This notification points to a work order that is missing an ID.",
        errorMessage: "Please try again.",
      });
      return;
    }

    if (item.notification.targetType === "asset") {
      if (!targetId || !item.asset) {
        Alert.alert(
          "Asset unavailable",
          "This notification points to an asset that is not available on this device yet.",
        );
        return;
      }

      try {
        navigation.navigate("AssetDetail", { assetId: targetId });
      } catch {
        Alert.alert("Unable to open asset", "Please try again.");
      }
      return;
    }

    Alert.alert("Notification only", "This notification does not have an openable target.");
  }, [markOpened, navigation]);

  const handlePressItem = useCallback((item: NotificationItem) => {
    handleOpenItem(item).catch(() => {
      Alert.alert("Unable to open notification", "Please try again.");
    });
  }, [handleOpenItem]);

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.headerCopy}>
          <Text style={styles.title}>Notifications</Text>
          <Text style={styles.subtitle}>Assignments, status changes, and important asset activity related to your work.</Text>
        </View>
        <Pressable
          onPress={handleMarkAllRead}
          style={({ pressed }) => [styles.markAllButton, pressed && styles.markAllButtonPressed]}
        >
          <Text style={styles.markAllText}>Mark all read</Text>
        </Pressable>
      </View>

      <View style={styles.summaryRow}>
        <Text style={styles.summaryText}>{unreadCount} unread</Text>
      </View>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.centerText}>Loading notifications…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centerState}>
          <Text style={styles.centerText}>No notifications yet.</Text>
          <Text style={styles.emptyHint}>You will see assignment changes, status changes on your work, and linked asset activity here.</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.notification.id}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={NotificationSeparator}
          renderItem={({ item }) => {
            const unread = item.notification.readAt == null;
            const targetAvailable =
              item.notification.targetType === "work_order"
                ? !!item.workOrder
                : item.notification.targetType === "asset"
                  ? !!item.asset
                  : false;

            return (
              <Pressable
                onPress={() => handlePressItem(item)}
                style={[styles.card, unread && styles.cardUnread]}
              >
                <View style={styles.cardTopRow}>
                  <Text style={styles.cardTitle}>{item.notification.title}</Text>
                  <Text style={styles.time}>{formatTimestamp(item.notification.sourceCreatedAt)}</Text>
                </View>
                {item.notification.body ? (
                  <Text style={styles.cardBody}>{item.notification.body}</Text>
                ) : null}
                {!targetAvailable ? (
                  <Text style={styles.missingTarget}>Target not available on this device.</Text>
                ) : null}
                {unread ? <View style={styles.unreadDot} /> : null}
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
  },
  headerCopy: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569",
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "#ffffff",
  },
  markAllButtonPressed: {
    opacity: 0.8,
  },
  markAllText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  summaryRow: {
    marginTop: 12,
    marginBottom: 10,
  },
  summaryText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#334155",
  },
  listContent: {
    paddingBottom: 24,
  },
  separator: {
    height: 10,
  },
  card: {
    position: "relative",
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  cardUnread: {
    borderColor: "#f59e0b",
    backgroundColor: "#fffaf0",
  },
  cardTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  cardTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  time: {
    fontSize: 11,
    color: "#64748b",
  },
  cardBody: {
    marginTop: 8,
    marginRight: 16,
    fontSize: 13,
    lineHeight: 18,
    color: "#334155",
  },
  unreadDot: {
    position: "absolute",
    top: 14,
    right: 14,
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: "#f59e0b",
  },
  missingTarget: {
    marginTop: 8,
    fontSize: 12,
    color: "#b45309",
  },
  centerState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  centerText: {
    fontSize: 14,
    color: "#475569",
    textAlign: "center",
  },
  emptyHint: {
    fontSize: 12,
    color: "#64748b",
    textAlign: "center",
  },
  errorText: {
    fontSize: 14,
    color: "#b91c1c",
    textAlign: "center",
  },
});
