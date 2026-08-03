#!/usr/bin/env bash
# Deploy apps/chat to production (rsync + systemd + nginx).
#
# Usage:
#   ./scripts/deploy-chat.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/deploy-chat.sh
#
# Optional:
#   SKIP_NGINX=1   skip nginx snippet apply
#   SKIP_ENV=1     do not sync optional MYSQL_* keys from local .env
#   SSH_KEY=~/.ssh/id_ed25519

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lilnong-chat}"
SRC="$ROOT/apps/chat"
UNIT_SRC="$ROOT/deploy/lilnong-chat.service"
SNIPPET_SRC="$ROOT/deploy/chat-nginx-snippet.conf"
LOCAL_ENV="$SRC/.env"
SSH_BASE=( -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30 -o IPQoS=none )
SSH=(ssh "${SSH_BASE[@]}")
RSYNC_SSH="ssh ${SSH_BASE[*]}"

ENV_KEYS=(
  MYSQL_HOST
  MYSQL_PORT
  MYSQL_DATABASE
  MYSQL_USER
  MYSQL_PASSWORD
  CHAT_MYSQL_POOL
)

cd "$ROOT"

if [[ ! -d "$SRC/src" ]]; then
  echo "Missing $SRC/src" >&2
  exit 1
fi

echo "==> Checking SSH..."
"${SSH[@]}" "$DEPLOY_HOST" "echo ssh-ok; mkdir -p '$REMOTE_DIR'"

echo "==> rsync chat → $DEPLOY_HOST:$REMOTE_DIR ..."
rsync -az --delete --human-readable --progress \
  --exclude 'node_modules/' \
  --exclude '.env' \
  --exclude '*.log' \
  -e "$RSYNC_SSH" \
  "$SRC"/ "$DEPLOY_HOST:$REMOTE_DIR/"

if [[ "${SKIP_ENV:-0}" != "1" && -f "$LOCAL_ENV" ]]; then
  echo "==> Syncing optional MYSQL env keys into remote .env (if set locally)..."
  ENV_LINES=""
  for key in "${ENV_KEYS[@]}"; do
    line="$(grep -E "^${key}=" "$LOCAL_ENV" | tail -n1 || true)"
    [[ -n "$line" ]] && ENV_LINES+="$line"$'\n'
  done
  if [[ -n "$ENV_LINES" ]]; then
    ENV_B64="$(printf '%s' "$ENV_LINES" | base64 | tr -d '\n')"
    "${SSH[@]}" "$DEPLOY_HOST" ENV_B64="$ENV_B64" REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
touch .env
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a .env ".env.bak-chat-${STAMP}"
printf '%s' "$ENV_B64" | base64 -d > /tmp/chat-env.$$
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  grep -vE "^${key}=" .env > .env.tmp || true
  mv .env.tmp .env
  printf '%s\n' "$line" >> .env
  echo "   set ${key}"
done < /tmp/chat-env.$$
rm -f /tmp/chat-env.$$
chmod 600 .env
REMOTE
  fi
fi

echo "==> Install deps + ensure .env + systemd unit..."
"${SSH[@]}" "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
REMOTE_DIR="$REMOTE_DIR"
cd "\$REMOTE_DIR"
npm ci --omit=dev

if [[ ! -f .env ]]; then
  TOKEN="\$(openssl rand -hex 24)"
  cat > .env <<EOF
PORT=3005
API2_BASE_URL=http://127.0.0.1:3002
SESSION_CACHE_TTL_MS=300000
SESSION_RECHECK_EVERY_ACTIONS=20
CHAT_PING_MS=20000
CHAT_PONG_MS=60000
CHAT_MAX_MSG_BYTES=16384
CHAT_MAX_TEXT=2000
CHAT_HISTORY=200
CHAT_RATE_WINDOW_MS=10000
CHAT_RATE_MAX=30
CHAT_RATE_IP_MAX=150
CHAT_PRESENCE_DEBOUNCE_MS=400
INTERNAL_ADMIN_TOKEN=\$TOKEN
DEV_SKIP_AUTH=false
GROUP_MAX_MEMBERS=50
GROUP_INVITE_CODE_LENGTH=6
GROUP_META_TTL_MS=604800000
EOF
  echo "Created \$REMOTE_DIR/.env"
else
  if grep -q '^DEV_SKIP_AUTH=true' .env; then
    sed -i 's/^DEV_SKIP_AUTH=true/DEV_SKIP_AUTH=false/' .env
    echo "Forced DEV_SKIP_AUTH=false in existing .env"
  fi
fi
chmod 600 .env

install -m 644 /dev/stdin /etc/systemd/system/lilnong-chat.service <<'UNIT'
$(cat "$UNIT_SRC")
UNIT

systemctl daemon-reload
systemctl enable lilnong-chat.service
systemctl restart lilnong-chat.service
sleep 1
systemctl is-active lilnong-chat.service
curl -sf http://127.0.0.1:3005/healthz
echo
REMOTE

if [[ "${SKIP_NGINX:-0}" != "1" ]]; then
  echo "==> Apply nginx chat snippet..."
  SNIPPET_B64="$(base64 < "$SNIPPET_SRC" | tr -d '\n')"
  "${SSH[@]}" "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
CONF="/etc/nginx/conf.d/lilnong.top-https.conf"
STAMP="\$(date +%Y%m%d-%H%M%S)"
cp -a "\$CONF" "\${CONF}.bak-chat-\${STAMP}"

python3 - <<'PY'
from pathlib import Path
import base64

conf = Path("/etc/nginx/conf.d/lilnong.top-https.conf")
text = conf.read_text()
snippet = base64.b64decode("$SNIPPET_B64").decode()

marker = "# chat-realtime (auto)"
if marker in text or "location = /ws/chat" in text:
    print("nginx chat locations already present; skip insert")
else:
    block = f"\n    {marker}\n" + "\n".join(
        ("    " + line if line.strip() else line) for line in snippet.strip().splitlines()
    ) + "\n"
    anchor = "    location ^~ /api/auth {"
    if anchor not in text:
        raise SystemExit("anchor location ^~ /api/auth not found")
    text = text.replace(anchor, block + "\n" + anchor, 1)
    conf.write_text(text)
    print("inserted chat locations before /api/auth")

PY

nginx -t
systemctl reload nginx
echo "nginx reloaded"
REMOTE
fi

echo "==> Public smoke..."
curl -sS "https://www.lilnong.top/api/chat/history?channel=public&limit=1" -o /dev/null -w "api/chat/history HTTP %{http_code}\n" || true
"${SSH[@]}" "$DEPLOY_HOST" "curl -sf http://127.0.0.1:3005/healthz; echo; systemctl --no-pager status lilnong-chat.service | head -12"

echo "==> Done."
