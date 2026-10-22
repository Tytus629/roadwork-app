# Drive Mode — road roughness logger (Phase 0, no AI)

**Status:** IMPLEMENTED + LOCALLY TESTED (unit tests, type-check, lint). **NOT TESTED on a device.**

## What it does
- Tools → **Drive Mode**: start/stop a drive. Samples accelerometer + gyroscope at a requested 100 Hz
  (`react-native-sensors`) and GPS ~1 Hz (`@react-native-community/geolocation`).
- Gravity removed with a low-pass estimate; the remaining acceleration is projected onto the gravity
  axis (vertical), so phone rotation in the mount doesn't matter.
- Every ~100 m travelled a segment is closed: `roughnessIndex = RMS(vertical) × (13.4 m/s ÷ meanSpeed)`.
  Samples under 10 mph are not scored. Classes: smooth < 0.6, fair < 1.2, rough < 2.0, very rough ≥ 2.0.
- Spikes with |vertical| ≥ 4 m/s² (~0.4 g) become events (bump / pothole ≥ 6 / severe ≥ 10), 1 s refractory, with GPS.
- Warnings: outside 20–45 mph band, no GPS, phone not mounted (gyro RMS > 0.6 rad/s or gravity tilt > 20° in 2 s; scoring pauses).
- Map tab: **Roughness** toggle shows last 90 days. Tools → **Road Condition Map**: heat map + markers, date-range and drive filters, legend.
- Bump → work order: tap a pin's label (Road Condition Map) or "Work order" in Drive Mode → Map opens the
  normal create sheet as a `pothole` draft at that point with a note. Nothing is saved until the user saves.

## This is NOT IRI / PCI / CRAB
The index is an **uncalibrated estimate** for screening. It depends on vehicle, tires, mount and speed. Thresholds are
starting guesses and must be tuned on real drives against roads with known ratings (Phase 3 calibration).

## Storage (additive)
Migration 13 adds `drive_sessions`, `drive_segments`, `drive_events` (+ indexes) with `CREATE TABLE IF NOT EXISTS`.
No existing table is altered. Data is local only; nothing syncs yet.

## Future backend sync (designed, NOT built, NOT deployed)
There is no web admin dashboard today (roadwork-backend `public/` is the Firebase placeholder), so the dashboard is in-app.
For a shared/web dashboard later:
- Firestore: `orgs/{orgId}/driveSessions/{id}`, `orgs/{orgId}/driveSegments/{id}`, `orgs/{orgId}/driveEvents/{id}` (new, additive).
- Rules: org members read; create by members with `createdByUid == request.auth.uid`; no update/delete except managers.
- App: new outbox job types following `enqueue*Upsert.ts`.
- Deploy steps (need approval): `firebase deploy --only firestore:rules,firestore:indexes`, then app release.

## Known gaps / on-device to verify
- Screen-off/background: recording stops if the app is backgrounded; keep the screen on and use car power.
- `react-native-sensors` 7.3.6 is an older bridge module; verify it autolinks on RN 0.83 (new arch interop) — Android + iOS.
- Actual delivered sensor rate is shown on screen ("Sensor rate: N Hz").
