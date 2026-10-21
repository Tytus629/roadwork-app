# Bridge Create Chooser Runtime Notes (2026-04-12)

## Scope

- Runtime blocker fix only for create chooser branch visibility.
- No create flow redesign.
- No bridge capture/save contract redesign.
- No bridge details display patch in this pass.

## What Was Observed

- Create modal opened at `Create • Choose Type` with work-order types only.
- Bridge and Delineator were not visible because Asset branch was not shown.
- Emulator logs showed org role resolved as `crew_member` during app startup.

## Root Cause

- `MapScreen` passes `canCreateAsset={canManageAssets}` into `CreateWizardModal`.
- `CreateWizardModal` only shows branch step (`Create • Choose Item`) when both
  `canCreateWorkOrder` and `canCreateAsset` are true.
- `crew_member` permissions had `manageAssets: false`, so asset branch was hidden.

## Smallest Safe Fix Applied

- File changed: `src/permissions/rolePermissions.ts`
- Change: `crew_member.manageAssets` from `false` to `true`.
- Result: `canCreateAsset` can now be true for crew member role, allowing branch chooser.

## Why This Is Safe

- Keeps existing modal/component architecture and state transitions.
- Uses existing permission gate already wired across map and asset create handlers.
- Does not alter bridge geometry payload structure or sync contracts.

## Follow-up Validation Targets

- Map `+` opens branch chooser with `Work Order` and `Asset`.
- Asset branch shows `Sign`, `Culvert`, `Guardrail`, `Delineator`, `Bridge`.
- Selecting `Bridge` enters 4-corner capture mode.

## Runtime Re-Validation (Same Session)

- Confirmed: `Create • Choose Item` now shows both `Work Order` and `Asset`.
- Confirmed: `Asset` type list includes `Sign`, `Culvert`, `Guardrail`, `Delineator`, `Bridge`.
- Confirmed: choosing `Bridge` reaches bridge guidance and `Pick Corners` action.
- Confirmed: corner capture reaches `Corner 4 of 4` and advances to `Create Asset` sheet.
- Confirmed: draft summary renders bridge geometry text in sheet:
  - `Bridge corners (4) • Center <lat>, <lng>`
- Open gap in this run: automated tap evidence has not yet confirmed successful transition from
  `Create Asset` sheet to `AssetDetail` after submit. One tap attempt also navigated to `More`
  tab due bottom-nav overlap while using coordinate-based ADB taps.

## Recommended Next QA Action

- Re-run only final submit transition with deterministic UI automation (element-based action if
  available) to confirm post-save navigation and persisted bridge detail reopen path.
