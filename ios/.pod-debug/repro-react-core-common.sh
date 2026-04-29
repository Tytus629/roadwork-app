#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
SUMMARY="$ROOT_DIR/.pod-debug/react-core-common-failure-summary.txt"

if [[ ! -f "$SUMMARY" ]]; then
  echo "Summary file not found: $SUMMARY"
  exit 1
fi

resp_file="$(grep '^resp_file=' "$SUMMARY" | sed 's/^resp_file=//' || true)"
src_file="$(grep '^src_file=' "$SUMMARY" | sed 's/^src_file=//' || true)"

if [[ -z "$resp_file" || "$resp_file" == "not-found" || ! -f "$resp_file" ]]; then
  echo "Response file missing. Re-run extraction after a failed build."
  exit 1
fi
if [[ -z "$src_file" || "$src_file" == "not-found" || ! -f "$src_file" ]]; then
  echo "Source file missing. Re-run extraction after a failed build."
  exit 1
fi

clang_bin="$(xcrun --find clang)"
sdk_path="$(xcrun --sdk iphonesimulator --show-sdk-path)"
out_log="/tmp/react-core-common-repro-$(date +%s).log"

{
  echo "clang=$clang_bin"
  echo "sdk=$sdk_path"
  echo "resp=$resp_file"
  echo "src=$src_file"
  echo
  echo "Running: $clang_bin -isysroot $sdk_path @${resp_file} -v -H -E $src_file -o /dev/null"
  "$clang_bin" -isysroot "$sdk_path" @"$resp_file" -v -H -E "$src_file" -o /dev/null
} > "$out_log" 2>&1 || true

echo "Repro output written to: $out_log"
grep -E "fatal error| error: |search starts here|End of search list" "$out_log" | head -80 || true
