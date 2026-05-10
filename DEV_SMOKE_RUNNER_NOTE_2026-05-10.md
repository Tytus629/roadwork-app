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
- Dedicated `addAssetPhoto` uploader export was not found, so that item is surfaced as WARN (not FAIL).
- Route visibility is DEV-gated so no production UX impact.
