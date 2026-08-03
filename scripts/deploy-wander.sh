#!/usr/bin/env bash
# Deploy apps/wander to production (rsync + systemd + nginx).
#
# Usage:
#   ./scripts/deploy-wander.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/deploy-wander.sh
#
# Optional:
#   SKIP_NGINX=1   skip nginx snippet apply
#   SSH_KEY=~/.ssh/id_ed25519

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lilnong-wander}"
SRC="$ROOT/apps/wander"
UNIT_SRC="$ROOT/deploy/lilnong-wander.service"
SNIPPET_SRC="$ROOT/deploy/wander-nginx-snippet.conf"
SSH_BASE=( -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30 -o IPQoS=none )
SSH=(ssh "${SSH_BASE[@]}")
RSYNC_SSH="ssh ${SSH_BASE[*]}"

cd "$ROOT"

if [[ ! -d "$SRC/src" ]]; then
  echo "Missing $SRC/src" >&2
  exit 1
fi

echo "==> Checking SSH..."
"${SSH[@]}" "$DEPLOY_HOST" "echo ssh-ok; mkdir -p '$REMOTE_DIR'"

echo "==> rsync wander → $DEPLOY_HOST:$REMOTE_DIR ..."
rsync -az --delete --human-readable --progress \
  --exclude 'node_modules/' \
  --exclude '.env' \
  --exclude '*.log' \
  -e "$RSYNC_SSH" \
  "$SRC"/ "$DEPLOY_HOST:$REMOTE_DIR/"

echo "==> Install deps + ensure .env + systemd unit..."
"${SSH[@]}" "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
REMOTE_DIR="$REMOTE_DIR"
cd "\$REMOTE_DIR"
npm ci --omit=dev

if [[ ! -f .env ]]; then
  TOKEN="\$(openssl rand -hex 24)"
  cat > .env <<EOF
PORT=3004
API2_BASE_URL=http://127.0.0.1:3002
SESSION_CACHE_TTL_MS=300000
SESSION_RECHECK_EVERY_ACTIONS=10
WORLD_WIDTH=1000
WORLD_HEIGHT=1000
MAX_WORLD_SIZE=1000000
DISCONNECT_GRACE_MS=30000
RECONNECT_TOKEN_TTL_MS=1800000
INTERNAL_ADMIN_TOKEN=\$TOKEN
DEV_SKIP_AUTH=false
MAX_PLAYERS_PER_ROOM=50
PUBLIC_ROOM_CODE=PUBLIC
ROOM_IDLE_TTL_MS=1800000
EOF
  echo "Created \$REMOTE_DIR/.env"
else
  if grep -q '^DEV_SKIP_AUTH=true' .env; then
    sed -i 's/^DEV_SKIP_AUTH=true/DEV_SKIP_AUTH=false/' .env
    echo "Forced DEV_SKIP_AUTH=false in existing .env"
  fi
fi
chmod 600 .env

install -m 644 /dev/stdin /etc/systemd/system/lilnong-wander.service <<'UNIT'
$(cat "$UNIT_SRC")
UNIT

systemctl daemon-reload
systemctl enable lilnong-wander.service
systemctl restart lilnong-wander.service
sleep 1
systemctl is-active lilnong-wander.service
curl -sf http://127.0.0.1:3004/healthz
echo
REMOTE

if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
  echo "==> Apply nginx wander snippet..."
  SNIPPET_B64="$(base64 < "$SNIPPET_SRC" | tr -d '\n')"
  "${SSH[@]}" "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
CONF="/etc/nginx/conf.d/lilnong.top-https.conf"
STAMP="\$(date +%Y%m%d-%H%M%S)"
cp -a "\$CONF" "\${CONF}.bak-wander-\${STAMP}"

python3 - <<'PY'
from pathlib import Path
import base64

conf = Path("/etc/nginx/conf.d/lilnong.top-https.conf")
text = conf.read_text()
snippet = base64.b64decode("$SNIPPET_B64").decode()

marker = "# wander-realtime (auto)"
if marker in text or "location = /ws/wander" in text:
    print("nginx wander locations already present; skip insert")
else:
    block = f"\n    {marker}\n" + "\n".join(
        ("    " + line if line.strip() else line) for line in snippet.strip().splitlines()
    ) + "\n"
    anchor = "    location ^~ /api/auth {"
    if anchor not in text:
        raise SystemExit("anchor location ^~ /api/auth not found")
    text = text.replace(anchor, block + "\n" + anchor, 1)
    conf.write_text(text)
    print("inserted wander locations before /api/auth")

PY

nginx -t
systemctl reload nginx
echo "nginx reloaded"
REMOTE
fi

echo "==> Public smoke..."
curl -sI "https://www.lilnong.top/wander/" | head -5 || true
"${SSH[@]}" "$DEPLOY_HOST" "curl -sf http://127.0.0.1:3004/healthz; echo; systemctl --no-pager status lilnong-wander.service | head -12"

echo "==> Done."
