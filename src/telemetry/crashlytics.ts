// src/telemetry/crashlytics.ts
//
// Centralised Crashlytics helpers.
// Call initCrashlytics() once when uid + orgId are known.
// Call forceCrash() from DEV settings to smoke-test reporting.

import {
  crash,
  getCrashlytics,
  log,
  recordError,
  setAttribute,
  setAttributes,
  setCrashlyticsCollectionEnabled,
  setUserId,
} from "@react-native-firebase/crashlytics";

const crashlyticsInstance = getCrashlytics();

function normalizeKeyValue(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "";
  if (typeof value === "string") return value.slice(0, 120);

  try {
    return JSON.stringify(value).slice(0, 120);
  } catch {
    return String(value).slice(0, 120);
  }
}

function compactExtras(extras?: Record<string, unknown>): string {
  if (!extras) return "";
  const pairs = Object.entries(extras)
    .map(([k, v]) => `${k}=${normalizeKeyValue(v)}`)
    .filter((x) => x.length > 2);
  return pairs.join(" ").slice(0, 400);
}

/**
 * Enable collection and tag the session with user / org context.
 * Safe to call more than once (e.g. on org switch).
 */
export async function initCrashlytics(args: {
  uid?: string | null;
  orgId?: string | null;
}) {
  // Enable in production builds; in dev you can still enable for testing
  await setCrashlyticsCollectionEnabled(crashlyticsInstance, true);

  if (args.uid) {
    await setUserId(crashlyticsInstance, args.uid);
  }

  await setAttributes(crashlyticsInstance, {
    orgId: args.orgId ?? "",
    appEnv: __DEV__ ? "dev" : "prod",
  });
}

/**
 * Send a non-fatal Crashlytics test event so connectivity can be verified
 * without crashing the app.
 */
export async function sendCrashlyticsTestEvent(args?: {
  uid?: string | null;
  orgId?: string | null;
}) {
  const timestamp = new Date().toISOString();

  await setAttributes(crashlyticsInstance, {
    crashlyticsTest: "true",
    crashlyticsTestAt: timestamp,
    uid: args?.uid ?? "",
    orgId: args?.orgId ?? "",
    appEnv: __DEV__ ? "dev" : "prod",
  });

  log(crashlyticsInstance, `[CrashlyticsTest] Non-fatal test event at ${timestamp}`);
  recordError(crashlyticsInstance, new Error(`Crashlytics test event ${timestamp}`));

  return timestamp;
}

export function setCustomKeySafe(key: string, value: unknown) {
  const normalizedKey = String(key ?? "").trim();
  if (!normalizedKey) return;
  void setAttribute(crashlyticsInstance, normalizedKey.slice(0, 40), normalizeKeyValue(value));
}

export function logSyncBreadcrumb(message: string, extras?: Record<string, unknown>) {
  const msg = String(message ?? "").trim();
  if (!msg) return;
  const suffix = compactExtras(extras);
  log(crashlyticsInstance, suffix ? `[Sync] ${msg} ${suffix}` : `[Sync] ${msg}`);
}

export function recordErrorWithContext(
  error: unknown,
  context: { message: string; extras?: Record<string, unknown> },
) {
  const err = error instanceof Error ? error : new Error(String(error ?? "Unknown error"));
  if (context.extras) {
    for (const [k, v] of Object.entries(context.extras)) {
      setCustomKeySafe(k, v);
    }
  }
  logSyncBreadcrumb(context.message, context.extras);
  recordError(crashlyticsInstance, err);
}

/**
 * Trigger a native crash — only use from DEV tools.
 */
export function forceCrash() {
  crash(crashlyticsInstance);
}
