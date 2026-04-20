export type IdentityLike = {
  uid?: string | null;
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  displayName?: string | null;
};

export type PersonDisplaySource = Record<string, unknown> | null | undefined;

type PersonDisplayOptions = {
  nameKeys?: string[];
  displayNameKeys?: string[];
  emailKeys?: string[];
  uidKeys?: string[];
  unknownLabel?: string;
};

export type CreatorIdentitySnapshot = {
  uid: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  displayName: string;
};

export function trimToNull(value: string | null | undefined): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed.length ? trimmed : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const trimmed = trimToNull(email);
  return trimmed ? trimmed.toLowerCase() : null;
}

export function buildDisplayName(firstName?: string | null, lastName?: string | null): string | null {
  const first = trimToNull(firstName);
  const last = trimToNull(lastName);
  const combined = [first, last].filter(Boolean).join(" ").trim();
  return combined.length ? combined : null;
}

export function resolveIdentityDisplayName(identity: IdentityLike): string {
  const explicit = trimToNull(identity.displayName);
  if (explicit) return explicit;

  const fromParts = buildDisplayName(identity.firstName, identity.lastName);
  if (fromParts) return fromParts;

  const email = normalizeEmail(identity.email);
  if (email) return email;

  const uid = trimToNull(identity.uid);
  return uid ?? "unknown";
}

export function toCreatorIdentitySnapshot(identity: IdentityLike): CreatorIdentitySnapshot {
  const uid = trimToNull(identity.uid) ?? "unknown";
  const email = normalizeEmail(identity.email);
  const firstName = trimToNull(identity.firstName);
  const lastName = trimToNull(identity.lastName);
  const displayName = resolveIdentityDisplayName({
    displayName: identity.displayName,
    firstName,
    lastName,
    email,
    uid,
  });

  return {
    uid,
    email,
    firstName,
    lastName,
    displayName,
  };
}

function firstNonBlank(source: PersonDisplaySource, keys: string[]): string | null {
  if (!source) return null;
  for (const key of keys) {
    const value = trimToNull(String((source as Record<string, unknown>)[key] ?? ""));
    if (value) return value;
  }
  return null;
}

export function formatPersonDisplayName(
  source: PersonDisplaySource,
  options: PersonDisplayOptions = {},
): string {
  const name = firstNonBlank(source, options.nameKeys ?? [
    "name",
    "createdByName",
    "updatedByName",
    "actorName",
    "inspectedByName",
    "doneByName",
    "completedByName",
  ]);
  if (name) return name;

  const legacyDisplay = firstNonBlank(source, options.displayNameKeys ?? [
    "displayName",
    "createdByDisplayName",
    "updatedByDisplayName",
    "actorDisplayName",
    "inspectedByDisplayName",
    "byDisplayName",
    "doneByDisplayName",
    "completedByDisplayName",
  ]);
  if (legacyDisplay) return legacyDisplay;

  const email = firstNonBlank(source, options.emailKeys ?? [
    "email",
    "createdByEmail",
    "updatedByEmail",
    "actorEmail",
    "inspectedByEmail",
    "byEmail",
    "doneByEmail",
    "completedByEmail",
  ]);
  if (email) return email;

  const uid = firstNonBlank(source, options.uidKeys ?? [
    "uid",
    "createdByUid",
    "updatedByUid",
    "actorUid",
    "inspectedByUid",
    "byUid",
    "doneByUid",
    "completedByUid",
  ]);
  if (uid) return uid;

  return options.unknownLabel ?? "Unknown";
}
