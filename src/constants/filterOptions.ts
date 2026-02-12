import type { WorkStatus, Priority } from "../db/types";

export const STATUS_OPTIONS: WorkStatus[] = ["needs", "in_progress", "completed"];
export const PRIORITY_OPTIONS: Priority[] = ["low", "medium", "high", "urgent"];

export const SIGN_CATEGORY_OPTIONS = [
  "Regulatory",
  "Warning",
  "Guide",
  "Construction",
  "School",
  "Other",
] as const;

export const SIGN_CONDITION_OPTIONS = ["Good", "Faded", "Damaged", "Missing"] as const;
