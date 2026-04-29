#!/usr/bin/env bash
set -euo pipefail

DERIVED_DATA_PATH="${1:-/tmp/rw-dd-debugtools2}"
SRC_FILE="${2:-/Users/user949187/roadwork-app/node_modules/react-native/React/Profiler/RCTProfileTrampoline-x86_64.S}"
OUT_FILE="${3:-/tmp/react-core-common-replay.log}"

if [[ ! -d "$DERIVED_DATA_PATH" ]]; then
  echo "DerivedData path not found: $DERIVED_DATA_PATH"
  exit 1
fi
if [[ ! -f "$SRC_FILE" ]]; then
  echo "Source file not found: $SRC_FILE"
  exit 1
fi

RESP_FILE="$(find "$DERIVED_DATA_PATH" -type f -name '*common-args.resp' -path '*React-Core.common.build*' -print 2>/dev/null | head -n 1 || true)"
if [[ -z "$RESP_FILE" ]]; then
  echo "Could not find React-Core.common response file in $DERIVED_DATA_PATH"
  exit 1
fi

CLANG_BIN="$(xcrun --find clang)"
SDK_PATH="$(xcrun --sdk iphonesimulator --show-sdk-path)"

{
  echo "clang=$CLANG_BIN"
  echo "sdk=$SDK_PATH"
  echo "resp=$RESP_FILE"
  echo "src=$SRC_FILE"
  echo
  echo "--- Replay Command ---"
  echo "$CLANG_BIN -x assembler-with-cpp -isysroot $SDK_PATH @${RESP_FILE} -v -H -E $SRC_FILE -o /dev/null"
  echo
  echo "--- Replay Output ---"
  "$CLANG_BIN" -x assembler-with-cpp -isysroot "$SDK_PATH" @"$RESP_FILE" -v -H -E "$SRC_FILE" -o /dev/null
} > "$OUT_FILE" 2>&1 || true

echo "Wrote replay output: $OUT_FILE"
echo "Top include diagnostics:"
grep -E "RCTDefines.h|search starts here|End of search list|error:" "$OUT_FILE" | head -50 || true
