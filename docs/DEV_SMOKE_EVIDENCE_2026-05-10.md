# DEV Smoke Evidence (2026-05-10)

## Preflight

- adb devices: no connected devices detected at run time.
- Project helper check (npm run android:devices): no connected devices detected.
- Automated contracts/tests are green:
  - Full Jest: 18/18 suites passed, 92/92 tests passed.
  - Added coverage: smoke runner photo asset support PASS contract test.

## Device Bring-Up (Android)

1. Start Metro:
   - npm run start:metro
2. Connect USB device and authorize debugging, then run:
   - npm run android:usb:reverse
3. Start emulator (if available) and launch app:
   - npm run android:emu
4. Launch app on USB phone:
   - npm run android:usb
5. Confirm both devices show in:
   - npm run android:devices

Expected output shape:

```text
List of devices attached
emulator-5554          device
R58N1234ABC            device
```

## In-App Verification Targets

From Developer Smoke Tests and Runtime Diagnostics, verify:

- Photo sync contract row "Asset photo path contract and uploader support" is PASS.
- Upload diagnostics on creator client show started -> success.
- Metadata write diagnostics show success after upload.
- Second client resolves same work order photo thumbnail and full-screen open.

## Result Log

- Client A:
- Client B:
- Same org confirmed: yes/no

Smoke Runner
- Photo asset support PASS: yes/no
- Any WARN/FAIL rows:

Photo Sync
- Upload success on A: yes/no
- Metadata write success on A: yes/no
- Remote fetch count on B:
- Rendered count on B:
- Thumbnail visible on B: yes/no
- Full-screen open on B: yes/no

Regression
- Note A->B works: yes/no
- Status B->A works: yes/no

Blockers
- 1:
- 2:
- 3:
