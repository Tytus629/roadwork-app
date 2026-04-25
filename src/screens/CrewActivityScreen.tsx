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
import { useOrg } from "../state/OrgContext";
import { useCrewActivity, type CrewActivityItem } from "../hooks/useCrewActivity";
import {
  formatActivityTimestamp,
  getActivityActorLabel,
  getActivityActionLabel,
  getActivitySupportingText,
  getActivityTargetSummary,
} from "../utils/activityFeed";
import { openWorkOrderDetail } from "../navigation/openWorkOrderDetail";

export default function CrewActivityScreen() {
  const navigation = useNavigation<any>();
  const { orgId } = useOrg();
  const { items, loading, error } = useCrewActivity(120, orgId);

  const handleOpenItem = useCallback(
    (item: CrewActivityItem) => {
      const targetId = String(item.activity.targetId ?? "").trim();

      if (item.activity.targetType === "work_order") {
        if (!targetId || !item.workOrder) {
          Alert.alert(
            "Work order unavailable",
            "This activity points to a work order that is not available on this device yet.",
          );
          return;
        }

        openWorkOrderDetail(navigation, targetId, {
          missingMessage: "This activity points to a work order that is missing an ID.",
          errorMessage: "Please try again.",
        });
        return;
      }

      if (item.activity.targetType === "asset") {
        if (!targetId || !item.asset) {
          Alert.alert(
            "Asset unavailable",
            "This activity points to an asset that is not available on this device yet.",
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

      Alert.alert("Activity only", "This activity does not have an openable target.");
    },
    [navigation],
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Crew Activity</Text>
      <Text style={styles.subtitle}>Recent work orders, assignments, and asset-related activity</Text>

      {loading ? (
        <View style={styles.centerState}>
          <ActivityIndicator size="small" color="#111827" />
          <Text style={styles.centerText}>Loading crew activity…</Text>
        </View>
      ) : error ? (
        <View style={styles.centerState}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => `${item.activity.sourceType}:${item.activity.id}`}
          contentContainerStyle={items.length ? styles.listContent : styles.emptyContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={({ item }) => {
            const actorLabel = getActivityActorLabel(item.activity);
            const actionLabel = getActivityActionLabel(item.activity);
            const targetLabel = getActivityTargetSummary({
              activity: item.activity,
              workOrder: item.workOrder,
              asset: item.asset,
            });
            const supportingText = getActivitySupportingText(item.activity);
            const targetAvailable =
              item.activity.targetType === "work_order"
                ? !!item.workOrder
                : item.activity.targetType === "asset"
                  ? !!item.asset
                  : false;

            return (
              <Pressable
                onPress={() => handleOpenItem(item)}
                style={[styles.card, !targetAvailable && styles.cardDisabled]}
              >
                <View style={styles.rowTop}>
                  <Text style={styles.actor}>{actorLabel}</Text>
                  <Text style={styles.time}>{formatActivityTimestamp(item.activity.createdAt)}</Text>
                </View>
                <Text style={styles.action}>{actionLabel}</Text>
                <Text style={styles.target}>{targetLabel}</Text>
                {supportingText ? <Text style={styles.supporting}>{supportingText}</Text> : null}
                {!targetAvailable ? (
                  <Text style={styles.missingTarget}>Target not available on this device.</Text>
                ) : null}
              </Pressable>
            );
          }}
          ListEmptyComponent={
            <View style={styles.centerState}>
              <Text style={styles.centerText}>No crew activity yet.</Text>
              <Text style={styles.emptyHint}>Create or update a work order, assign work, or add asset activity to populate this feed.</Text>
            </View>
          }
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
  title: {
    fontSize: 22,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 4,
    marginBottom: 12,
    fontSize: 13,
    color: "#475569",
  },
  listContent: {
    paddingBottom: 24,
  },
  emptyContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  separator: {
    height: 10,
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    padding: 14,
  },
  cardDisabled: {
    opacity: 0.92,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },
  actor: {
    flex: 1,
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  time: {
    fontSize: 11,
    color: "#64748b",
  },
  action: {
    marginTop: 6,
    fontSize: 15,
    fontWeight: "800",
    color: "#111827",
  },
  target: {
    marginTop: 4,
    fontSize: 14,
    color: "#334155",
  },
  supporting: {
    marginTop: 8,
    fontSize: 12,
    color: "#475569",
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