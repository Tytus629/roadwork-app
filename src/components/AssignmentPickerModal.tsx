import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { listAssignableOrgMembers } from "../services/orgMembersService";
import type { AssignmentCandidate } from "../utils/workOrderAssignment";

type Props = {
  visible: boolean;
  orgId?: string | null;
  selectedUid?: string | null;
  onClose: () => void;
  onSelect: (candidate: AssignmentCandidate | null) => void;
};

function formatRoleLabel(role: string | null | undefined): string {
  const raw = String(role ?? "").trim();
  if (!raw) return "Member";
  return raw.replace(/_/g, " ");
}

export default function AssignmentPickerModal({
  visible,
  orgId,
  selectedUid,
  onClose,
  onSelect,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<AssignmentCandidate[]>([]);

  useEffect(() => {
    if (!visible) return;
    setQuery("");

    const safeOrgId = String(orgId ?? "").trim();
    if (!safeOrgId) {
      setMembers([]);
      setError("Select an organization before changing assignment.");
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    listAssignableOrgMembers(safeOrgId)
      .then((rows) => {
        if (cancelled) return;
        setMembers(rows);
      })
      .catch((e: any) => {
        if (cancelled) return;
        setMembers([]);
        setError(e?.message ?? "Could not load organization members.");
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [visible, orgId]);

  const filteredMembers = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return members;
    return members.filter((member) => {
      const haystack = [member.displayName, member.email ?? "", member.role ?? "", member.uid]
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [members, query]);

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Assign Work Order</Text>
            <Text style={styles.subtitle}>Choose a person from this organization or clear the assignment.</Text>
          </View>
          <Pressable onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeButtonText}>Close</Text>
          </Pressable>
        </View>

        <View style={styles.content}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search by name or email"
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.searchInput}
          />

          <Pressable onPress={() => onSelect(null)} style={styles.clearRow}>
            <Text style={styles.clearTitle}>Unassign</Text>
            <Text style={styles.clearSubtitle}>Clear the current assignee and leave this work order unassigned.</Text>
          </Pressable>

          {loading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="large" />
              <Text style={styles.stateText}>Loading organization members…</Text>
            </View>
          ) : error ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>Members unavailable</Text>
              <Text style={styles.stateText}>{error}</Text>
            </View>
          ) : filteredMembers.length === 0 ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateTitle}>No matches</Text>
              <Text style={styles.stateText}>Try a different name or email.</Text>
            </View>
          ) : (
            <FlatList
              data={filteredMembers}
              keyExtractor={(item) => item.uid}
              contentContainerStyle={styles.listContent}
              renderItem={({ item }) => {
                const isSelected = selectedUid != null && item.uid === selectedUid;
                return (
                  <Pressable
                    onPress={() => onSelect(item)}
                    style={[styles.memberRow, isSelected && styles.memberRowSelected]}
                  >
                    <View style={styles.memberMain}>
                      <Text style={styles.memberName}>{item.displayName}</Text>
                      <Text style={styles.memberMeta}>
                        {item.email ?? item.uid}
                        {item.role ? ` • ${formatRoleLabel(item.role)}` : ""}
                      </Text>
                    </View>
                    <Text style={styles.memberCheck}>{isSelected ? "Selected" : "Assign"}</Text>
                  </Pressable>
                );
              }}
            />
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 14,
    backgroundColor: "white",
    borderBottomWidth: 1,
    borderBottomColor: "#e2e8f0",
  },
  title: {
    fontSize: 20,
    fontWeight: "900",
    color: "#0f172a",
  },
  subtitle: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569",
    maxWidth: 280,
  },
  closeButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: "#e2e8f0",
  },
  closeButtonText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#0f172a",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderColor: "#cbd5e1",
    backgroundColor: "white",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0f172a",
    marginBottom: 12,
  },
  clearRow: {
    backgroundColor: "#fff7ed",
    borderWidth: 1,
    borderColor: "#fed7aa",
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  clearTitle: {
    fontSize: 14,
    fontWeight: "900",
    color: "#9a3412",
  },
  clearSubtitle: {
    marginTop: 4,
    fontSize: 12,
    color: "#9a3412",
  },
  stateWrap: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  stateTitle: {
    fontSize: 15,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
  },
  stateText: {
    fontSize: 13,
    color: "#475569",
    textAlign: "center",
    marginTop: 10,
  },
  listContent: {
    paddingBottom: 24,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 14,
    borderRadius: 14,
    backgroundColor: "white",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    marginBottom: 10,
  },
  memberRowSelected: {
    borderColor: "#0f172a",
    backgroundColor: "#f8fafc",
  },
  memberMain: {
    flex: 1,
    paddingRight: 12,
  },
  memberName: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0f172a",
  },
  memberMeta: {
    marginTop: 4,
    fontSize: 12,
    color: "#475569",
  },
  memberCheck: {
    fontSize: 12,
    fontWeight: "900",
    color: "#1d4ed8",
  },
});