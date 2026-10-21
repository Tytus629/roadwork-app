# WayCrew DEV Smoke Runner Note (2026-05-10)

## What was added

- Added a DEV-only in-app screen: `Developer Smoke Tests` under More.
- Added grouped smoke checks with statuses: PASS, WARN, FAIL, NOT_RUN.
- Added controls: Run All, Copy Results, Reset.
- Added timestamp + overall run status.
- Added optional persisted two-device checklist (local AsyncStorage).
- Added a pure helper contract: `resolveMapPressTarget(input)`.
- Added focused unit tests for resolver behavior.
- Added contract diagnostics exports used by the smoke runner:
  - Auth layout contract
  - Org picker/join contract
  - More screen scroll contract
  - Create wizard modal scroll/height contract
  - Work order photo sync contract

## Why this approach

- Checks are non-destructive by design to avoid data mutation while still validating critical wiring.
- Contract metadata exports make validation stable and explicit, avoiding fragile runtime tree introspection.
- Grouped output + copyable summary improves field QA handoff to release notes/PR comments.
- Optional checklist supports manual two-device workflows without forcing extra state for everyone.

## Scope notes

- Asset-photo storage path contract is validated via `assetPhotoPath(...)` helper.
- Dedicated `addAssetPhoto` uploader export is now available via `workOrderPhotosService`, so asset photo uploader support can surface as PASS.
- Route visibility is DEV-gated so no production UX impact.

## Execution outcomes (2026-05-10)

- Ran `Run Photo Sync Smoke Test: Mobile Upload` from Settings -> Developer Tools.
- Observed local pipeline success in logs: local work order creation, upload completion, attachment creation, and sync request.
- Final verification step failed with backend callable error `NOT_FOUND`.

- Ran `Run Photo Sync Smoke Test: Backend Created` from Settings -> Developer Tools.
- UI alert displayed: `Photo Smoke Test Failed` with message `NOT_FOUND`.

- Map diagnostics on emulator showed map SDK initialization lines without auth-denied signatures:
  - `MapsInitializer: preferredRenderer: null`
  - `Google Android Maps SDK: Google Play services package version ...`
  - No `AuthorizationFailure` / `REQUEST_DENIED` found in focused log scan.

- Dev port normalization completed in scripts and diagnostics to keep Metro/app alignment on `8081`.

## Root cause follow-up (2026-05-10)

- `NOT_FOUND` on photo smoke debug callables was traced to emulator mode being effectively OFF unless a global runtime flag was manually set.
- In this state, debug callable names were routed through normal callable wiring and failed in the active target.
- Fix applied: DEV now defaults emulator mode to enabled unless explicitly disabled with
  `globalThis.__WAYCREW_ENABLE_FIREBASE_EMULATORS__ = false`.
- Added fast-fail guard for `roadwork_debug*` callable invocations when emulator mode is disabled, with actionable error text.
