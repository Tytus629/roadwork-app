import type { WorkOrder } from "../types/WorkOrder";
import type { AssignmentCandidate } from "../utils/workOrderAssignment";
import { analyzeNoteMentions, summarizeMentionTargets } from "../utils/mentions";
import { normalizeEmail, trimToNull } from "../utils/userIdentity";
import { addLogEntry } from "./logService";

type NoteActivityActor = {
  uid?: string | null;
  email?: string | null;
  displayName?: string | null;
};

function noteStateLabel(note: string | null | undefined): "present" | "cleared" {
  return trimToNull(note) ? "present" : "cleared";
}

export function addWorkOrderNoteActivity(args: {
  workOrder: WorkOrder;
  previousNote?: string | null;
  nextNote?: string | null;
  members: AssignmentCandidate[];
  actor?: NoteActivityActor;
}) {
  const previousNote = args.previousNote ?? null;
  const nextNote = args.nextNote ?? null;
  if ((previousNote ?? null) === (nextNote ?? null)) return;

  const analysis = analyzeNoteMentions({
    previousText: previousNote,
    nextText: nextNote,
    members: args.members,
  });

  const actorUid = trimToNull(args.actor?.uid);
  const actorEmail = normalizeEmail(args.actor?.email);
  const actorDisplayName = trimToNull(args.actor?.displayName);
  const basePayload = {
    actorUid,
    actorEmail,
    actorDisplayName,
    actorName: actorDisplayName,
    targetType: "work_order",
    workOrderType: args.workOrder.type,
    noteExcerpt: analysis.noteExcerpt,
    noteState: noteStateLabel(nextNote),
  };

  if (analysis.newMentions.length > 0) {
    addLogEntry({
      workOrderId: args.workOrder.id,
      orgId: args.workOrder.orgId,
      event: "mention",
      message: `Mentioned ${summarizeMentionTargets(analysis.newMentions)} in a note`,
      payload: {
        ...basePayload,
        mentionCount: analysis.newMentions.length,
        mentions: analysis.newMentions.map((mention) => ({
          uid: mention.uid,
          email: mention.email,
          displayName: mention.displayName,
          mentionToken: mention.mentionToken,
        })),
      },
    });
    return;
  }

  addLogEntry({
    workOrderId: args.workOrder.id,
    orgId: args.workOrder.orgId,
    event: "note_updated",
    message: nextNote ? "Updated note" : "Cleared note",
    payload: basePayload,
  });
}