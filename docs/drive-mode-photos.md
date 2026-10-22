# Drive Mode Phase 1 — geotagged photos

**Status:** IMPLEMENTED + LOCALLY TESTED (scheduler/pruning unit tests, tsc, lint). **NOT TESTED on device** (camera, heat, storage).

## Behaviour
- Optional, set before a drive: **Off / every N s (5, 10, 30) / every N m (25, 50, 100)**, plus **Photo at each bump** (default on). Saved in AsyncStorage.
- `PhotoScheduler` (pure): min 2 s between timed/distance shots (heat), bump shots may preempt down to 500 ms, no overlapping captures.
- Camera: `react-native-vision-camera` 4.7 (new dependency — the existing `react-native-image-picker` can't shoot without a tap). Back camera, ~1280×720 format, `photoQualityBalance="speed"`, no flash/shutter sound. A small live preview is shown while recording (required by the camera API).
- Each photo is stored in `DocumentDirectory/drive_photos/` and table `drive_photos` (migration 15, additive) with GPS, heading, speed, accuracy, reason, and bump `eventId`.
- Shown as thumbnails under "Recent drives" in Drive Mode, and in the bump popup on the Road Condition Map (tap a pin).
- **Work order:** tapping "Work order" on a bump attaches its photo(s) to the draft (`photos`), and marks them `workOrderLinked` so pruning never deletes them.

## Upload (app already uses Firebase Storage)
- Each photo with an org enqueues `UPLOAD_DRIVE_PHOTO` on the existing outbox (retries/backoff).
- File → `orgs/{orgId}/drivePhotos/{sessionId}/{photoId}.jpg` (already allowed by existing storage rules: org members, non-viewers, images < 25 MB).
- Metadata → Firestore `orgs/{orgId}/drivePhotos/{photoId}` (new rules in roadwork-backend `feature/sync-rules-locrefs-photos`).

## Storage cap (default 500 MB) — `planPrune`, oldest first
1. Photos already uploaded, and local-only (no org) timed/distance photos
2. Then not-yet-uploaded timed/distance photos
Never pruned: bump photos not yet uploaded, photos linked to a work order. Pruning removes only the local file; the row (and any cloud copy) stays. Runs when a drive stops.

## Privacy — Phase 2 plan (NOT built)
Road photos capture faces, licence plates, house numbers and private property.
- Phase 2: on-device face + plate detection (e.g. a small TFLite/CoreML detector) and Gaussian blur **before** a photo is saved or uploaded; store `blurred: true` (field already present, currently always `false`).
- Until then: photos are org-internal only (rules: org members read), not exported, and the UI warns crews not to share them.
- Retention policy (e.g. auto-delete un-linked photos after N days) and a public-records review with the county are recommended before wide rollout.
