#!/usr/bin/env bash
# Upload lilnong/static/font to Aliyun OSS private prefix (not public-read).
#
# Required env (or loaded from server-style .env):
#   OSS_ENDPOINT / OSS_BUCKET / OSS_ACCESS_KEY_ID / OSS_ACCESS_KEY_SECRET
#
# Optional:
#   FONT_SRC     default: /tmp/home-2023-inspect/123.56.16.33/lilnong/static/font
#   OSS_PREFIX   default: private/fonts
#   OSSUTIL      path to ossutil binary
#
# Usage:
#   export OSS_ACCESS_KEY_ID=... OSS_ACCESS_KEY_SECRET=...
#   ./scripts/sync-fonts-to-oss.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_SRC="${FONT_SRC:-/tmp/home-2023-inspect/123.56.16.33/lilnong/static/font}"
OSS_PREFIX="${OSS_PREFIX:-private/fonts}"
OSS_ENDPOINT="${OSS_ENDPOINT:-oss-cn-beijing.aliyuncs.com}"
OSS_BUCKET="${OSS_BUCKET:-hone-2023}"
OSSUTIL="${OSSUTIL:-/tmp/ossutil-bin/ossutil-v1.7.18-mac-arm64/ossutilmac64}"

for var in OSS_ENDPOINT OSS_BUCKET OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing env: $var" >&2
    exit 1
  fi
done

if [[ ! -d "$FONT_SRC" ]]; then
  echo "Font source not found: $FONT_SRC" >&2
  exit 1
fi

if [[ ! -x "$OSSUTIL" ]]; then
  echo "ossutil not found: $OSSUTIL" >&2
  exit 1
fi

CONFIG="$(mktemp)"
trap 'rm -f "$CONFIG"' EXIT

cat > "$CONFIG" <<EOF
[Credentials]
language=CH
endpoint=https://${OSS_ENDPOINT}
accessKeyID=${OSS_ACCESS_KEY_ID}
accessKeySecret=${OSS_ACCESS_KEY_SECRET}
EOF

echo "Source:  $FONT_SRC ($(du -sh "$FONT_SRC" | awk '{print $1}'))"
echo "Target:  oss://${OSS_BUCKET}/${OSS_PREFIX}/ (private)"
echo "Starting upload..."

"$OSSUTIL" -c "$CONFIG" cp -r "$FONT_SRC/" "oss://${OSS_BUCKET}/${OSS_PREFIX}/" \
  --update \
  --jobs 4 \
  --parallel 3 \
  --checkpoint-dir "/tmp/ossutil-checkpoint-fonts-${OSS_BUCKET}"

echo "Done. Objects are private — use AK or signed URL to download."
echo "On API server, sync with: ./scripts/sync-fonts-from-oss.sh"
