# DEV Two-Client Android Sync Smoke Test

This runbook verifies one Metro server + one Firebase Emulator Suite with two Android clients at once:
- USB physical phone
- Android emulator

It is designed for local DEV only.

## Prerequisites

- Firebase emulators are already running on the host machine.
- Mobile repo is RoadWorkTracker.
- USB debugging is enabled on the phone and authorized.
- Metro port convention is 2468.

Expected emulator ports:
- Emulator UI: 4000
- Functions: 5001
- Firestore: 8080
- Auth: 9099
- Storage: 9199

## Device Network Strategy

- USB Android phone uses adb reverse and connects to 127.0.0.1 inside the app.
- Android emulator connects to 10.0.2.2 for host access.
- Both still reach the same host backend emulators.

## Terminal Workflow

Terminal A (backend repo):
- Confirm Firebase emulators are already running.

Terminal B (mobile repo, outside VS Code):
~~~bash
npm run start:metro
~~~

Terminal C (mobile repo):
~~~bash
npm run android:devices
npm run android:usb:reverse
~~~

Terminal D (mobile repo):
- Start Android emulator if needed.
~~~bash
npm run android:devices
npm run android:emu
~~~

Terminal E (mobile repo):
~~~bash
npm run android:usb
~~~

## Expected adb devices Output

You should see both a virtual and physical device listed, for example:

~~~text
List of devices attached
emulator-5554          device
R58N1234ABC            device
~~~

## Targeting One Device Explicitly

When both devices are connected, set optional env vars before launch scripts:

~~~powershell
$env:WAYCREW_ANDROID_EMULATOR_ID="emulator-5554"
$env:WAYCREW_ANDROID_DEVICE_ID="R58N1234ABC"
~~~

Then run:

~~~bash
npm run android:emu
npm run android:usb
~~~

You can also run direct adb commands with a specific serial:

~~~bash
adb -s R58N1234ABC reverse tcp:2468 tcp:2468
~~~

## Settings Diagnostics Checks (Both Clients)

Open Settings -> Developer Tools -> Runtime Diagnostics and verify:
- Device mode is appropriate for client type.
- ADB reverse expected is yes on USB phone mode.
- Firebase emulator host:
  - phone: 127.0.0.1 (adb reverse)
  - emulator: 10.0.2.2
- Functions URL base points to host:5001 project path.
- Firestore/Auth/Storage targets match emulator ports.
- Metro port is 2468.
- Current orgId is present.
- Current uid/email are present.

## Org Alignment Is Mandatory

Both clients must be in the exact same orgId, or sync appears broken.

Steps:
1. Sign into Client A.
2. Confirm Current orgId in Settings diagnostics.
3. Sign into Client B.
4. Join/select the same org.
5. Confirm the exact same orgId string in Settings diagnostics.

Important warning:
- Re-running DEV bootstrap independently on each client can create different orgs and produce false sync failures.

## Two-Client Work Order Sync Smoke Test

1. On USB phone, create a work order and save.
2. Trigger sync from Settings -> Sync Now.
3. On emulator, trigger Sync Now or reopen map/work order list.
4. Confirm same work order appears.
5. Edit status or note on emulator and sync.
6. Confirm change appears on USB phone.

## Two-Client Photo Sync Smoke Test

Direction A (phone -> emulator):
1. On USB phone, open a work order.
2. Add photo (camera or existing image).
3. Save/sync.
4. Confirm local work order shows photo.
5. On emulator, Sync Now or reopen the same work order.
6. Confirm thumbnail appears.
7. Tap thumbnail and confirm full-screen viewer opens.

Direction B (emulator -> phone):
1. On emulator, add a photo to the same work order (gallery test image is fine).
2. Sync/reopen on phone.
3. Confirm thumbnail and full-screen open on USB phone.

## Failure Clues

- Work order syncs but photo does not:
  likely metadata/downsync/listener timing issue.

- Photo uploads to Storage but second device never sees it:
  likely Firestore photo metadata write, query, or read path issue.

- Photo metadata exists but thumbnail fails:
  likely download URL/path/auth or URI rendering issue.

- Photo only appears on creator device:
  likely local-only photo rows are being shown while remote metadata is missing/stale.

## DEV Logs To Watch

Look for these logs in Metro/logcat:
- [WorkOrderPhotos][upload-start]
- [WorkOrderPhotos][upload-success]
- [WorkOrderPhotos][metadata-write-success]
- [WorkOrderPhotos][remote-metadata-received]
- [WorkOrderPhotos][remote-metadata-missing-uri]
- [WorkItemSheet][photo-fetch-success]
- [WorkItemSheet][photo-render-count]
- [WorkItemSheet][photo-render-error]

These are DEV diagnostics only and do not alter production behavior.
