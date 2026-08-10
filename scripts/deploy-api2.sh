#!/usr/bin/env bash
# Deploy apps/api2 (Better Auth + demo APIs, incl. LingMou avatar session) to prod.
# Plain Node service under systemd; do NOT build on the host.
#
# Usage:
#   ./scripts/deploy-api2.sh
#   DEPLOY_HOST=root@60.205.9.135 ./scripts/deploy-api2.sh
#
# Optional:
#   SKIP_ENV=1            do not sync LingMou/DashScope secrets into the remote .env
#   SSH_KEY=~/.ssh/id_ed25519
#   DEPLOY_FE_IMPORT=1    also run fequiz full import + AI preprocessing (slow) after migrate
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
  # fequiz 前端面试题库（学前端）— 服务器 MySQL
  FEQUIZ_MYSQL_URL
  FEQUIZ_MYSQL_HOST
  FEQUIZ_MYSQL_PORT
  FEQUIZ_MYSQL_USER
  FEQUIZ_MYSQL_PASSWORD
  FEQUIZ_MYSQL_DATABASE
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
"${SSH[@]}" "$DEPLOY_HOST" REMOTE_DIR="$REMOTE_DIR" DEPLOY_FE_IMPORT="${DEPLOY_FE_IMPORT:-0}" bash -s <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"
npm ci --omit=dev

# fequiz（学前端）初始化：建表 + 种子题（幂等）。MySQL 未配置时只告警，不阻塞主服务。
if npm run fe:migrate >/tmp/fe-migrate.log 2>&1; then
  echo "==> fequiz migrate OK"
else
  echo "WARN: fe:migrate 失败（检查 .env 中 FEQUIZ_MYSQL_* 与服务器 MySQL），日志: /tmp/fe-migrate.log" >&2
fi
# 可选：全量导入 web-interview + AI 全量预处理（耗时长）。
# 用法：DEPLOY_FE_IMPORT=1 ./scripts/deploy-api2.sh
if [ "${DEPLOY_FE_IMPORT:-0}" = "1" ]; then
  echo "==> fequiz 全量导入 + 预处理（耗时较长，请耐心）..."
  if npm run fe:import >/tmp/fe-import.log 2>&1; then
    echo "==> fequiz import+preprocess OK"
  else
    echo "WARN: fe:import 失败，日志: /tmp/fe-import.log" >&2
  fi
fi

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

# ── Nginx snippet ──
echo "==> Apply nginx api2 snippet..."
SNIPPET_SRC="$ROOT/deploy/api2-nginx-snippet.conf"
SNIPPET_B64="$(base64 < "$SNIPPET_SRC" | tr -d '\n')"
"${SSH[@]}" "$DEPLOY_HOST" bash -s <<REMOTE
set -euo pipefail
CONF="/etc/nginx/conf.d/lilnong.top-https.conf"
STAMP="\$(date +%Y%m%d-%H%M%S)"
cp -a "\$CONF" "\${CONF}.bak-api2-\${STAMP}"

python3 - <<'PY'
from pathlib import Path
import base64, re

conf = Path("/etc/nginx/conf.d/lilnong.top-https.conf")
text = conf.read_text()
snippet = base64.b64decode("$SNIPPET_B64").decode()

# Collect api2 location names from the snippet
api2_locs = set()
for m in re.finditer(r'location\s+(\^~\s+)?(\S+)\s*\{', snippet):
    api2_locs.add(m.group(2))

# Remove any existing api2 location blocks we manage (by location prefix/keyword)
existing_locs = set()
for m in re.finditer(r'(location\s+(?:\^~\s+)?)(\S+)\s*\{', text):
    existing_locs.add(m.group(2))

# Areas managed by this snippet: everything before the snippet block + existing api2 locs
managed_locs = api2_locs | {l for l in existing_locs if l in api2_locs}

# Remove previously inserted api2 block
marker_start = "# --- api2 managed locations (auto by deploy-api2.sh) ---"
marker_end = "# --- end api2 managed locations ---"
if marker_start in text and marker_end in text:
    before, _, after = text.partition(marker_start + "\n")
    _, _, after = after.partition(marker_end + "\n")
    # Also remove existing api2-managed location blocks outside the markers (older scheme)
    lines = before.split("\n")
    new_lines = []
    skip = False
    for line in lines:
        for loc in managed_locs:
            loc_prefix = f"location ^~ {loc}" if loc.startswith('/') and loc.endswith('*') else f"location {loc}"
            exact_prefix = f"location = {loc}"
            prefix_prefix = f"location ^~ {loc}"
            if line.strip() == loc_prefix or line.strip() == exact_prefix or line.strip() == prefix_prefix:
                skip = True
                break
        if skip:
            if '}' in line and line.strip() == '}':
                skip = False
            continue
        new_lines.append(line)
    before = "\n".join(new_lines)
    text = before + "\n" + after

# Build the snippet block
block_lines = [marker_start]
for line in snippet.strip().splitlines():
    block_lines.append("    " + line if line.strip() else "")
block_lines.append("    " + marker_end)

# Insert before the legacy /api/ location
anchor = "location ^~ /api/ {"
if anchor not in text:
    raise SystemExit("anchor 'location ^~ /api/' not found in nginx conf")
text = text.replace(anchor, "\n".join(block_lines) + "\n\n    " + anchor, 1)

conf.write_text(text)
print("api2 locations refreshed in nginx conf")
PY

nginx -t
systemctl reload nginx
echo "nginx reloaded with api2 snippet"
REMOTE

echo "==> Public smoke (health only; avatar session is paid, not auto-hit)..."
curl -sS "https://www.lilnong.top/api/health" -o /dev/null -w "api/health HTTP %{http_code}\n" || true

echo "==> Done."
