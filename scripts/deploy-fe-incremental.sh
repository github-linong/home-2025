#!/usr/bin/env bash
# 增量部署 fequiz 新题到生产：只传种子文件，不停服、不重建前端、不重装依赖。
#
# 适用场景：仅新增/修改了 src/fequiz/seed-*.json（如 beisen），无需全量 deploy:api2。
#
# 原理（已核对 src/fequiz/routes.js）：
#   - api2 的 /overview、/quiz 等接口每次请求实时查 MySQL，无启动期缓存、无前端预渲染；
#     数据写入生产库后线上立即可见，无需重启服务（systemd）或重建 apps/web。
#   - fe:migrate 按 slug 幂等写入（ON DUPLICATE KEY UPDATE），历史题重跑不会重复。
#   - fe:preprocess 只处理 processed=0 的新题，天然增量。
#
# 因此本脚本只做三件事：
#   1) rsync 仅同步 fequiz 种子文件（默认 beisen 的 seed + 改过的 migrate-fe.mjs）
#   2) 在 VPS 上跑 fe:migrate（写入新题，幂等）
#   3) 在 VPS 上跑 fe:preprocess（仅为新题生成 6 类题型变体）
# 不触碰 node_modules / 不重启服务 / 不重建前端 / 不更 nginx。
#
# Usage:
#   ./scripts/deploy-fe-incremental.sh                 # 默认同步并导入 beisen
#   ./scripts/deploy-fe-incremental.sh <seed路径...>    # 指定其它/多个 seed 文件
#   DEPLOY_HOST=root@1.2.3.4 ./scripts/deploy-fe-incremental.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
REMOTE_DIR="${REMOTE_DIR:-/opt/lilnong-api2}"
SRC="$ROOT/apps/api2"
SSH_BASE=( -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ServerAliveInterval=15 -o ServerAliveCountMax=6 -o ConnectTimeout=30 -o IPQoS=none )
SSH=(ssh "${SSH_BASE[@]}")
RSYNC_SSH="ssh ${SSH_BASE[*]}"

# 默认增量同步全部 seed-*.json（migrate 按 slug 幂等，多传无害）+ 改过的 migrate-fe.mjs
SEED_FILES=("$@")
if [ ${#SEED_FILES[@]} -eq 0 ]; then
  shopt -s nullglob
  SEED_FILES=("$SRC"/src/fequiz/seed-*.json)
  SEED_FILES+=("$SRC/src/fequiz/migrate-fe.mjs")
  shopt -u nullglob
fi

cd "$ROOT"

echo "==> Checking SSH..."
"${SSH[@]}" "$DEPLOY_HOST" "echo ssh-ok; mkdir -p '$REMOTE_DIR/src/fequiz'"

echo "==> rsync only fequiz seed files → $DEPLOY_HOST:$REMOTE_DIR/src/fequiz/ ..."
for f in "${SEED_FILES[@]}"; do
  [ -f "$f" ] || { echo "Missing $f" >&2; exit 1; }
  rsync -az -e "$RSYNC_SSH" "$f" "$DEPLOY_HOST:$REMOTE_DIR/src/fequiz/$(basename "$f")"
  echo "   synced $(basename "$f")"
done

echo "==> Run migrate + preprocess on prod (NO restart, NO rebuild)..."
"${SSH[@]}" "$DEPLOY_HOST" REMOTE_DIR="$REMOTE_DIR" bash -s <<'REMOTE'
set -euo pipefail
cd "$REMOTE_DIR"

# 端口兜底：服务能跑说明 .env 端口本就对，这里仅在异常时修正。
MYSQL_PORT="$(ss -tlnp 2>/dev/null | grep -oP '127\.0\.0\.1:\K\d+(?=.*mysqld)' | head -1 || true)"
if [[ -z "$MYSQL_PORT" ]]; then
  MYSQL_PORT="$(ss -tlnp 2>/dev/null | grep -oP '\*?:\K3306(?=.*mysqld)' | head -1 || true)"
fi
if [[ -n "$MYSQL_PORT" ]]; then
  CUR="$(grep -oP '^FEQUIZ_MYSQL_PORT=\K.*' .env 2>/dev/null || true)"
  if [[ "$CUR" != "$MYSQL_PORT" ]]; then
    if grep -q '^FEQUIZ_MYSQL_PORT=' .env; then
      sed -i "s/^FEQUIZ_MYSQL_PORT=.*/FEQUIZ_MYSQL_PORT=$MYSQL_PORT/" .env
    else
      echo "FEQUIZ_MYSQL_PORT=$MYSQL_PORT" >> .env
    fi
    echo "   corrected FEQUIZ_MYSQL_PORT: ${CUR:-unset} -> $MYSQL_PORT"
  fi
fi

echo "==> fe:migrate (幂等，按 slug 写入新题)..."
npm run fe:migrate > /tmp/fe-migrate.log 2>&1 || { echo "ERR: fe:migrate failed"; tail -30 /tmp/fe-migrate.log; exit 1; }
tail -20 /tmp/fe-migrate.log

echo "==> fe:preprocess (只处理 processed=0 的新题)..."
npm run fe:preprocess > /tmp/fe-pre.log 2>&1 || { echo "ERR: fe:preprocess failed"; tail -40 /tmp/fe-pre.log; exit 1; }
tail -30 /tmp/fe-pre.log
REMOTE

echo "==> Public smoke (overview HTTP code)..."
curl -sS "https://www.lilnong.top/api/fequiz/overview" -o /dev/null -w "api/fequiz/overview HTTP %{http_code}\n" || true

echo "==> Done (incremental). New categories should appear online immediately — no restart needed."
