WAYCREW IOS DEV QA RUNBOOK

Use this exactly on the CloudMac in the mobile app repo root.

GOAL
- Start Metro on the fixed dev port
- Build/run the iOS Simulator
- Optionally run on a connected real iPhone
- Verify:
  1. app launches
  2. login/org selection work
  3. photo attachment metadata is written
  4. second client can see the photo
  5. high-priority creator notification is local
  6. non-creator notification path logs clearly
  7. Pavement Repair appears only once

PART A — START CLEAN DEV SESSION

1) Open terminal in repo root

2) Install packages if needed
npm install

3) Install iOS pods
npx pod-install ios

4) Start Metro on fixed port 2468
npm run start

5) Leave Metro running.
Expected:
- Metro starts successfully
- Port shown should be 2468
- No immediate red errors

PART B — RUN IOS SIMULATOR

Open a second terminal in repo root and run:
npm run ios:sim

If simulator target fails, run:
npx react-native run-ios --simulator "iPhone 15" --port 2468

Expected:
- Xcode build succeeds
- App opens in iPhone Simulator
- No startup red screen
- DEV startup diagnostics print platform/device/host info

PART C — OPTIONAL REAL IPHONE RUN

If testing on a physical iPhone from CloudMac:

1) Confirm the phone is connected/available to Xcode
2) In a new terminal, run:
npm run ios:device

If needed, run with explicit device name:
npx react-native run-ios --device "Your iPhone Name" --port 2468

If the real device cannot resolve Metro from CloudMac, restart Metro bound to all interfaces:
npx react-native start --port 2468 --host 0.0.0.0

Expected:
- App installs on device
- App opens without red screen
- DEV diagnostics show selected host/mode

PART D — APP STARTUP SMOKE TEST

On each client you use for testing:

1) Launch app
2) Sign in
3) Select org if needed
4) Open Settings
5) Verify DEV diagnostics card shows:
   - platform
   - simulator/device mode
   - current orgId
   - current userId
   - selected host
   - Metro hint

PASS if:
- app launches
- sign in works
- org selection works
- diagnostics card is visible and populated

PART E — PHOTO SYNC TEST

Use two clients:
- Client A = iOS Simulator or Phone A
- Client B = Phone B or another client in same org

1) Open the same existing work order on both clients
2) On Client A, add one photo
3) Wait for save/upload to complete

Expected on Client A:
- upload success diagnostic/log appears
- metadata write success diagnostic/log appears
- Work Item Sheet DEV photo diagnostics show updated latest upload + metadata write info

4) On Client B, open or refresh the same work order

Expected on Client B:
- remote fetch count >= 1
- rendered count >= 1
- thumbnail visible in Photos section
- remote fetch status should be success, not failed

If photo does NOT appear:
- inspect latest upload success on Client A
- inspect latest metadata write success on Client A
- inspect remote fetch result on Client B
- compare workOrderId/orgId shown in diagnostics
- verify the same exact work order is open on both clients

PART F — NOTE / STATUS REGRESSION TEST

1) On Client A, change note
2) Confirm Client B sees updated note
3) On Client B, change status
4) Confirm Client A sees updated status

PASS if:
- existing sync still works both directions
- no regressions from photo patch

PART G — HIGH PRIORITY NOTIFICATION TEST

1) On Client A, create a new work order OR change an existing one from below-high to High/Urgent
2) Save

Expected on Client A:
- immediate creator-side local notification behavior
- remoteSync diagnostics should clearly show decision context and skip reason if any

3) On Client B, observe whether inbound/remote notification behavior appears
4) If no visible alert appears, inspect logs/diagnostics for:
   - notify decision
   - skip reason
   - first snapshot suppression
   - freshness/event context

PASS if:
- creator-side local notification still works
- non-creator path produces a clear notify/skip trail
- no repeated spam on subsequent edits unless priority transitions again

PART H — PAVEMENT REPAIR DUPLICATION CHECK

1) Open any create flow where the duplicate used to appear
2) Open any filter flow where the duplicate used to appear
3) Confirm only one Pavement Repair option is shown

PASS if:
- only one user-visible Pavement Repair entry exists
- old rows still remain searchable/filterable

PART I — LOG LINES TO WATCH FOR

PHOTO PATH
Look for logs/diagnostics equivalent to:
- upload success
- metadata write success
- remote fetch count
- rendered photo count
- remote fetch error if failed

NOTIFICATION PATH
Look for logs/diagnostics equivalent to:
- local creator notification path
- remote sync notify decision
- skip reason
- priority/event/freshness context

PART J — RESULT RECORD TEMPLATE

After the run, record this exactly:

CLIENT SETUP
- Client A:
- Client B:
- Same org confirmed: yes/no

SIMULATOR
- App launched: yes/no
- Sign in: yes/no
- Org selection: yes/no
- DEV diagnostics visible: yes/no

PHOTO TEST
- Upload success on A: yes/no
- Metadata write success on A: yes/no
- Remote fetch count on B:
- Rendered count on B:
- Thumbnail visible on B: yes/no

SYNC REGRESSION
- Note A->B works: yes/no
- Status B->A works: yes/no

NOTIFICATIONS
- Creator local notification works: yes/no
- Non-creator notification visible: yes/no
- If no, skip reason/log summary:

TYPE DUPLICATION
- Pavement Repair appears once: yes/no

BLOCKERS FOUND
- 1:
- 2:
- 3:

END
