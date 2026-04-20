// src/repositories/repoUtils.ts
export type Tx = any; // use your SQLite tx type if you have one

export type DbNow = () => number; // epoch ms

export const nowEpochMs: DbNow = () => Date.now();

export function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return "null";
  }
}

// helpful for stable IDs when you want a client-generated id
export function makeClientId(prefix: string) {
  // simple, deterministic-ish; replace with uuid if you prefer later
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}
