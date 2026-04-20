# Step 8 — iOS Readiness, Checks & TestFlight Prep Report

## Summary

Full iOS readiness audit for WayCrew (React Native 0.83.1 CLI, Firebase 23.8.6). The project is **structurally sound** — Xcode config, Podfile, entitlements, permissions, and privacy manifest are all properly configured. **3 manual blockers** remain that require developer credentials and macOS access.

---

## Changes Applied This Step

- File: `ios/RoadWorkTracker/AppDelegate.swift`
  Change: Added `import GoogleMaps` + `GMSServices.provideAPIKey("YOUR_IOS_GOOGLE_MAPS_API_KEY")` for `PROVIDER_GOOGLE` usage

---

## BLOCKERS — Must Be Resolved Before TestFlight

### 1. ❌ Missing `GoogleService-Info.plist`

Firebase will crash on launch without this file. Download from Firebase Console -> Project Settings -> iOS app -> `GoogleService-Info.plist` and place at `ios/RoadWorkTracker/GoogleService-Info.plist`.

The file must also be added to the Xcode project (drag into the RoadWorkTracker group with "Copy items if needed" checked, targeting `RoadWorkTracker`).

This file also provides the `REVERSED_CLIENT_ID` needed if Firebase Auth Google Sign-In is ever added (currently using email/password only).

### 2. ❌ Replace Google Maps API Key

`AppDelegate.swift` now has `GMSServices.provideAPIKey("YOUR_IOS_GOOGLE_MAPS_API_KEY")`. Replace the placeholder with a real iOS-restricted Google Maps API key from Google Cloud Console. Without this, both MapScreen and MeasureDistanceScreen will show blank map tiles.

### 3. ❌ Bundle ID & Code Signing

Both Debug and Release configs use the placeholder bundle ID:

```text
org.reactjs.native.example.$(PRODUCT_NAME:rfc1034identifier)
```

This resolves to `org.reactjs.native.example.RoadWorkTracker`.

**Required actions (in Xcode on macOS):**

- Set `PRODUCT_BUNDLE_IDENTIFIER` to your real bundle ID (e.g., `com.yourcompany.roadworktracker`)
- Set `DEVELOPMENT_TEAM` to your Apple Developer team ID
- Ensure provisioning profiles are configured (automatic signing recommended)
- For TestFlight: archive with Release config, upload via Xcode Organizer or `xcodebuild`

---

## iOS Configuration Audit

### Podfile ✅

- `platform :ios, min_ios_version_supported` (resolves to 15.1 via Xcode project)
- `$RNFirebaseAsStaticFramework = true` — correct for Firebase with CocoaPods
- `setup_permissions(['LocationWhenInUse', 'Camera', 'PhotoLibrary', 'Notifications'])` — matches app's actual permission usage
- Uses `use_native_modules!` and `use_react_native!` with standard RN 0.83 config
- `react_native_post_install` hook configured

### Info.plist ✅

- `NSLocationWhenInUseUsageDescription`: Value `Real user-facing text`; Status `✅`
- `NSCameraUsageDescription`: Value `Real user-facing text`; Status `✅`
- `NSPhotoLibraryUsageDescription`: Value `Real user-facing text`; Status `✅`
- `NSAllowsArbitraryLoads`: Value `false`; Status `✅ Secure`
- `NSAllowsLocalNetworking`: Value `true`; Status `✅ Needed for Metro`
- `UIRequiredDeviceCapabilities`: Value `arm64`; Status `✅`
- `LSRequiresIPhoneOS`: Value `true`; Status `✅`
- `CFBundleShortVersionString`: Value `$(MARKETING_VERSION)` -> `1.0`; Status `✅`
- `CFBundleVersion`: Value `$(CURRENT_PROJECT_VERSION)` -> `1`; Status `✅`

### AppDelegate.swift ✅

- `FirebaseApp.configure()` called before RN factory setup
- `GMSServices.provideAPIKey()` added (placeholder key — replace before build)
- Uses RN 0.83 new-arch pattern (`RCTReactNativeFactory`, `ReactNativeDelegate`)
- `#if DEBUG` / `#else` properly switches bundle URL source
- No dev-only code leaks into Release path

### Entitlements ✅

- `aps-environment = development` — correct for dev/TestFlight
- Wired in both Debug and Release build configs via `CODE_SIGN_ENTITLEMENTS`

### PrivacyInfo.xcprivacy ✅

- Declares 3 required API categories:
  - `FileTimestamp` (C617.1) — used by RNFS, SQLite
  - `UserDefaults` (CA92.1) — used by AsyncStorage, RN internals
  - `SystemBootTime` (35F9.1) — used by RN performance monitoring
- `NSPrivacyTracking = false`
- `NSPrivacyCollectedDataTypes = []`

### project.pbxproj ✅

- Entitlements file reference (`A1B2C3D4E5F60001`) exists and is linked
- `CODE_SIGN_ENTITLEMENTS = RoadWorkTracker/RoadWorkTracker.entitlements` set for both Debug and Release
- Crashlytics dSYM upload build phase (`A1B2C3D4E5F60002`) — Release-only guard in script
- Deployment target: iOS 15.1 (Debug + Release + project-level)
- Swift 5.0, C++20, Hermes enabled (default for RN 0.83)
- `ENABLE_BITCODE = NO` (correct for RN)
- No `DEVELOPMENT_TEAM` set (must be added in Xcode)

### App Icons ⚠️

`AppIcon.appiconset/Contents.json` defines 7 icon slots but **no actual image files exist**. All slots have definitions without `filename` keys. App will build but show a blank icon.

**Required:** Provide a 1024x1024 app icon and generate the required sizes (use Xcode's asset catalog or a tool like `app-icon` npm package).

### Gemfile ✅

- CocoaPods >=1.13 (excludes known-buggy 1.15.0/1.15.1)
- activesupport >=6.1.7.5 (excludes 7.1.0)
- xcodeproj <1.26.0, concurrent-ruby <1.3.4 — all sensible constraints

---

## Dependency iOS Readiness

- `react-native` (0.83.1): ✅ Full iOS support, new-arch ready
- `@react-native-firebase/*` (23.8.6): ✅ All 6 modules have iOS pods; needs GoogleService-Info.plist
- `react-native-maps` (1.26.20): ⚠️ Uses PROVIDER_GOOGLE — needs API key in AppDelegate (now added as placeholder)
- `@op-engineering/op-sqlite` (15.2.5): ✅ Has iOS pod, xcframework-based
- `react-native-permissions` (5.4.4): ✅ `setup_permissions()` configured in Podfile
- `@notifee/react-native` (9.1.8): ✅ Has iOS pod, entitlements configured
- `react-native-image-picker` (8.2.1): ⚠️ In package.json but **never imported anywhere in src/**. Consider removing.
- `@react-native-community/geolocation` (3.4.0): ✅ Has iOS pod
- `react-native-device-info` (15.0.2): ✅ Has iOS pod
- `react-native-fs` (2.20.0): ✅ Used in `src/export/shareCsv.ts`
- `react-native-share` (12.2.5): ✅ Has iOS pod
- `react-native-gesture-handler` (2.30.0): ✅
- `react-native-screens` (4.20.0): ✅
- `react-native-safe-area-context` (5.6.2): ✅
- `react-native-vector-icons` (10.3.0): ✅
- `react-native-toast-message` (2.3.3): ✅ Pure JS
- `@react-native-async-storage/async-storage` (2.2.0): ✅
- `@react-native-community/netinfo` (12.0.1): ✅
- `@react-native-community/slider` (5.1.2): ✅

---

## Release vs. Debug Safety ✅

### `__DEV__` Guards (21 occurrences, all safe)

- **10 files** use `__DEV__`, all with correct guard patterns
- Emulator connections: `if (!__DEV__) return;` in `firebase/emulators.ts`
- Dev UI elements: wrapped in `{__DEV__ && (...)}` in SettingsScreen, OrgPickerScreen, MapScreen
- Dev flag persistence: skipped in prod via `if (!__DEV__)` early returns
- Console logging: only inside `if (__DEV__)` blocks
- Force-offline mode: only active when `__DEV__ && state.forceOffline`

### Emulator Connections (safe)

- `firebase/emulators.ts` has `USE_EMULATORS = true` hardcoded but entire function body is behind `if (!__DEV__) return;`
- Auth, Firestore, Functions, Storage emulator URLs are never reached in Release builds
- Direct HTTP calls to emulator in `outboxSync.ts` and `orgJoin.ts` are inside `if (__DEV__)` blocks

### ATS / Network Security ✅

- `NSAllowsArbitraryLoads = false` — no plaintext HTTP in production
- `NSAllowsLocalNetworking = true` — only allows localhost (Metro bundler)

### Platform.OS Usage (3 occurrences, all safe)

- `location.ts`: Android/iOS permission branching — proper `PERMISSIONS.IOS.LOCATION_WHEN_IN_USE`
- `AuthScreen.tsx` + `JoinOrgScreen.tsx`: Standard `KeyboardAvoidingView` behavior for iOS

---

## TestFlight Checklist

- GoogleService-Info.plist: Status `❌`; Action `Download from Firebase Console, add to Xcode project`
- Google Maps API key: Status `❌`; Action `Replace placeholder in AppDelegate.swift`
- Bundle ID: Status `❌`; Action `Change from placeholder to real ID in Xcode`
- Development Team: Status `❌`; Action `Set DEVELOPMENT_TEAM in Xcode signing settings`
- Provisioning Profile: Status `❌`; Action `Configure in Xcode (automatic signing recommended)`
- App Icons: Status `❌`; Action `Add 1024x1024 source icon, generate all sizes`
- pod install: Status `❌`; Action `Run on macOS with Xcode + CocoaPods installed`
- Info.plist descriptions: Status `✅`; Action `All 3 permission strings populated`
- Privacy manifest: Status `✅`; Action `PrivacyInfo.xcprivacy configured`
- Entitlements: Status `✅`; Action `Push notifications configured`
- Crashlytics dSYM upload: Status `✅`; Action `Build phase configured (Release-only)`
- ATS / Security: Status `✅`; Action `Arbitrary loads disabled`
- `__DEV__` safety: Status `✅`; Action `All 21 usages properly guarded`
- Emulator isolation: Status `✅`; Action `All emulator code behind __DEV__`
- Firebase init: Status `✅`; Action `FirebaseApp.configure() in AppDelegate`
- Swift version: Status `✅`; Action `5.0`
- Deployment target: Status `✅`; Action `iOS 15.1`
- Hermes: Status `✅`; Action `Default for RN 0.83`

---

## iOS Build Commands (for macOS)

```bash
# Install Ruby gems (CocoaPods)
cd RoadWorkTracker
bundle install

# Install CocoaPods dependencies
cd ios
bundle exec pod install

# Build for simulator
npx react-native run-ios

# Build for device (requires signing)
npx react-native run-ios --device "Your iPhone"

# Archive for TestFlight
cd ios
xcodebuild -workspace RoadWorkTracker.xcworkspace -scheme RoadWorkTracker -configuration Release -archivePath build/RoadWorkTracker.xcarchive archive
xcodebuild -exportArchive -archivePath build/RoadWorkTracker.xcarchive -exportOptionsPlist ExportOptions.plist -exportPath build/ipa
```

---

## Recommended Pre-Build Sequence

1. Download `GoogleService-Info.plist` from Firebase Console -> add to `ios/RoadWorkTracker/` in Xcode
2. Replace `"YOUR_IOS_GOOGLE_MAPS_API_KEY"` in `AppDelegate.swift` with real key
3. In Xcode: set bundle ID, development team, enable automatic signing
4. Add app icon images to `Images.xcassets/AppIcon.appiconset/`
5. Run `bundle install && cd ios && bundle exec pod install`
6. Build to simulator: `npx react-native run-ios`
7. Test on device: `npx react-native run-ios --device`
8. Archive + upload to TestFlight

---

## Notes

- `react-native-image-picker` (8.2.1) is in `package.json` but never imported in `src/`. Can be removed with `npm uninstall react-native-image-picker` if not planned for near-term use.
- The `aps-environment` entitlement is set to `development` — this is correct for TestFlight. For App Store release, Xcode automatically switches this based on the provisioning profile.
- No fastlane setup exists. Consider adding `fastlane` for automated builds if CI/CD is needed.
