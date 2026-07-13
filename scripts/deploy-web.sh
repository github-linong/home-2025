#!/usr/bin/env bash
# Deploy lilnong.top web: always build locally, then upload to the server.
# Do NOT build on the production host (low memory).
#
# Usage:
#   ./scripts/deploy-web.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/deploy-web.sh
#
# Optional:
#   SKIP_BUILD=1   reuse existing apps/web/dist
#   SSH_KEY=~/.ssh/id_ed25519

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
WEB_ROOT="${WEB_ROOT:-/var/www/lilnong.top}"
DIST="$ROOT/apps/web/dist"
TGZ="/tmp/lilnong-dist-$$.tgz"
SSH=(ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)
SCP=(scp -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

cleanup() { rm -f "$TGZ"; }
trap cleanup EXIT

cd "$ROOT"

if [[ "${SKIP_BUILD:-0}" != "1" ]]; then
  echo "==> Building apps/web locally..."
  if command -v nvm >/dev/null 2>&1 || [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1090
    source "$HOME/.nvm/nvm.sh" 2>/dev/null || true
    nvm use 22 >/dev/null 2>&1 || true
  fi
  npm run build:web
fi

if [[ ! -d "$DIST" ]]; then
  echo "Missing $DIST — run without SKIP_BUILD=1" >&2
  exit 1
fi

echo "==> Packaging dist ($(du -sh "$DIST" | cut -f1))..."
tar czf "$TGZ" -C "$DIST" .

echo "==> Backing up remote $WEB_ROOT ..."
"${SSH[@]}" "$DEPLOY_HOST" "ts=\$(date +%Y%m%d-%H%M%S); cp -a '$WEB_ROOT' '${WEB_ROOT}.backup-'\$ts; echo backup=\$ts"

echo "==> Uploading to $DEPLOY_HOST ..."
"${SCP[@]}" "$TGZ" "$DEPLOY_HOST:/tmp/lilnong-dist.tgz"

echo "==> Extracting on server ..."
"${SSH[@]}" "$DEPLOY_HOST" "set -e
  rm -rf '$WEB_ROOT'/*
  tar xzf /tmp/lilnong-dist.tgz -C '$WEB_ROOT'
  rm -f /tmp/lilnong-dist.tgz
  du -sh '$WEB_ROOT'
  test -f '$WEB_ROOT/index.html'
"

echo "==> Done. Smoke check:"
curl -sI "https://www.lilnong.top/" | head -5
curl -sI "https://www.lilnong.top/demos/" | head -5
