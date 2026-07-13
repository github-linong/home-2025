#!/usr/bin/env bash
# Upload home-2023 lilnong/static to Aliyun OSS (prefix: static/)
#
# Required env:
#   OSS_ENDPOINT   e.g. oss-cn-beijing.aliyuncs.com
#   OSS_BUCKET     e.g. lilnong-static
#   OSS_ACCESS_KEY_ID
#   OSS_ACCESS_KEY_SECRET
#
# Optional:
#   STATIC_SRC     local static directory (default below)
#   OSS_PREFIX     object prefix (default: static)
#   OSSUTIL        path to ossutilmac64 binary
#
# Usage:
#   export OSS_ENDPOINT=oss-cn-beijing.aliyuncs.com
#   export OSS_BUCKET=your-bucket
#   export OSS_ACCESS_KEY_ID=...
#   export OSS_ACCESS_KEY_SECRET=...
#   ./scripts/upload-static-to-oss.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
STATIC_SRC="${STATIC_SRC:-$ROOT/../home-2023/123.56.16.33/lilnong/static}"
STATIC_SRC="${STATIC_SRC:-/tmp/home-2023-inspect/123.56.16.33/lilnong/static}"
OSS_PREFIX="${OSS_PREFIX:-static}"
OSSUTIL="${OSSUTIL:-/tmp/ossutil-bin/ossutil-v1.7.18-mac-arm64/ossutilmac64}"

for var in OSS_ENDPOINT OSS_BUCKET OSS_ACCESS_KEY_ID OSS_ACCESS_KEY_SECRET; do
  if [[ -z "${!var:-}" ]]; then
    echo "Missing env: $var" >&2
    exit 1
  fi
done

if [[ ! -d "$STATIC_SRC" ]]; then
  echo "Static source not found: $STATIC_SRC" >&2
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

echo "Source:  $STATIC_SRC ($(du -sh "$STATIC_SRC" | awk '{print $1}'))"
echo "Target:  oss://${OSS_BUCKET}/${OSS_PREFIX}/"
echo "Starting upload..."

"$OSSUTIL" -c "$CONFIG" cp -r "$STATIC_SRC/" "oss://${OSS_BUCKET}/${OSS_PREFIX}/" \
  --update \
  --jobs 10 \
  --parallel 5 \
  --checkpoint-dir "/tmp/ossutil-checkpoint-${OSS_BUCKET}"

echo "Done. Sample URL:"
echo "  https://${OSS_BUCKET}.${OSS_ENDPOINT}/${OSS_PREFIX}/html/"
