#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
OUT_DIR="$ROOT_DIR/ios/.pod-debug"
mkdir -p "$OUT_DIR"
REPORT="$OUT_DIR/react-core-failure-diff.txt"

pick_latest_two_logs() {
  ls -1t /tmp/xb*.log /tmp/xb?.log /tmp/xbc.log /tmp/xbb.log /tmp/xba.log 2>/dev/null | awk '!seen[$0]++' | head -n 2
}

LOG_NEW="${1:-}"
LOG_OLD="${2:-}"

if [[ -z "$LOG_NEW" || -z "$LOG_OLD" ]]; then
  logs_raw="$(pick_latest_two_logs)"
  LOG_NEW="$(echo "$logs_raw" | sed -n '1p')"
  LOG_OLD="$(echo "$logs_raw" | sed -n '2p')"
  if [[ -z "$LOG_NEW" || -z "$LOG_OLD" ]]; then
    echo "Need two logs. Usage: bash ios/scripts/compare-react-core-failures.sh /tmp/new.log /tmp/old.log"
    exit 1
  fi
fi

if [[ ! -f "$LOG_NEW" || ! -f "$LOG_OLD" ]]; then
  echo "Both logs must exist"
  echo "new=$LOG_NEW"
  echo "old=$LOG_OLD"
  exit 1
fi

extract_errors() {
  local f="$1"
  grep -nE '^/.*:([0-9]+:){1,2} (fatal error|error):' "$f" || true
}

extract_first_target_near_error() {
  local f="$1"
  local line
  line="$(extract_errors "$f" | head -n 1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    echo "unknown"
    return
  fi
  local start=$(( line > 15 ? line - 15 : 1 ))
  local end=$(( line + 15 ))
  sed -n "${start},${end}p" "$f" | grep -oE "in target '[^']+' from project 'Pods'" | head -n 1 || echo "unknown"
}

extract_first_resp_near_error() {
  local f="$1"
  local line
  line="$(extract_errors "$f" | head -n 1 | cut -d: -f1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
    return
  fi
  local start=$(( line > 60 ? line - 60 : 1 ))
  local end=$(( line + 60 ))
  sed -n "${start},${end}p" "$f" | grep -oE '/tmp/[^ ]*common-args\.resp' | head -n 1 || true
}

dump_resp_paths() {
  local resp="$1"
  if [[ -z "$resp" || ! -f "$resp" ]]; then
    echo "(missing resp)"
    return
  fi
  {
    echo "--- -I include paths ---"
    tr ' ' '\n' < "$resp" | grep '^-I' || true
    echo "--- -F framework paths ---"
    tr ' ' '\n' < "$resp" | grep '^-F' || true
  }
}

NEW_ERRORS="$(extract_errors "$LOG_NEW")"
OLD_ERRORS="$(extract_errors "$LOG_OLD")"
NEW_TARGET="$(extract_first_target_near_error "$LOG_NEW")"
OLD_TARGET="$(extract_first_target_near_error "$LOG_OLD")"
NEW_RESP="$(extract_first_resp_near_error "$LOG_NEW")"
OLD_RESP="$(extract_first_resp_near_error "$LOG_OLD")"

TMP_NEW="$(mktemp)"
TMP_OLD="$(mktemp)"
trap 'rm -f "$TMP_NEW" "$TMP_OLD"' EXIT

dump_resp_paths "$NEW_RESP" > "$TMP_NEW"
dump_resp_paths "$OLD_RESP" > "$TMP_OLD"

{
  echo "new_log=$LOG_NEW"
  echo "old_log=$LOG_OLD"
  echo "new_target=$NEW_TARGET"
  echo "old_target=$OLD_TARGET"
  echo "new_resp=${NEW_RESP:-missing}"
  echo "old_resp=${OLD_RESP:-missing}"
  echo
  echo "==== first-errors (new) ===="
  echo "$NEW_ERRORS" | head -n 12
  echo
  echo "==== first-errors (old) ===="
  echo "$OLD_ERRORS" | head -n 12
  echo
  echo "==== diff errors (old -> new) ===="
  diff -u <(echo "$OLD_ERRORS") <(echo "$NEW_ERRORS") || true
  echo
  echo "==== diff response include/framework paths (old -> new) ===="
  diff -u "$TMP_OLD" "$TMP_NEW" || true
} > "$REPORT"

echo "Wrote diff report: $REPORT"
head -n 80 "$REPORT"
