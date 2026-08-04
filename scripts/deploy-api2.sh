#!/usr/bin/env bash
# Deploy apps/api2 (Better Auth + demo APIs, incl. LingMou avatar session) to prod.
# Plain Node service under systemd; do NOT build on the host.
#
# Usage:
#   ./scripts/deploy-api2.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/deploy-api2.sh
#
# Optional:
#   SKIP_ENV=1     do not sync LingMou/DashScope secrets into the remote .env
#   SSH_KEY=~/.ssh/id_ed25519
#
# The remote .env (Better Auth prod config) is never overwritten wholesale — this
# script only upserts the demo API keys listed in ENV_KEYS below.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lilnong-api2}"
SRC="$ROOT/apps/api2"
UNIT_SRC="$ROOT/deploy/lilnong-api2.service"
LOCAL_ENV="$SRC/.env"
SSH_BASE=( -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30 -o IPQoS=none )
SSH=(ssh "${SSH_BASE[@]}")
RSYNC_SSH="ssh ${SSH_BASE[*]}"

# Only these keys are pushed from the local .env to the remote .env.
ENV_KEYS=(
  ALIBABA_CLOUD_ACCESS_KEY_ID
  ALIBABA_CLOUD_ACCESS_KEY_SECRET
  LINGMOU_ENDPOINT
  LINGMOU_CHAT_PROJECT_ID
  LINGMOU_INSTANCE_ID
  LINGMOU_SDK_LICENSE
  LINGMOU_PLATFORM
  DASHSCOPE_API_KEY
  DASHSCOPE_LLM_ENDPOINT
  DASHSCOPE_LLM_MODEL
  DASHSCOPE_TTS_ENDPOINT
  DASHSCOPE_WORKSPACE_ID
  DASHSCOPE_TTS_MODEL
  DASHSCOPE_TTS_VOICE
  TENCENT_MAP_KEY
)

cd "$ROOT"

if [[ ! -d "$SRC/src" ]]; then
  echo "Missing $SRC/src" >&2
  exit 1
fi

echo "==> Checking SSH..."
"${SSH[@]}" "$DEPLOY_HOST" "echo ssh-ok; mkdir -p '$REMOTE_DIR'"

echo "==> rsync api2 → $DEPLOY_HOST:$REMOTE_DIR ..."
rsync -az --delete --human-readable --progress \
  --exclude 'node_modules/' \
  --exclude '.env' \
  --exclude 'data/' \
  --exclude '*.log' \
  -e "$RSYNC_SSH" \
  "$SRC"/ "$DEPLOY_HOST:$REMOTE_DIR/"

# Upsert demo API env keys into the remote .env without touching other lines.
if [[ "${SKIP_ENV:-0}" != "1" ]]; then
  if [[ ! -f "$LOCAL_ENV" ]]; then
    echo "WARN: $LOCAL_ENV not found; skipping env sync." >&2
  else
    echo "==> Syncing demo API env keys into remote .env: ${ENV_KEYS[*]}"
    ENV_LINES=""
    for key in "${ENV_KEYS[@]}"; do
      line="$(grep -E "^${key}=" "$LOCAL_ENV" | tail -n1 || true)"
      if [[ -n "$line" ]]; then
        ENV_LINES+="$line"$'\n'
      else
        echo "   - $key: (empty locally, skipped)"
      fi
    done
    ENV_B64="$(printf '%s' "$ENV_LINES" | base64 | tr -d '\n')"
    "${SSH[@]}" "$DEPLOY_HOST" ENV_B64="$ENV_B64" REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
touch .env
STAMP="$(date +%Y%m%d-%H%M%S)"
cp -a .env ".env.bak-avatar-${STAMP}"
printf '%s' "$ENV_B64" | base64 -d > /tmp/avatar-env.$$
while IFS= read -r line; do
  [[ -z "$line" ]] && continue
  key="${line%%=*}"
  # Drop any existing definition, then append the fresh one.
  grep -vE "^${key}=" .env > .env.tmp || true
  mv .env.tmp .env
  printf '%s\n' "$line" >> .env
  echo "   set ${key}"
done < /tmp/avatar-env.$$
rm -f /tmp/avatar-env.$$
chmod 600 .env
REMOTE
  fi
fi

echo "==> Install deps + systemd unit + restart..."
# 单独 rsync 单元文件（避免在外层 heredoc 内再嵌套 heredoc 导致脚本外泄到本地执行）。
rsync -az -e "$RSYNC_SSH" "$UNIT_SRC" "$DEPLOY_HOST:/etc/systemd/system/lilnong-api2.service"
"${SSH[@]}" "$DEPLOY_HOST" REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
npm ci --omit=dev
systemctl daemon-reload
systemctl enable lilnong-api2.service
systemctl restart lilnong-api2.service
# 重启后有短暂预热，轮询等待真正 active 再探活，避免 1s 竞态误判失败。
for i in $(seq 1 20); do
  [ "$(systemctl is-active lilnong-api2.service)" = "active" ] && break
  sleep 1
done
systemctl is-active lilnong-api2.service
for i in $(seq 1 20); do
  curl -sf -o /dev/null http://127.0.0.1:3002/api/health && break
  sleep 1
done
curl -sf http://127.0.0.1:3002/api/health && echo
REMOTE

echo "==> Public smoke (health only; avatar session is paid, not auto-hit)..."
curl -sS "https://www.lilnong.top/api/health" -o /dev/null -w "api/health HTTP %{http_code}\n" || true

echo "==> Done."
