import { formatPersonDisplayName } from "./userIdentity";

export type WorkOrderCreatorLike = {
  createdByName?: string | null;
  createdByDisplayName?: string | null;
  createdByFirstName?: string | null;
  createdByLastName?: string | null;
  createdByEmail?: string | null;
  createdByUid?: string | null;
};

function pickNamePart(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export function formatWorkOrderCreator(creator: WorkOrderCreatorLike | null | undefined): string {
  const explicitName = pickNamePart(creator?.createdByName);
  if (explicitName) return explicitName;

  const displayName = pickNamePart(creator?.createdByDisplayName);
  if (displayName) return displayName;

  const first = pickNamePart(creator?.createdByFirstName);
  const last = pickNamePart(creator?.createdByLastName);
  const fromParts = [first, last].filter(Boolean).join(" ").trim();
  if (fromParts) return fromParts;

  return formatPersonDisplayName(creator as Record<string, unknown> | null | undefined, {
    nameKeys: ["createdByName"],
    displayNameKeys: ["createdByDisplayName"],
    emailKeys: ["createdByEmail"],
    uidKeys: ["createdByUid"],
    unknownLabel: "Unknown",
  });
}
