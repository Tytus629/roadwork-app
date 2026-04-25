import type { AssignmentCandidate } from "./workOrderAssignment";
import { normalizeEmail, trimToNull } from "./userIdentity";

export type MentionSuggestion = AssignmentCandidate & {
  mentionToken: string;
  mentionTrigger: string;
  mentionMode: "display_name" | "email" | "uid";
  secondaryLabel: string | null;
  searchText: string;
};

export type ResolvedMention = {
  uid: string;
  email: string | null;
  displayName: string;
  mentionToken: string;
  rawText: string;
  start: number;
  end: number;
  key: string;
};

export type MentionQueryMatch = {
  start: number;
  end: number;
  query: string;
};

function normalizeWhitespace(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function toSearchValue(value: string | null | undefined): string {
  return normalizeWhitespace(value).toLowerCase();
}

function boundaryBefore(text: string, index: number): boolean {
  if (index <= 0) return true;
  return !/[A-Za-z0-9_]/.test(text[index - 1] ?? "");
}

function boundaryAfter(text: string, index: number): boolean {
  if (index >= text.length) return true;
  return !/[A-Za-z0-9_]/.test(text[index] ?? "");
}

function uniqueSuggestions(rows: MentionSuggestion[]): MentionSuggestion[] {
  const seen = new Set<string>();
  const out: MentionSuggestion[] = [];
  for (const row of rows) {
    const key = `${row.uid}::${row.mentionTrigger.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

export function buildMentionSuggestions(members: AssignmentCandidate[]): MentionSuggestion[] {
  const displayNameCounts = new Map<string, number>();

  for (const member of members) {
    const displayNameKey = toSearchValue(member.displayName);
    if (!displayNameKey) continue;
    displayNameCounts.set(displayNameKey, (displayNameCounts.get(displayNameKey) ?? 0) + 1);
  }

  const suggestions = members
    .map((member): MentionSuggestion | null => {
      const uid = trimToNull(member.uid);
      if (!uid) return null;

      const displayName = normalizeWhitespace(member.displayName) || uid;
      const email = normalizeEmail(member.email);
      const displayNameKey = toSearchValue(displayName);
      const displayNameUnique = displayNameKey
        ? (displayNameCounts.get(displayNameKey) ?? 0) === 1
        : false;

      let mentionToken = displayName;
      let mentionMode: MentionSuggestion["mentionMode"] = "display_name";

      if (!displayNameUnique) {
        if (email) {
          mentionToken = email;
          mentionMode = "email";
        } else {
          mentionToken = uid;
          mentionMode = "uid";
        }
      }

      const secondaryLabel =
        mentionMode === "display_name"
          ? email
          : displayName !== mentionToken
            ? displayName
            : email;

      return {
        ...member,
        uid,
        email,
        displayName,
        mentionToken,
        mentionTrigger: `@${mentionToken}`,
        mentionMode,
        secondaryLabel: trimToNull(secondaryLabel),
        searchText: [displayName, email ?? "", mentionToken, member.role ?? ""]
          .map(toSearchValue)
          .filter(Boolean)
          .join(" "),
      };
    })
    .filter((row): row is MentionSuggestion => !!row)
    .sort((left, right) => {
      const byName = left.displayName.localeCompare(right.displayName, undefined, { sensitivity: "base" });
      if (byName !== 0) return byName;
      return left.uid.localeCompare(right.uid, undefined, { sensitivity: "base" });
    });

  return uniqueSuggestions(suggestions);
}

export function getMentionSuggestions(args: {
  members: MentionSuggestion[];
  query: string;
  limit?: number;
}): MentionSuggestion[] {
  const needle = toSearchValue(args.query);
  const limit = Math.max(1, Number(args.limit ?? 5));
  if (!needle) return args.members.slice(0, limit);

  return args.members
    .filter((member) => {
      const displayName = toSearchValue(member.displayName);
      const email = toSearchValue(member.email);
      const token = toSearchValue(member.mentionToken);
      return (
        displayName.startsWith(needle) ||
        email.startsWith(needle) ||
        token.startsWith(needle) ||
        member.searchText.includes(needle)
      );
    })
    .slice(0, limit);
}

export function getActiveMentionQuery(args: {
  text: string;
  cursor: number;
}): MentionQueryMatch | null {
  const text = String(args.text ?? "");
  const cursor = Math.max(0, Math.min(text.length, Number(args.cursor ?? 0)));
  let atIndex = text.lastIndexOf("@", Math.max(0, cursor - 1));

  while (atIndex >= 0) {
    if (boundaryBefore(text, atIndex)) {
      const query = text.slice(atIndex + 1, cursor);
      if (!query.length) {
        return { start: atIndex, end: cursor, query: "" };
      }
      if (query.length > 80) return null;
      if (/^[\s]/.test(query)) return null;
      if (/[\n\r]/.test(query)) return null;
      if (/[.,!?;:()[\]{}]/.test(query)) return null;
      return { start: atIndex, end: cursor, query };
    }
    atIndex = text.lastIndexOf("@", atIndex - 1);
  }

  return null;
}

export function applyMentionSuggestion(args: {
  text: string;
  range: MentionQueryMatch;
  suggestion: MentionSuggestion;
}): { text: string; cursor: number } {
  const replacement = `${args.suggestion.mentionTrigger} `;
  const nextText =
    args.text.slice(0, args.range.start) +
    replacement +
    args.text.slice(args.range.end);

  return {
    text: nextText,
    cursor: args.range.start + replacement.length,
  };
}

export function resolveMentionsInText(args: {
  text: string | null | undefined;
  members: AssignmentCandidate[];
}): ResolvedMention[] {
  const text = String(args.text ?? "");
  if (!text.trim()) return [];

  const suggestions = buildMentionSuggestions(args.members).sort(
    (left, right) => right.mentionTrigger.length - left.mentionTrigger.length,
  );
  const lowercaseText = text.toLowerCase();
  const resolved: ResolvedMention[] = [];

  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== "@") continue;
    if (!boundaryBefore(text, index)) continue;

    const match = suggestions.find((candidate) => {
      const trigger = candidate.mentionTrigger.toLowerCase();
      if (lowercaseText.slice(index, index + trigger.length) !== trigger) return false;
      return boundaryAfter(text, index + trigger.length);
    });

    if (!match) continue;

    const start = index;
    const end = index + match.mentionTrigger.length;
    resolved.push({
      uid: match.uid,
      email: normalizeEmail(match.email),
      displayName: match.displayName,
      mentionToken: match.mentionToken,
      rawText: text.slice(start, end),
      start,
      end,
      key: match.uid || normalizeEmail(match.email) || match.mentionTrigger.toLowerCase(),
    });

    index = end - 1;
  }

  return resolved;
}

export function uniqueMentionRecipients(mentions: ResolvedMention[]): ResolvedMention[] {
  const seen = new Set<string>();
  const out: ResolvedMention[] = [];
  for (const mention of mentions) {
    if (seen.has(mention.key)) continue;
    seen.add(mention.key);
    out.push(mention);
  }
  return out;
}

export function buildNoteExcerpt(text: string | null | undefined, limit = 140): string | null {
  const collapsed = normalizeWhitespace(text);
  if (!collapsed) return null;
  if (collapsed.length <= limit) return collapsed;
  return `${collapsed.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export function summarizeMentionTargets(mentions: Array<Pick<ResolvedMention, "displayName">>): string {
  const labels = mentions
    .map((mention) => normalizeWhitespace(mention.displayName))
    .filter(Boolean);

  if (!labels.length) return "a teammate";
  if (labels.length === 1) return labels[0];
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels[0]} and ${labels.length - 1} others`;
}

export function analyzeNoteMentions(args: {
  previousText?: string | null;
  nextText?: string | null;
  members: AssignmentCandidate[];
}) {
  const previousMentions = uniqueMentionRecipients(
    resolveMentionsInText({ text: args.previousText, members: args.members }),
  );
  const nextMentions = uniqueMentionRecipients(
    resolveMentionsInText({ text: args.nextText, members: args.members }),
  );

  const previousKeys = new Set(previousMentions.map((mention) => mention.key));
  const nextKeys = new Set(nextMentions.map((mention) => mention.key));

  return {
    previousMentions,
    nextMentions,
    newMentions: nextMentions.filter((mention) => !previousKeys.has(mention.key)),
    removedMentions: previousMentions.filter((mention) => !nextKeys.has(mention.key)),
    noteExcerpt: buildNoteExcerpt(args.nextText),
  };
}