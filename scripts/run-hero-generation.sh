#!/usr/bin/env bash
# Chunked hero generation — survives by restarting node every N items.
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/heroes-gen.log
: > "$LOG"

run_coll() {
  local only=$1
  local dir=$2
  local total
  total=$(ls "$dir"/*.md | wc -l | tr -d " ")
  echo "=== $only total=$total ===" | tee -a "$LOG"
  local offset=0
  while [ "$offset" -lt "$total" ]; do
    echo "--- $only offset=$offset $(date '+%H:%M:%S') ---" | tee -a "$LOG"
    if ! node scripts/generate-hero-images.mjs --write --force --only="$only" --offset="$offset" --limit=60 --concurrency=2 >>"$LOG" 2>&1; then
      echo "chunk failed at $only:$offset, retry once" | tee -a "$LOG"
      node scripts/generate-hero-images.mjs --write --force --only="$only" --offset="$offset" --limit=60 --concurrency=1 >>"$LOG" 2>&1 || {
        echo "FATAL at $only:$offset" | tee -a "$LOG"
        exit 1
      }
    fi
    offset=$((offset + 60))
  done
}

run_coll blog apps/web/src/content/blog
run_coll demo apps/web/src/content/demos
echo "DONE $(date)" | tee -a "$LOG"
