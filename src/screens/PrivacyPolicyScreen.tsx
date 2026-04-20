import React from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

const EFFECTIVE_DATE = "March 8, 2026";
const SUPPORT_EMAIL = "support.waycrew.app@gmail.com";

type PolicySection = {
  title: string;
  body: string[];
};

const SECTIONS: PolicySection[] = [
  {
    title: "Overview",
    body: [
      "WayCrew is a road maintenance and asset tracking application used by road crews and authorized organizations.",
      "This Privacy Policy explains how WayCrew accesses, collects, uses, and protects information when you use the app.",
    ],
  },
  {
    title: "Information We Collect",
    body: [
      "Photos captured by users for work orders, inspections, and asset records.",
      "GPS or location information when creating, updating, or viewing work orders and assets on the map.",
      "User account information such as name, email address, and login credentials.",
      "Organization-related data associated with work orders, inspections, and assets.",
      "Technical and diagnostic information needed to operate, secure, and improve the app.",
    ],
  },
  {
    title: "How We Use Information",
    body: [
      "Create, manage, and update work orders.",
      "Track road maintenance assets such as signs, guardrails, culverts, and related infrastructure.",
      "Display map locations for work tasks and assets.",
      "Synchronize data between authorized users within an organization.",
      "Maintain app security, troubleshoot issues, and support core app functionality.",
    ],
  },
  {
    title: "Camera Permission",
    body: [
      "WayCrew uses camera permission to allow users to take photos of road issues, signs, guardrails, culverts, and other assets as part of work orders, inspections, and maintenance records.",
    ],
  },
  {
    title: "Location Permission",
    body: [
      "WayCrew uses location permission to place, update, and display work orders and assets on the map and to help users identify the correct work location.",
    ],
  },
  {
    title: "Data Sharing",
    body: [
      "WayCrew does not sell personal information.",
      "WayCrew may use trusted service providers to help operate the app, such as cloud hosting, authentication, storage, crash reporting, analytics, and mapping services.",
      "Information is used only as needed to provide and support app functionality.",
    ],
  },
  {
    title: "Data Security",
    body: [
      "WayCrew uses reasonable administrative, technical, and organizational safeguards to protect information during storage and transmission.",
      "However, no method of transmission or storage is completely secure.",
    ],
  },
  {
    title: "Data Retention",
    body: [
      "WayCrew retains information only as long as reasonably necessary to provide app functionality, maintain organizational records, meet legal obligations, resolve disputes, and enforce agreements.",
    ],
  },
  {
    title: "Data Deletion",
    body: [
      "Users may request deletion of their account or associated data by contacting support.waycrew.app@gmail.com.",
      "If your organization manages your account, some records may also be retained as required for operational, legal, or administrative purposes.",
    ],
  },
  {
    title: "Children's Privacy",
    body: [
      "WayCrew is not directed to children under 13, and we do not knowingly collect personal information from children under 13.",
    ],
  },
  {
    title: "Changes to This Privacy Policy",
    body: [
      "We may update this Privacy Policy from time to time. Any changes will be posted on this page with an updated effective date.",
    ],
  },
  {
    title: "Contact",
    body: [
      "If you have questions about this Privacy Policy or want to request account or data deletion, contact support.waycrew.app@gmail.com.",
    ],
  },
];

export default function PrivacyPolicyScreen() {
  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>WayCrew Privacy Policy</Text>
      <Text style={styles.date}>Effective Date: {EFFECTIVE_DATE}</Text>

      {SECTIONS.map((section) => (
        <View key={section.title} style={styles.section}>
          <Text style={styles.sectionTitle}>{section.title}</Text>
          {section.body.map((line) => (
            <Text key={line} style={styles.paragraph}>
              {line}
            </Text>
          ))}
        </View>
      ))}

      <View style={styles.contactBox}>
        <Text style={styles.contactTitle}>Support Email</Text>
        <Text style={styles.contactValue}>{SUPPORT_EMAIL}</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
  },
  content: {
    padding: 16,
    paddingBottom: 28,
  },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#0f172a",
    marginBottom: 6,
  },
  date: {
    fontSize: 14,
    color: "#475569",
    marginBottom: 16,
  },
  section: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#e2e8f0",
    borderRadius: 12,
    padding: 14,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0f172a",
    marginBottom: 8,
  },
  paragraph: {
    fontSize: 14,
    lineHeight: 20,
    color: "#334155",
    marginBottom: 8,
  },
  contactBox: {
    marginTop: 4,
    backgroundColor: "#eff6ff",
    borderColor: "#bfdbfe",
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
  },
  contactTitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#1d4ed8",
    textTransform: "uppercase",
    marginBottom: 4,
  },
  contactValue: {
    fontSize: 14,
    fontWeight: "700",
    color: "#1e3a8a",
  },
});
