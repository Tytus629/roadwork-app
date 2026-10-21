# Cleanup pass 1 (branch `cleanup/pass-1`)

Scope: hygiene only. App behavior and UI are not changed.

## History rewrite (NOT performed)
Files were removed from the tip only. To purge them from history (this shrinks the clone; it is a force-push and needs coordination):

```sh
git filter-repo --invert-paths \
  --path-glob 'android/*.xml' --path-glob 'android/*.txt' --path-glob 'android/*.log' \
  --path-glob 'android/*.tsv' --path-glob 'android/*.png' \
  --path-glob 'android/*.db' --path-glob 'android/*.db-shm' --path-glob 'android/*.db-wal' \
  --path .pod-debug/ --path ios/.pod-debug/
```
That covers about 1,435 distinct paths across history, including large logcats such as android/manual_phone_after.txt (34 MB)
and SQLite snapshots (android/emu_roadwork.db, android/phone_roadwork.db), which may contain real org/user data.
Note: `android/*.xml` globs are top-level only and do not touch android/app/**.

## exhaustive-deps warnings deferred (need behavior review)
Downgraded to `warn` in .eslintrc.js. Adding deps here would change when effects/memos run:
- App.tsx:210:6 — React Hook useEffect has missing dependencies: 'clearOrgId' and 'user'. Either include them or remove the dependency array.
- src/components/AssetDraftSheet.tsx:54:6 — React Hook useMemo has a missing dependency: 'draft.bridge'. Either include it or remove the dependency array.
- src/hooks/useActiveWorkOrders.ts:30:6 — React Hook useEffect has missing dependencies: 'filter', 'orgId', and 'sort'. Either include them or remove the dependency array
- src/hooks/useMapWorkOrders.ts:87:6 — React Hook useEffect has missing dependencies: 'bbox', 'filter', and 'orgId'. Either include them or remove the dependency array. [
- src/hooks/useSignsNear.ts:29:6 — React Hook useEffect has missing dependencies: 'lat', 'lng', 'miles', and 'orgId'. Either include them or remove the dependency array. 
- src/hooks/useWorkOrdersFiltered.ts:71:6 — React Hook useEffect has missing dependencies: 'ageSort', 'filter', and 'orgId'. Either include them or remove the dependency 
- src/screens/MapScreen.tsx:732:6 — React Hook useMemo has a missing dependency: 'mapRegion'. Either include it or remove the dependency array.
- src/screens/MapScreen.tsx:733:5 — React Hook useMemo has a complex expression in the dependency array. Extract it to a separate variable so it can be statically checked
- src/screens/MapScreen.tsx:734:5 — React Hook useMemo has a complex expression in the dependency array. Extract it to a separate variable so it can be statically checked
- src/screens/MapScreen.tsx:735:5 — React Hook useMemo has a complex expression in the dependency array. Extract it to a separate variable so it can be statically checked
- src/screens/MapScreen.tsx:736:5 — React Hook useMemo has a complex expression in the dependency array. Extract it to a separate variable so it can be statically checked
- src/screens/MapScreen.tsx:829:5 — React Hook useMemo has a missing dependency: 'mapRegion'. Either include it or remove the dependency array.
- src/screens/MapScreen.tsx:837:6 — React Hook useEffect has missing dependencies: 'bbox' and 'loadAssetsInViewport'. Either include them or remove the dependency array. 
- src/screens/MapScreen.tsx:924:6 — React Hook useEffect has missing dependencies: 'bbox' and 'dbItems'. Either include them or remove the dependency array.
- src/state/OrgContext.tsx:314:5 — React Hook useMemo has missing dependencies: 'clearOrg' and 'setOrgId'. Either include them or remove the dependency array.

Notes: the `useActiveWorkOrders`, `useMapWorkOrders`, `useWorkOrdersFiltered`, and `useSignsNear` hooks use a JSON.stringify key on object
(or float) inputs, so swapping to direct deps would re-query on new-but-equal objects. The safe fix is to stabilize the
callers' `filter` objects with useMemo first.

## Recommendations (not done)
- MapScreen.tsx (~3.7k lines), WorkItemSheet.tsx (~2.8k), sync/outboxSync.ts (~1.6k): split them into hooks and subcomponents behind tests.
- google-services.json and GoogleService-Info.plist are committed. Restrict the API keys (by package/bundle id and SHA), enable App Check, or
  inject these files at CI build time.
- Remaining npm audit advisories need major upgrades (jest 30, @react-native-community/cli, react-native/metro).
- 90 `react-native/no-inline-styles` warnings: move to StyleSheet when touching those files.
- console stripping in production is already active (Metro sets BABEL_ENV=production; guarded by __tests__/babelConsoleStrip.test.js).
  Note that it strips console.error/warn too.
