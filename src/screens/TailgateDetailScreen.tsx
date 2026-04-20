// src/screens/TailgateDetailScreen.tsx
//
// Read-only view of a saved tailgate safety log.

import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet } from "react-native";
import { useOrg } from "../state/OrgContext";
import { tailgateRepo, TailgateLog } from "../repositories/tailgateRepo";
import { formatPersonDisplayName } from "../utils/userIdentity";

function chips(items: string[] | null | undefined): string {
  return (items ?? []).join(", ") || "—";
}

export default function TailgateDetailScreen({ route }: any) {
  const { id } = route.params;
  const { orgId } = useOrg();
  const [log, setLog] = useState<TailgateLog | null>(null);

  useEffect(() => {
    if (!orgId) return;
    (async () => {
      const row = await tailgateRepo.getById({ orgId, id });
      setLog(row);
    })();
  }, [orgId, id]);

  if (!log) {
    return (
      <View style={styles.loading}>
        <Text>Loading…</Text>
      </View>
    );
  }

  const creatorLabel = formatPersonDisplayName(log as Record<string, unknown> | null | undefined, {
    nameKeys: ["createdByName"],
    displayNameKeys: ["createdByDisplayName"],
    emailKeys: ["createdByEmail"],
    uidKeys: ["createdByUid"],
    unknownLabel: "Unknown",
  });

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{log.dateKey}</Text>

      <Text style={styles.meta}>Created by {creatorLabel}</Text>

      <Section title="Work Types" value={chips(log.workTypes)} />
      <Section title="Hazards Discussed" value={chips(log.hazards)} />
      <Section title="PPE" value={chips(log.ppe)} />
      <Section title="Traffic Control" value={chips(log.trafficControl)} />

      <Section title="Supervisor" value={log.supervisorName ?? "—"} />
      <Section title="Notes" value={log.notes ?? "—"} />

      <View style={styles.sectionBlock}>
        <Text style={styles.sectionLabel}>Signed By</Text>
        {(log.signedBy ?? []).length === 0 ? (
          <Text style={styles.sectionValue}>—</Text>
        ) : (
          (log.signedBy ?? []).map((s, i) => (
            <Text key={i} style={styles.sectionValue}>
              {formatPersonDisplayName(s as Record<string, unknown> | null | undefined, {
                nameKeys: ["name", "signedByName", "createdByName", "byName"],
                displayNameKeys: ["displayName", "signedByDisplayName", "createdByDisplayName", "byDisplayName"],
                emailKeys: ["email", "signedByEmail", "createdByEmail", "byEmail"],
                uidKeys: ["uid", "signedByUid", "createdByUid", "byUid"],
                unknownLabel: "Unknown",
              })} — {new Date(s.at).toLocaleString()}
            </Text>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

function Section({ title, value }: { title: string; value: string }) {
  return (
    <View style={styles.sectionBlock}>
      <Text style={styles.sectionLabel}>{title}</Text>
      <Text style={styles.sectionValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: "#fff" },
  loading: { flex: 1, justifyContent: "center", alignItems: "center" },
  title: { fontSize: 24, fontWeight: "bold", color: "#111827", marginBottom: 4 },
  meta: { fontSize: 13, color: "#64748b", marginBottom: 16 },
  sectionBlock: {
    marginTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f1f5f9",
  },
  sectionLabel: { fontSize: 14, fontWeight: "700", color: "#64748b", marginBottom: 4 },
  sectionValue: { fontSize: 15, color: "#111827" },
});
