import {
  analyzeNoteMentions,
  buildMentionSuggestions,
  resolveMentionsInText,
} from "../src/utils/mentions";
import type { AssignmentCandidate } from "../src/utils/workOrderAssignment";

const members: AssignmentCandidate[] = [
  {
    uid: "uid-jane",
    email: "jane@example.com",
    displayName: "Jane Doe",
    role: "crew_member",
  },
  {
    uid: "uid-john-1",
    email: "john.one@example.com",
    displayName: "John Smith",
    role: "crew_member",
  },
  {
    uid: "uid-john-2",
    email: "john.two@example.com",
    displayName: "John Smith",
    role: "crew_member",
  },
];

describe("mentions", () => {
  it("resolves unique display-name mentions", () => {
    const resolved = resolveMentionsInText({
      text: "Please check this with @Jane Doe before noon.",
      members,
    });

    expect(resolved).toHaveLength(1);
    expect(resolved[0]?.uid).toBe("uid-jane");
    expect(resolved[0]?.displayName).toBe("Jane Doe");
  });

  it("falls back to email tokens for duplicate display names", () => {
    const suggestions = buildMentionSuggestions(members);
    const johnOne = suggestions.find((item) => item.uid === "uid-john-1");
    expect(johnOne?.mentionTrigger).toBe("@john.one@example.com");
  });

  it("only reports newly added mention recipients", () => {
    const analysis = analyzeNoteMentions({
      previousText: "Please sync with @Jane Doe.",
      nextText: "Please sync with @Jane Doe and @john.two@example.com.",
      members,
    });

    expect(analysis.newMentions).toHaveLength(1);
    expect(analysis.newMentions[0]?.uid).toBe("uid-john-2");
  });
});