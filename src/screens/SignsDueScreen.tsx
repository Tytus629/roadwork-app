import React, { useState, useMemo } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, TextInput } from "react-native";
import type { SignAsset } from "../types/Sign";
import { useSignsContext } from "../state/SignsContext";
import { SignDetailScreen } from "./SignDetailScreen";

/**
 * Signs Due for Inspection Screen
 * 
 * Shows signs that are overdue or due soon for periodic inspection.
 * Also allows ad-hoc inspection of any sign.
 */

export default function SignsDueScreen() {
  const { getSignsNeedingInspection, signs } = useSignsContext();
  const [selectedSign, setSelectedSign] = useState<SignAsset | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const signsNeedingInspection = getSignsNeedingInspection(30); // 30 days ahead
  
  const now = Date.now();
  const overdue = signsNeedingInspection.filter((s) => s.nextDueAt && s.nextDueAt < now);
  const dueSoon = signsNeedingInspection.filter((s) => s.nextDueAt && s.nextDueAt >= now);
  const hasDue = overdue.length > 0 || dueSoon.length > 0;

  // Filter all signs for "Inspect Any Sign" section
  const allSignsArray = Object.values(signs);
  const filteredSigns = useMemo(() => {
    if (!searchQuery.trim()) return allSignsArray;
    
    const query = searchQuery.trim().toLowerCase();
    return allSignsArray.filter((s) => {
      const searchText = `${s.signType} ${s.mutcdCode ?? ""} ${s.message ?? ""}`.toLowerCase();
      return searchText.includes(query);
    });
  }, [allSignsArray, searchQuery]);

  const getDaysUntilDue = (dueAt: number | null | undefined) => {
    if (!dueAt) return null;
    return Math.ceil((dueAt - now) / (1000 * 60 * 60 * 24));
  };

  const formatDate = (ts: number | null | undefined) => {
    if (!ts) return "N/A";
    return new Date(ts).toLocaleDateString();
  };

  const renderSignItem = ({ item }: { item: SignAsset }) => {
    const days = getDaysUntilDue(item.nextDueAt);
    const isOverdue = days !== null && days < 0;

    return (
      <Pressable
        style={[styles.signCard, isOverdue && styles.overdueCard]}
        onPress={() => setSelectedSign(item)}
      >
        <View style={styles.signCardHeader}>
          <Text style={styles.signType}>{item.signType.replace(/_/g, " ").toUpperCase()}</Text>
          <Text style={[styles.daysText, isOverdue && styles.overdueText]}>
            {isOverdue ? `${Math.abs(days!)} days overdue` : `${days} days`}
          </Text>
        </View>
        
        {item.mutcdCode && <Text style={styles.mutcdCode}>{item.mutcdCode}</Text>}
        {item.message && <Text style={styles.message}>{item.message}</Text>}
        
        <Text style={styles.location}>
          📍 {item.lat.toFixed(6)}, {item.lng.toFixed(6)}
        </Text>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Last Inspection:</Text>
          <Text style={styles.statusValue}>{formatDate(item.lastInspectionAt)}</Text>
        </View>
        
        <View style={styles.statusRow}>
          <Text style={styles.statusLabel}>Last Result:</Text>
          <Text style={[styles.statusValue, getResultStyle(item.lastResult)]}>
            {item.lastResult || "N/A"}
          </Text>
        </View>
      </Pressable>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scrollContainer}>
        {/* Empty State if No Inspections Due */}
        {!hasDue && (
          <View style={styles.emptyStateBox}>
            <Text style={styles.emptyStateTitle}>✅ No inspections due right now</Text>
            <Text style={styles.emptyStateText}>
              There are no signs scheduled as due/overdue. You can still inspect any existing sign below.
            </Text>
          </View>
        )}

        {/* Summary Header (only if there are due inspections) */}
        {hasDue && (
          <View style={styles.summary}>
            <View style={[styles.summaryBox, styles.overdueBox]}>
              <Text style={styles.summaryCount}>{overdue.length}</Text>
              <Text style={styles.summaryLabel}>Overdue</Text>
            </View>
            <View style={[styles.summaryBox, styles.dueSoonBox]}>
              <Text style={styles.summaryCount}>{dueSoon.length}</Text>
              <Text style={styles.summaryLabel}>Due Soon</Text>
            </View>
          </View>
        )}

        {/* Overdue Signs */}
        {overdue.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.overdueTitle]}>🚨 Overdue</Text>
            {overdue.map((item) => (
              <View key={item.id}>{renderSignItem({ item })}</View>
            ))}
          </>
        )}

        {/* Due Soon Signs */}
        {dueSoon.length > 0 && (
          <>
            <Text style={[styles.sectionTitle, styles.dueSoonTitle]}>⚠️ Due Soon (30 days)</Text>
            {dueSoon.map((item) => (
              <View key={item.id}>{renderSignItem({ item })}</View>
            ))}
          </>
        )}

        {/* Inspect Any Sign Section */}
        <View style={styles.inspectAnySection}>
          <Text style={styles.inspectAnySectionTitle}>Inspect Any Sign</Text>
          <Text style={styles.inspectAnySectionSubtitle}>
            Perform an ad-hoc inspection on any existing sign
          </Text>
          
          <TextInput
            style={styles.searchInput}
            placeholder="Search signs (type, MUTCD code, message)..."
            value={searchQuery}
            onChangeText={setSearchQuery}
          />

          {allSignsArray.length === 0 ? (
            <View style={styles.noSignsBox}>
              <Text style={styles.noSignsText}>No signs found.</Text>
              <Text style={styles.noSignsSubtext}>
                Create a sign from the map, then it will show here for inspection.
              </Text>
            </View>
          ) : filteredSigns.length === 0 ? (
            <View style={styles.noSignsBox}>
              <Text style={styles.noSignsText}>No signs match your search.</Text>
            </View>
          ) : (
            <>
              {filteredSigns.map((item) => (
                <View key={item.id}>{renderSignItem({ item })}</View>
              ))}
            </>
          )}
        </View>
      </ScrollView>

      {/* Sign Detail Modal */}
      {selectedSign && (
        <SignDetailScreen sign={selectedSign} onClose={() => setSelectedSign(null)} />
      )}
    </View>
  );
}

function getResultStyle(result: string | null | undefined) {
  if (!result) return undefined;
  switch (result) {
    case "ok":
      return styles.resultOk;
    case "marginal":
      return styles.resultMarginal;
    case "replace":
      return styles.resultReplace;
    default:
      return undefined;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  scrollContainer: {
    flex: 1,
  },
  emptyStateBox: {
    margin: 16,
    padding: 16,
    backgroundColor: "#e8f5e9",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#4caf50",
  },
  emptyStateTitle: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#2e7d32",
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: "#388e3c",
  },
  summary: {
    flexDirection: "row",
    gap: 12,
    padding: 16,
  },
  summaryBox: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  overdueBox: {
    backgroundColor: "#ffebee",
    borderWidth: 2,
    borderColor: "#d32f2f",
  },
  dueSoonBox: {
    backgroundColor: "#fff3e0",
    borderWidth: 2,
    borderColor: "#f57c00",
  },
  summaryCount: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#333",
  },
  summaryLabel: {
    fontSize: 14,
    color: "#666",
    marginTop: 4,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  overdueTitle: {
    color: "#d32f2f",
  },
  dueSoonTitle: {
    color: "#f57c00",
  },
  list: {
    flex: 1,
  },
  listContent: {
    padding: 16,
    gap: 12,
  },
  signCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  overdueCard: {
    borderColor: "#d32f2f",
    borderWidth: 2,
  },
  signCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  signType: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#333",
  },
  daysText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#f57c00",
  },
  overdueText: {
    color: "#d32f2f",
  },
  mutcdCode: {
    fontSize: 14,
    color: "#1976d2",
    fontWeight: "500",
    marginBottom: 4,
  },
  message: {
    fontSize: 14,
    color: "#666",
    marginBottom: 8,
  },
  location: {
    fontSize: 13,
    color: "#666",
    marginBottom: 8,
  },
  statusRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 4,
  },
  statusLabel: {
    fontSize: 13,
    color: "#999",
  },
  statusValue: {
    fontSize: 13,
    fontWeight: "500",
    color: "#333",
  },
  resultOk: {
    color: "#4caf50",
  },
  resultMarginal: {
    color: "#ff9800",
  },
  resultReplace: {
    color: "#f44336",
  },
  inspectAnySection: {
    marginTop: 24,
    padding: 16,
    backgroundColor: "#fff",
    borderTopWidth: 8,
    borderTopColor: "#e0e0e0",
  },
  inspectAnySectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
    marginBottom: 4,
  },
  inspectAnySectionSubtitle: {
    fontSize: 14,
    color: "#666",
    marginBottom: 12,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
    backgroundColor: "#f9f9f9",
    marginBottom: 12,
  },
  noSignsBox: {
    padding: 16,
    backgroundColor: "#f5f5f5",
    borderRadius: 8,
    marginTop: 8,
  },
  noSignsText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 6,
  },
  noSignsSubtext: {
    fontSize: 13,
    color: "#999",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#4caf50",
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 16,
    color: "#666",
  },
});
