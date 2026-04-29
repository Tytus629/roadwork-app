#!/usr/bin/env bash
set -euo pipefail

DERIVED_DATA_PATH="${1:-/tmp/rw-dd-debugtools}"
COMMON_ARGS_FILE=""

if [[ ! -d "$DERIVED_DATA_PATH" ]]; then
  echo "DerivedData path not found: $DERIVED_DATA_PATH"
  exit 1
fi

COMMON_ARGS_FILE="$(find "$DERIVED_DATA_PATH" -type f -name '*React-Core.common.build*' -prune -o -type f -name '*common-args.resp' -path '*React-Core.common.build*' -print 2>/dev/null | head -n 1 || true)"
if [[ -z "$COMMON_ARGS_FILE" ]]; then
  COMMON_ARGS_FILE="$(find "$DERIVED_DATA_PATH" -type f -name '*common-args.resp' -path '*React-Core.common.build*' -print 2>/dev/null | head -n 1 || true)"
fi
if [[ -z "$COMMON_ARGS_FILE" ]]; then
  echo "Could not find React-Core.common common-args.resp under $DERIVED_DATA_PATH"
  exit 1
fi

echo "Using response file: $COMMON_ARGS_FILE"

echo
echo "--- Include Paths (-I) ---"
tr ' ' '\n' < "$COMMON_ARGS_FILE" | grep '^-I' || true

echo
echo "--- Framework Paths (-F) ---"
tr ' ' '\n' < "$COMMON_ARGS_FILE" | grep '^-F' || true

echo
echo "--- Critical Header Lookup ---"
lookup_headers=("RCTDefines.h" "RCTComponent.h" "RCTAssert.h" "RCTViewManager.h" "RCTBridge.h")
include_dirs=( $(tr ' ' '\n' < "$COMMON_ARGS_FILE" | grep '^-I' | sed 's/^-I//') )

for header in "${lookup_headers[@]}"; do
  found="no"
  for dir in "${include_dirs[@]}"; do
    if [[ -f "$dir/$header" ]]; then
      echo "$header -> FOUND in $dir"
      found="yes"
      break
    fi
  done
  if [[ "$found" == "no" ]]; then
    echo "$header -> MISSING from all -I dirs"
  fi
done

echo
echo "--- Pod Diagnostics Snapshot ---"
REPORT_PATH="$(cd "$(dirname "$0")/.." && pwd)/.pod-debug/react-core-diagnostics.txt"
if [[ -f "$REPORT_PATH" ]]; then
  grep -E 'react_header_sources|react_header_mirror_count|react_tree_mirror_count|critical_headers|consumer_xcconfig_updates|common_xcconfig_updates' "$REPORT_PATH" || true
else
  echo "No report found at $REPORT_PATH"
fi
