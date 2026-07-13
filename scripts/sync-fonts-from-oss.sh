#!/usr/bin/env bash
# Download private/fonts from OSS into API assets/fonts (for /createfont).
# Does not commit fonts to git — run on the API host or a private machine.
#
# Required env: OSS_ENDPOINT OSS_BUCKET OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET
# Optional:
#   FONT_DEST   default: apps/api/assets/fonts (relative to repo) or /opt/lilnong-api/assets/fonts
#   OSS_PREFIX  default: private/fonts
#   OSSUTIL

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FONT_DEST="${FONT_DEST:-$ROOT/apps/api/assets/fonts}"
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

if [[ ! -x "$OSSUTIL" ]]; then
  echo "ossutil not found: $OSSUTIL" >&2
  exit 1
fi

mkdir -p "$FONT_DEST"
CONFIG="$(mktemp)"
trap 'rm -f "$CONFIG"' EXIT

cat > "$CONFIG" <<EOF
[Credentials]
language=CH
endpoint=https://${OSS_ENDPOINT}
accessKeyID=${OSS_ACCESS_KEY_ID}
accessKeySecret=${OSS_ACCESS_KEY_SECRET}
EOF

echo "From: oss://${OSS_BUCKET}/${OSS_PREFIX}/"
echo "To:   $FONT_DEST"

"$OSSUTIL" -c "$CONFIG" cp -r "oss://${OSS_BUCKET}/${OSS_PREFIX}/" "$FONT_DEST/" \
  --update \
  --jobs 4 \
  --parallel 3

# Keep a stable default for createfont
if [[ -f "$FONT_DEST/font.ttf" ]]; then
  echo "default font.ttf present"
fi

ls -lh "$FONT_DEST" | head -30
echo "Done."
