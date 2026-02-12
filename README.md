This is a new [**React Native**](https://reactnative.dev) project, bootstrapped using [`@react-native-community/cli`](https://github.com/react-native-community/cli).

# Getting Started

> **Note**: Make sure you have completed the [Set Up Your Environment](https://reactnative.dev/docs/set-up-your-environment) guide before proceeding.

## Step 1: Start Metro

First, you will need to run **Metro**, the JavaScript build tool for React Native.

To start the Metro dev server, run the following command from the root of your React Native project:

```sh
# Using npm
npm start

# OR using Yarn
yarn start
```

## Step 2: Build and run your app

With Metro running, open a new terminal window/pane from the root of your React Native project, and use one of the following commands to build and run your Android or iOS app:

### Android

```sh
# Using npm
npm run android

# OR using Yarn
yarn android
```

### iOS

For iOS, remember to install CocoaPods dependencies (this only needs to be run on first clone or after updating native deps).

The first time you create a new project, run the Ruby bundler to install CocoaPods itself:

```sh
bundle install
```

Then, and every time you update your native dependencies, run:

```sh
bundle exec pod install
```

For more information, please visit [CocoaPods Getting Started guide](https://guides.cocoapods.org/using/getting-started.html).

```sh
# Using npm
npm run ios

# OR using Yarn
yarn ios
```

If everything is set up correctly, you should see your new app running in the Android Emulator, iOS Simulator, or your connected device.

This is one way to run your app — you can also build it directly from Android Studio or Xcode.

## Step 3: Modify your app

Now that you have successfully run the app, let's make changes!

Open `App.tsx` in your text editor of choice and make some changes. When you save, your app will automatically update and reflect these changes — this is powered by [Fast Refresh](https://reactnative.dev/docs/fast-refresh).

When you want to forcefully reload, for example to reset the state of your app, you can perform a full reload:

- **Android**: Press the <kbd>R</kbd> key twice or select **"Reload"** from the **Dev Menu**, accessed via <kbd>Ctrl</kbd> + <kbd>M</kbd> (Windows/Linux) or <kbd>Cmd ⌘</kbd> + <kbd>M</kbd> (macOS).
- **iOS**: Press <kbd>R</kbd> in iOS Simulator.

## Congratulations! :tada:

You've successfully run and modified your React Native App. :partying_face:

### Now what?

- If you want to add this new React Native code to an existing application, check out the [Integration guide](https://reactnative.dev/docs/integration-with-existing-apps).
- If you're curious to learn more about React Native, check out the [docs](https://reactnative.dev/docs/getting-started).

# Troubleshooting

If you're having issues getting the above steps to work, see the [Troubleshooting](https://reactnative.dev/docs/troubleshooting) page.

# Learn More

To learn more about React Native, take a look at the following resources:

- [React Native Website](https://reactnative.dev) - learn more about React Native.
- [Getting Started](https://reactnative.dev/docs/environment-setup) - an **overview** of React Native and how setup your environment.
- [Learn the Basics](https://reactnative.dev/docs/getting-started) - a **guided tour** of the React Native **basics**.
- [Blog](https://reactnative.dev/blog) - read the latest official React Native **Blog** posts.
- [`@facebook/react-native`](https://github.com/facebook/react-native) - the Open Source; GitHub **repository** for React Native.

---

# 🏗️ Architecture & Key Changes

This section documents important architectural decisions and changes made to ensure data persistence, prevent bugs, and maintain code quality.

## 📊 Data Persistence Architecture

### Problem Solved
**Issue**: Work orders were disappearing after app restarts.  
**Root Cause**: Inconsistent persistence - some operations only updated Redux (memory), not SQLite (disk).

### Solution: Centralized Commit Pattern

All work order creates/updates now go through a single function:

```typescript
// src/state/workOrdersCommit.ts
commitWorkOrder(workOrder, dispatch, "create" | "update")
```

**How it works:**
1. Updates Redux state immediately (for instant UI feedback)
2. Persists to SQLite in background (for offline storage)
3. Never crashes - logs errors if DB unavailable

**Refactored locations:**
- `src/components/WorkItemSheet.tsx` - Status changes, photo additions, priority updates
- `src/screens/MapScreen.tsx` - Map point creation
- `src/screens/CreateScreen.tsx` - Quick test data creation

### Diagnostic System

**DB Status Banner** (top of app):
- Shows "Persistence: ON (SQLite)" when working
- Shows "Persistence: OFF" with error if DB fails
- Polls status every 1 second for real-time updates
- Located in `App.tsx` using `isDbReady()` and `getDbInitError()` from `src/storage/db.ts`

**Comprehensive Logging:**
```
[startup] Loading persisted work orders...     // AppTabs.tsx
[startup] Loaded 5 work orders from DB
[workRepo] UPSERT abc123 needsSync=true       // workRepo.ts
[workRepo] UPSERT OK abc123
[commitWorkOrder] START abc123 source=update   // workOrdersCommit.ts
[commitWorkOrder] PERSIST OK abc123
```

## 🔄 Duplicate Commit Prevention

### Problem Solved
**Issue**: Status changes triggered 4x duplicate commits  
**Root Cause**: Missing guard for simultaneous operations

### Solution: isCommitting Guard

```typescript
// src/components/WorkItemSheet.tsx
const [isCommitting, setIsCommitting] = useState(false);

const setStatus = useCallback(async (status: WorkStatus) => {
  if (isCommitting) return;  // Guard prevents duplicate commits
  
  setIsCommitting(true);
  try {
    await commitWorkOrder(...);
  } finally {
    setIsCommitting(false);  // Always reset flag
  }
}, [item, isCommitting, dispatch]);
```

**Additional safeguards:**
- Status buttons disabled during commit (`disabled={isCommitting}`)
- Visual feedback with `pillDisabled` style (opacity 0.5)
- useCallback dependencies prevent stale closures

## ⚛️ React Hooks Order Requirements

### Problem Solved
**Issue**: "Rendered more hooks than during the previous render" error  
**Root Cause**: useCallback declared after early return `if (!item) return null;`

### Solution: Hooks Before Returns

```typescript
// ❌ WRONG - Hook after early return
function Component({ item }) {
  if (!item) return null;  // Early return
  const callback = useCallback(...);  // ❌ Hook violation!
}

// ✅ CORRECT - All hooks first
function Component({ item }) {
  const callback = useCallback(     // ✅ Hook before return
    () => {
      if (!item) return;  // Guard inside callback
      // ... logic
    },
    [item]
  );
  
  if (!item) return null;  // Early return after hooks
}
```

**Pattern used throughout:**
1. All `useState` hooks
2. All `useEffect` hooks
3. All `useCallback` hooks
4. Early returns (`if (!item) return null;`)
5. Regular functions

**Why:** React requires hooks to run in the exact same order every render. Early returns break this rule.

## 📸 Camera Permission Flow

### Problem Solved
**Issue**: Camera opening without permission request  
**Root Cause**: Android 6.0+ requires runtime permission, not just manifest declaration

### Solution: Two-Tier Permission System

**1. Manifest Declaration** (`android/app/src/main/AndroidManifest.xml` line 6):
```xml
<uses-permission android:name="android.permission.CAMERA" />
```

**2. Runtime Permission Request** (`src/utils/capturePhoto.ts`):
```typescript
async function ensureCameraPermission() {
  const granted = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.CAMERA,
    {
      title: "Camera Permission",
      message: "We need camera access to attach photos to work orders.",
      buttonPositive: "OK",
      buttonNegative: "Cancel",
    }
  );
  return granted === PermissionsAndroid.RESULTS.GRANTED;
}
```

**User Experience:**
- First camera use: Shows permission dialog with explanation
- Permission granted: Opens camera
- Permission denied: Shows friendly alert, suggests using gallery instead
- No crashes, graceful fallback

## 🗂️ File Structure

### Key Files with Recent Changes

| File | Purpose | Key Changes |
|------|---------|-------------|
| `src/state/workOrdersCommit.ts` | Centralized commit function | **NEW FILE** - Single source of truth for all creates/updates |
| `src/components/WorkItemSheet.tsx` | Work order edit modal | Hooks order fix, isCommitting guard, commitWorkOrder integration |
| `src/storage/db.ts` | SQLite initialization | Added `_dbReady`, `_dbInitError` tracking, status exports |
| `src/storage/workRepo.ts` | DB operations | Comprehensive logging (UPSERT before/after, startup logs) |
| `App.tsx` | Root component | Added DbBanner diagnostic component |
| `src/navigation/AppTabs.tsx` | Bottom tabs + startup | Persistence restoration logging |
| `src/utils/capturePhoto.ts` | Camera utilities | **NEW FILE** - Runtime permission handling |

### Data Flow Diagram

```
User Action (e.g., status change)
        ↓
WorkItemSheet.tsx (validates, guards with isCommitting)
        ↓
commitWorkOrder() (src/state/workOrdersCommit.ts)
        ├→ Redux dispatch (immediate UI update)
        └→ workRepo.upsertWorkItem() (SQLite persistence)
                ↓
        getDb() → SQLite database
                ↓
        Logs: [commitWorkOrder] PERSIST OK
```

**Startup Flow:**
```
App starts
    ↓
AppTabs mounts
    ↓
useEffect: getAllWorkItems() (src/navigation/AppTabs.tsx)
    ↓
workRepo.getAllWorkItems() (src/storage/workRepo.ts)
    ↓
dispatch(loadAllWorkItems(items))
    ↓
Redux state populated → All screens see persisted data
    ↓
Logs: [startup] Loaded X work orders from DB
```

## 🐛 Debugging Tips

### Check Persistence Status
1. Look at banner at top of app: "Persistence: ON/OFF"
2. Check Metro console for logs:
   - `[initDb] Database initialized successfully` ✅
   - `[getDb] Database unavailable` ❌

### Trace Work Order Operations
Search Metro console for:
- `[commitWorkOrder]` - All create/update operations
- `[workRepo] UPSERT` - SQLite write operations
- `[startup] Loaded` - Persistence restoration on launch

### Common Issues

**Work orders disappearing:**
- Check: Is banner showing "ON"?
- Check: Do you see `[commitWorkOrder] PERSIST OK` logs?
- Fix: Ensure all updates use `commitWorkOrder()`, not direct Redux dispatch

**Hooks order errors:**
- Check: Are all hooks declared before early returns?
- Check: Is useCallback inside conditional logic?
- Fix: Move all hooks to top of function

**Camera permission denied:**
- Check: Is `<uses-permission android:name="android.permission.CAMERA" />` in AndroidManifest.xml?
- Check: Does user see permission dialog?
- Fix: Uninstall app, rebuild to reset permissions

## 📝 Code Style Guidelines

### Logging Convention
- Format: `[moduleName] ACTION details`
- Examples:
  - `[commitWorkOrder] START abc123 source=update`
  - `[workRepo] UPSERT abc123 needsSync=true`
  - `[startup] Loaded 5 work orders from DB`

### Error Handling
- **Never crash**: Catch errors, log warnings
- **Graceful degradation**: Continue without DB if unavailable
- **User-friendly messages**: Show alerts with actionable suggestions

### Component Patterns
1. **Hooks order**: useState → useEffect → useCallback → early returns → functions
2. **Commit pattern**: Always use `commitWorkOrder()` for work order changes
3. **Guard flags**: Use `isCommitting` style guards for async operations
4. **Dependencies**: Always specify useCallback/useEffect dependencies

---

