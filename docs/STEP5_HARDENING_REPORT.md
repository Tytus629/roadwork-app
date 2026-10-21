# STEP 5 — End-to-End Smoke Test & Production Hardening Report

## Build Status

| Check | Result |
| ----- | ------ |
| TypeScript (`tsc --noEmit`) | ✅ Clean — 0 errors |
| ESLint unused-vars / imports | ✅ Fixed — 0 remaining |
| ESLint exhaustive-deps | ⚠️ 16 warnings — pre-existing, intentional dep arrays (safe to leave) |
| ESLint inline-style warnings | ⚠️ ~100 warnings — cosmetic only |
| Jest tests | ❌ 1 suite fails — pre-existing native module mock issue (`react-native-gesture-handler` TurboModule) |

---

## Files Changed (This Step)

| File | Change |
| ---- | ------ |
| `src/components/CreateWizardModal.tsx` | Remove unused `formatWorkType` import; prefix unused `geometryMode` |
| `src/firebase/emulators.ts` | Empty catch block instead of unused catch param |
| `src/hooks/useLogs.ts` | Remove unused `getDbTick` import |
| `src/screens/MapScreen.tsx` | Remove unused imports (`MapLatLng`, `WorkOrderRow`, `LatLng`); prefix `_focusedId`; remove dead `initialRegion` const |
| `src/state/OrgContext.tsx` | Remove unused `stopSyncScheduler` import |
| `src/state/SignsContext.tsx` | eslint-disable for destructured-rest pattern in `deleteSign` |
| `src/tools/asphalt/asphaltCalc.ts` | Remove unused `AsphaltMix` type import |

---

## Audit Results

### 1. Emulator Guards — ✅ PASS

- `src/firebase/emulators.ts` line 22: `if (!__DEV__) return` guards all emulator connections
- `EMU_HOST = "localhost"` in `outboxSync.ts` and `orgJoin.ts` both wrapped in `if (__DEV__)` conditionals
- No emulator traffic possible in production builds

### 2. DEV-Only Code — ✅ PASS

- All DEV UI sections (`MapScreen`, `SettingsScreen`, `OrgPickerScreen`) gated by `{__DEV__ && (...)}`
- `forceCrash()` button inside `__DEV__` block
- Startup DB wipe triple-guarded: `__DEV__` + `devFlags.enableStartupWipe` + `globalThis.__ROADWORK_CLEAR_LOCAL_DB_ON_START__`
- `DevFlagStore.load()` returns safe defaults in production (`!__DEV__` early return)
- `isForceOffline()` short-circuits to `false` in production

### 3. Sync / Outbox Safety — ✅ PASS (with note)

- **Transaction safety**: Local write + outbox enqueue is atomic (`BEGIN`/`COMMIT`/`ROLLBACK`)
- **Error handling**: Exponential backoff (1.5s → 60s max with jitter), max 10 retries per row
- **Outbox cleanup**: Rows deleted only after successful Cloud Function ack
- **Auth fail-fast**: 403/permission-denied breaks sync loop immediately
- ⚠️ **Note**: No explicit client-side idempotency key. If Cloud Function succeeds but local DB commit fails, the same payload can re-send. Relies on backend `UPSERT` semantics for safety. Low probability, acceptable for current stage.

### 4. Org Scoping — ✅ PASS (with note)

- All `work_orders` queries include `WHERE orgId = ?`
- All `offline_work_orders` queries include orgId filtering
- Outbox also scoped by orgId
- `sign_details` table has no `orgId` column, but always accessed via `workOrderId` FK, which itself is org-scoped. Cross-org leakage requires guessing a UUID — no practical risk.
- ⚠️ **Note for future**: If `sign_details` queries are ever exposed outside the work-order context, add an orgId column via migration.

### 5. Data Flow Integrity — ✅ PASS

- `encodeDetails()`: Returns `null` for null/undefined; catches JSON serialization errors
- `decodeDetails()`: Returns `null` for null/undefined; catches parse errors with fallback
- Full path verified: UI → `patchAndEnqueue()` → `encodeDetails()` → SQLite `detailsJson` TEXT → outbox `payloadJson` → Cloud Function

### 6. Dev Flags — ✅ PASS

- `DevFlagStore` always returns defaults in prod (`enableStartupWipe: false`, `enableOutboxClearOnStart: false`)
- `devNetwork.ts` `isForceOffline()` short-circuits to `false` in production
- No dev flags can accidentally affect production behavior

### 7. Release Config — ⚠️ INCOMPLETE (expected at this stage)

- `android/app/build.gradle`: Release build uses **debug keystore** (line 106: `signingConfig signingConfigs.debug`)
- ProGuard disabled for release builds (`enableProguardInReleaseBuilds = false`)
- `versionCode 1` / `versionName "1.0"` — need bumping before release
- Crashlytics plugin applied ✅, collection enabled ✅, user/org attributes set ✅

---

## Flagged for Attention (Not Fixed — Requires Decision)

### A. `roadwork_devBootstrapOrg` called on every login

**File**: `src/screens/AuthScreen.tsx` lines 26, 35
**Issue**: `bootstrapDevOrg()` is called after every sign-in AND account creation — even in production. The Cloud Function name includes "dev" but the else branch calls it via Firebase SDK in prod.
**Risk**: If this function doesn't exist in production Firebase, all logins fail. If it does exist, it's running "bootstrap" logic on every single login.
**Action needed**: Verify this function is deployed to production, or refactor auth flow to separate first-time org setup from regular login.

### B. Jest test environment

**File**: `__tests__/App.test.tsx`
**Issue**: Test suite fails because `react-native-gesture-handler` TurboModule isn't mocked. Pre-existing.
**Action needed**: Add `jest.setup.js` with gesture handler mock, or convert to E2E tests.

---

## Manual Smoke Test Checklist

Before release build, manually verify:

- [ ] **Auth flow**: Sign in → org bootstrap → lands on map
- [ ] **Create work order**: Tap "+" → select type → GPS fix → fill form → save
- [ ] **Sign details**: Create sign WO → pick preset → fill fields → save → reopen to verify persistence
- [ ] **Guardrail details**: Create guardrail WO → fill parts inventory → save → verify
- [ ] **Offline resilience**: Airplane mode → create WO → reconnect → confirm sync drains
- [ ] **Sync indicator**: Check `SyncStatusBanner` shows pending count, drains to 0
- [ ] **Map markers**: Work orders appear as markers → tap → sheet opens with correct data
- [ ] **Filter**: Open filter sheet → filter by type/status → map updates
- [ ] **Export CSV**: Settings → Export → verify file downloads
- [ ] **Org switch**: Settings → Change Org → verify data changes
- [ ] **Crashlytics**: (DEV only) Force crash → verify appears in Firebase console
- [ ] **Sign inspection**: Open sign WO → fill inspection form → save
- [ ] **No cross-org data**: Log in as different user in different org → verify no data leakage
