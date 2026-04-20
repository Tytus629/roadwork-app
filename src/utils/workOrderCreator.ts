import { formatPersonDisplayName } from "./userIdentity";

export type WorkOrderCreatorLike = {
  createdByName?: string | null;
  createdByDisplayName?: string | null;
  createdByFirstName?: string | null;
  createdByLastName?: string | null;
  createdByEmail?: string | null;
  createdByUid?: string | null;
};

export function formatWorkOrderCreator(creator: WorkOrderCreatorLike | null | undefined): string {
  return formatPersonDisplayName(creator as Record<string, unknown> | null | undefined, {
    nameKeys: ["createdByName"],
    displayNameKeys: ["createdByDisplayName"],
    emailKeys: ["createdByEmail"],
    uidKeys: ["createdByUid"],
    unknownLabel: "Unknown",
  });
}
