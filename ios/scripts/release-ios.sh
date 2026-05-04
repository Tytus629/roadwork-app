#!/usr/bin/env bash
set -euo pipefail

IOS_DIR="$(cd "$(dirname "$0")/.." && pwd)"
BUILD_DIR="$IOS_DIR/build"
DEFAULT_WORKSPACE="$IOS_DIR/RoadWorkTracker.xcworkspace"
DEFAULT_SCHEME="RoadWorkTracker"

WORKSPACE="$DEFAULT_WORKSPACE"
SCHEME="$DEFAULT_SCHEME"
RUN_BUILD=1
RUN_ARCHIVE=1
RUN_EXPORT=1
METHOD="app-store-connect"
EXPORT_OPTIONS_PLIST=""
EXPORT_DIR="$BUILD_DIR/ipa"
ARCHIVE_PATH="$BUILD_DIR/RoadWorkTracker.xcarchive"

usage() {
  cat <<'EOF'
Usage: bash ios/scripts/release-ios.sh [options]

Runs iOS build, archive, and IPA export in sequence.

Options:
  --workspace <path>         Xcode workspace path (default: ios/RoadWorkTracker.xcworkspace)
  --scheme <name>            Xcode scheme (default: RoadWorkTracker)
  --archive-path <path>      Archive output path (default: ios/build/RoadWorkTracker.xcarchive)
  --export-dir <path>        IPA export directory (default: ios/build/ipa)
  --export-options <path>    Use an existing ExportOptions.plist
  --method <value>           Export method for generated export options (default: app-store-connect)
  --skip-build               Skip Debug simulator build step
  --skip-archive             Skip Release archive step
  --skip-export              Skip IPA export step
  --help                     Show this help

Examples:
  bash ios/scripts/release-ios.sh
  bash ios/scripts/release-ios.sh --skip-build
  bash ios/scripts/release-ios.sh --export-options ios/build/ExportOptions-AppStore.plist
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --workspace)
      WORKSPACE="$2"
      shift 2
      ;;
    --scheme)
      SCHEME="$2"
      shift 2
      ;;
    --archive-path)
      ARCHIVE_PATH="$2"
      shift 2
      ;;
    --export-dir)
      EXPORT_DIR="$2"
      shift 2
      ;;
    --export-options)
      EXPORT_OPTIONS_PLIST="$2"
      shift 2
      ;;
    --method)
      METHOD="$2"
      shift 2
      ;;
    --skip-build)
      RUN_BUILD=0
      shift
      ;;
    --skip-archive)
      RUN_ARCHIVE=0
      shift
      ;;
    --skip-export)
      RUN_EXPORT=0
      shift
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$BUILD_DIR"

if [[ ! -d "$WORKSPACE" ]]; then
  echo "Workspace not found: $WORKSPACE"
  exit 1
fi

if [[ -n "$EXPORT_OPTIONS_PLIST" && ! -f "$EXPORT_OPTIONS_PLIST" ]]; then
  echo "Export options plist not found: $EXPORT_OPTIONS_PLIST"
  exit 1
fi

STAMP="$(date +%Y%m%d-%H%M%S)"
BUILD_LOG="$BUILD_DIR/release-build-$STAMP.log"
ARCHIVE_LOG="$BUILD_DIR/release-archive-$STAMP.log"
EXPORT_LOG="$BUILD_DIR/release-export-$STAMP.log"

ensure_hermes_dsym_in_archive() {
  local archive_path="$1"
  local app_dir
  local hermes_bin
  local out_dsym
  local actual_uuids
  local expected_uuids

  app_dir="$(ls -1d "$archive_path"/Products/Applications/*.app 2>/dev/null | head -n 1 || true)"
  if [[ -z "$app_dir" ]]; then
    echo "Could not locate app bundle in archive: $archive_path"
    exit 1
  fi

  hermes_bin="$app_dir/Frameworks/hermesvm.framework/hermesvm"
  if [[ ! -f "$hermes_bin" ]]; then
    echo "note: Hermes framework not found in archive app bundle; skipping Hermes dSYM enforcement"
    return 0
  fi

  expected_uuids="$(/usr/bin/xcrun dwarfdump --uuid "$hermes_bin" | /usr/bin/awk '{print $2}' | /usr/bin/tr '[:lower:]' '[:upper:]')"
  if [[ -z "$expected_uuids" ]]; then
    echo "Failed to read UUID from Hermes binary: $hermes_bin"
    exit 1
  fi

  out_dsym="$archive_path/dSYMs/hermesvm.framework.dSYM"
  if [[ ! -f "$out_dsym/Contents/Resources/DWARF/hermesvm" ]]; then
    echo "note: Generating Hermes dSYM in archive dSYMs folder"
    /usr/bin/dsymutil "$hermes_bin" -o "$out_dsym"
  fi

  if [[ ! -f "$out_dsym/Contents/Resources/DWARF/hermesvm" ]]; then
    echo "Hermes dSYM DWARF file missing after generation: $out_dsym/Contents/Resources/DWARF/hermesvm"
    exit 1
  fi

  actual_uuids="$(/usr/bin/xcrun dwarfdump --uuid "$out_dsym" | /usr/bin/awk '{print $2}' | /usr/bin/tr '[:lower:]' '[:upper:]')"

  while IFS= read -r uuid; do
    [[ -z "$uuid" ]] && continue
    if ! /bin/echo "$actual_uuids" | /usr/bin/grep -Fxq "$uuid"; then
      echo "Hermes dSYM UUID mismatch. Expected UUID missing: $uuid"
      echo "Hermes binary UUIDs:"
      /bin/echo "$expected_uuids"
      echo "Hermes dSYM UUIDs:"
      /bin/echo "$actual_uuids"
      exit 1
    fi
  done <<< "$expected_uuids"

  echo "Hermes dSYM validated in archive: $out_dsym"
  /usr/bin/xcrun dwarfdump --uuid "$out_dsym" || true
}

run_with_log() {
  local label="$1"
  local logfile="$2"
  shift 2

  echo ""
  echo "==> $label"
  echo "Log: $logfile"

  if ! "$@" 2>&1 | tee "$logfile"; then
    echo ""
    echo "$label failed. See: $logfile"
    exit 1
  fi
}

if [[ "$RUN_BUILD" -eq 1 ]]; then
  run_with_log \
    "Build (Debug, generic iOS Simulator)" \
    "$BUILD_LOG" \
    xcodebuild \
      -workspace "$WORKSPACE" \
      -scheme "$SCHEME" \
      -configuration Debug \
      -destination "generic/platform=iOS Simulator" \
      build
else
  echo "Skipping build step"
fi

if [[ "$RUN_ARCHIVE" -eq 1 ]]; then
  run_with_log \
    "Archive (Release, generic iOS)" \
    "$ARCHIVE_LOG" \
    xcodebuild \
      -workspace "$WORKSPACE" \
      -scheme "$SCHEME" \
      -configuration Release \
      -destination "generic/platform=iOS" \
      -archivePath "$ARCHIVE_PATH" \
      archive
else
  echo "Skipping archive step"
fi

if [[ -d "$ARCHIVE_PATH" ]]; then
  ensure_hermes_dsym_in_archive "$ARCHIVE_PATH"
fi

if [[ "$RUN_EXPORT" -eq 1 ]]; then
  if [[ ! -d "$ARCHIVE_PATH" ]]; then
    echo "Archive path not found: $ARCHIVE_PATH"
    echo "Run archive first or pass --skip-export"
    exit 1
  fi

  if [[ -z "$EXPORT_OPTIONS_PLIST" ]]; then
    EXPORT_OPTIONS_PLIST="$BUILD_DIR/ExportOptions-Auto-$STAMP.plist"
    cat > "$EXPORT_OPTIONS_PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>method</key>
  <string>$METHOD</string>
  <key>signingStyle</key>
  <string>automatic</string>
  <key>stripSwiftSymbols</key>
  <true/>
  <key>uploadSymbols</key>
  <true/>
</dict>
</plist>
EOF
  fi

  mkdir -p "$EXPORT_DIR"

  run_with_log \
    "Export IPA" \
    "$EXPORT_LOG" \
    xcodebuild \
      -exportArchive \
      -archivePath "$ARCHIVE_PATH" \
      -exportOptionsPlist "$EXPORT_OPTIONS_PLIST" \
      -exportPath "$EXPORT_DIR"

  IPA_PATH="$(ls -1 "$EXPORT_DIR"/*.ipa 2>/dev/null | head -n 1 || true)"
  echo ""
  if [[ -n "$IPA_PATH" ]]; then
    echo "Export complete: $IPA_PATH"
  else
    echo "Export completed but no IPA found in: $EXPORT_DIR"
    echo "Check: $EXPORT_LOG"
    exit 1
  fi
else
  echo "Skipping export step"
fi

echo ""
echo "Release flow complete"
echo "Build log: $BUILD_LOG"
echo "Archive log: $ARCHIVE_LOG"
echo "Export log: $EXPORT_LOG"
