import {
  formatPersonDisplayName,
  normalizeEmail,
  trimToNull,
} from "./userIdentity";

export type WorkOrderAssignmentFields = {
  assignedToUid?: string | null;
  assignedToName?: string | null;
  assignedToEmail?: string | null;
};

export type AssignmentCandidate = {
  uid: string;
  email: string | null;
  displayName: string;
  role: string | null;
};

export function hasAssignedPerson(source: WorkOrderAssignmentFields | null | undefined): boolean {
  return Boolean(
    trimToNull(source?.assignedToUid) ||
      trimToNull(source?.assignedToName) ||
      normalizeEmail(source?.assignedToEmail),
  );
}

export function formatAssignedToDisplayName(
  source: WorkOrderAssignmentFields | null | undefined,
  options?: { unknownLabel?: string },
): string {
  return formatPersonDisplayName(source as Record<string, unknown> | null | undefined, {
    nameKeys: ["assignedToName"],
    displayNameKeys: ["assignedToName"],
    emailKeys: ["assignedToEmail"],
    uidKeys: ["assignedToUid"],
    unknownLabel: options?.unknownLabel ?? "Unassigned",
  });
}

export function assignmentSummaryLabel(
  source: WorkOrderAssignmentFields | null | undefined,
  options?: { unassignedLabel?: string },
): string {
  if (!hasAssignedPerson(source)) return options?.unassignedLabel ?? "Unassigned";
  return formatAssignedToDisplayName(source, { unknownLabel: options?.unassignedLabel ?? "Unassigned" });
}

export function toAssignmentPatch(candidate: AssignmentCandidate | null): WorkOrderAssignmentFields {
  if (!candidate) {
    return {
      assignedToUid: null,
      assignedToName: null,
      assignedToEmail: null,
    };
  }

  return {
    assignedToUid: trimToNull(candidate.uid),
    assignedToName: trimToNull(candidate.displayName),
    assignedToEmail: normalizeEmail(candidate.email),
  };
}