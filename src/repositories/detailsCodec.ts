// src/repositories/detailsCodec.ts
//
// Centralized JSON encode/decode for the detailsJson column.
// Use these instead of raw JSON.parse/stringify everywhere.

import { safeJsonParse, safeJsonStringify } from "./repoUtils";

export function encodeDetails(details: Record<string, any> | null | undefined): string | null {
  if (!details) return null;
  return safeJsonStringify(details);
}

export function decodeDetails(detailsJson: string | null | undefined): Record<string, any> | null {
  if (!detailsJson) return null;
  return safeJsonParse<Record<string, any> | null>(detailsJson, null);
}
