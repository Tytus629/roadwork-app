export type WorkLogAction =
  | "created"
  | "status_changed"
  | "priority_changed"
  | "note_added"
  | "photo_added"
  | "sign_preset_applied"
  | "sign_inspection_completed"
  | "sign_details_updated"
  | "sign_linked"
  | "sign_created";

export type WorkLogEntry = {
  id: string;
  workItemId: string;
  action: WorkLogAction;
  at: number;
  message: string;

  // optional fields for later (userId, before/after, attachments)
  userId?: string;
};
