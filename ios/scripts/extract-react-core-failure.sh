#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ios/.pod-debug"
mkdir -p "$OUT_DIR"

pick_latest_log() {
  local explicit="${1:-}"
  if [[ -n "$explicit" && -f "$explicit" ]]; then
    echo "$explicit"
    return
  fi

  local candidate
  candidate="$(ls -1t /tmp/xb*.log /tmp/xb?.log /tmp/xbc.log /tmp/xbb.log /tmp/xba.log 2>/dev/null | head -n 1 || true)"
  if [[ -n "$candidate" && -f "$candidate" ]]; then
    echo "$candidate"
    return
  fi

  echo ""
}

LOG_PATH="$(pick_latest_log "${1:-}")"
if [[ -z "$LOG_PATH" ]]; then
  echo "No build log found. Pass a log path explicitly:"
  echo "  bash ios/scripts/extract-react-core-failure.sh /tmp/your.log"
  exit 1
fi

SUMMARY_PATH="$OUT_DIR/react-core-common-failure-summary.txt"
REPRO_PATH="$OUT_DIR/repro-react-core-common.sh"

first_react_error_line=""
while IFS=: read -r ln _; do
  ctx_start=$(( ln > 10 ? ln - 10 : 1 ))
  ctx_end=$(( ln + 10 ))
  if sed -n "${ctx_start},${ctx_end}p" "$LOG_PATH" | grep -q "React-Core.common.*from project 'Pods'"; then
    first_react_error_line="$ln"
    break
  fi
done < <(grep -nE '^/.*:([0-9]+:){1,2} (fatal error|error):' "$LOG_PATH" || true)

if [[ -z "$first_react_error_line" ]]; then
  first_react_error_line="$(grep -nE '^/.*:([0-9]+:){1,2} (fatal error|error):' "$LOG_PATH" | head -n 1 | cut -d: -f1 || true)"
fi

if [[ -z "$first_react_error_line" ]]; then
  {
    echo "log=$LOG_PATH"
    echo "status=no-errors-found"
  } > "$SUMMARY_PATH"
  echo "No error lines found in $LOG_PATH"
  echo "Wrote: $SUMMARY_PATH"
  exit 0
fi

start=$(( first_react_error_line > 40 ? first_react_error_line - 40 : 1 ))
end=$(( first_react_error_line + 80 ))

resp_file="$(sed -n "${start},${end}p" "$LOG_PATH" | grep -o '/tmp/[^ ]*common-args\.resp' | head -n 1 || true)"
src_file="$(sed -n "${start},${end}p" "$LOG_PATH" | grep -oE '/Users/[^ ]+\.(m|mm|c|cc|cpp|S)' | head -n 1 || true)"
if [[ -z "$src_file" ]]; then
  src_file="$(sed -n "${start},${end}p" "$LOG_PATH" | grep -oE '/Users/[^ ]+' | grep -E '\.(m|mm|c|cc|cpp|S)$' | head -n 1 || true)"
fi

{
  echo "log=$LOG_PATH"
  echo "first_error_line=$first_react_error_line"
  echo "resp_file=${resp_file:-not-found}"
  echo "src_file=${src_file:-not-found}"
  echo
  echo "==== error-context ===="
  sed -n "${start},${end}p" "$LOG_PATH"
} > "$SUMMARY_PATH"

cat > "$REPRO_PATH" <<'EOF'
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
EOF

{
  echo "Wrote summary: $SUMMARY_PATH"
  echo "Wrote repro script: $REPRO_PATH"
  echo "Source log: $LOG_PATH"
}