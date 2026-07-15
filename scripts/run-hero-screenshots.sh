#!/usr/bin/env bash
# Chunked live-screenshot regeneration for demos.
# Restarts Node each chunk so a wedged Chromium cannot poison the whole run.
set -u
cd "$(dirname "$0")/.."
LOG=/tmp/heroes-screenshots.log
: > "$LOG"

ONLY_FILE="${1:-}"
OFFSET_START="${2:-0}"
if [ -n "$ONLY_FILE" ] && [ -f "$ONLY_FILE" ]; then
  SLUG_ARGS=(--slugs-file="$ONLY_FILE")
  total=$(grep -c . "$ONLY_FILE" || true)
else
  SLUG_ARGS=()
  total=$(ls apps/web/src/content/demos/*.md | wc -l | tr -d " ")
fi

CHUNK=20
echo "=== demo screenshots total≈$total start=$OFFSET_START chunk=$CHUNK $(date) ===" | tee -a "$LOG"
offset=$OFFSET_START
while true; do
  echo "--- offset=$offset $(date '+%H:%M:%S') ---" | tee -a "$LOG"
  # Kill lingering chrome from previous wedge before each chunk
  pkill -9 -f 'puppeteer_dev_chrome_profile' 2>/dev/null || true
  sleep 0.5
  if ! node scripts/generate-hero-images.mjs \
      --write --force --only=demo --screenshots \
      --offset="$offset" --limit="$CHUNK" --concurrency=1 \
      "${SLUG_ARGS[@]}" >>"$LOG" 2>&1; then
    echo "chunk failed at offset=$offset, retry once" | tee -a "$LOG"
    pkill -9 -f 'puppeteer_dev_chrome_profile' 2>/dev/null || true
    sleep 1
    node scripts/generate-hero-images.mjs \
      --write --force --only=demo --screenshots \
      --offset="$offset" --limit="$CHUNK" --concurrency=1 \
      "${SLUG_ARGS[@]}" >>"$LOG" 2>&1 || {
        echo "FATAL at offset=$offset — continuing" | tee -a "$LOG"
      }
  fi
  last_jobs=$(tr '\r' '\n' < "$LOG" | awk '/^jobs=/{print}' | tail -1 | sed -n 's/jobs=\([0-9]*\).*/\1/p')
  echo "last_jobs=${last_jobs:-?}" | tee -a "$LOG"
  if [ -n "${last_jobs:-}" ] && [ "$last_jobs" -lt "$CHUNK" ]; then
    break
  fi
  offset=$((offset + CHUNK))
  if [ "$offset" -gt 5000 ]; then
    echo "safety stop" | tee -a "$LOG"
    break
  fi
done
echo "DONE $(date)" | tee -a "$LOG"
