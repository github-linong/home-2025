#!/usr/bin/env bash
# ============================================================================
# 部署数据库定时备份到阿里云 OSS（只部署脚本 + crontab）
# 说明: OSS 凭证由管理员手动配置（见下方步骤 3 的提示）
#
# 用法: ./scripts/setup-backup.sh
# ============================================================================
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_HOST="${DEPLOY_HOST:-root@60.205.9.135}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"
LOCAL_SCRIPT="$ROOT/scripts/backup-db.sh"
SSH_BASE=( -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=30 )
SSH=(ssh "${SSH_BASE[@]}")

# ── 1. 上传备份脚本 ──────────────────────────────────────────────────────────
echo "==> Upload backup-db.sh → $DEPLOY_HOST:/opt/lilnong-db-backup/ ..."
"${SSH[@]}" "$DEPLOY_HOST" "mkdir -p /opt/lilnong-db-backup /var/backups/lilnong-db"
rsync -az -e "ssh ${SSH_BASE[*]}" "$LOCAL_SCRIPT" "$DEPLOY_HOST:/opt/lilnong-db-backup/db-backup.sh"

# ── 2. 服务器端配置（MySQL 凭证 + crontab） ──────────────────────────────────
"${SSH[@]}" "$DEPLOY_HOST" bash -s <<'REMOTE'
set -euo pipefail
cd /opt/lilnong-db-backup

# 2a. MySQL 凭证文件（chmod 600）
#     fequiz 用户 → fequiz 库；site 用户 → personal_site 库
if [[ ! -f /opt/lilnong-db-backup/mysql.env ]]; then
  echo "==> Create MySQL credential file ..."
  cat > /opt/lilnong-db-backup/mysql.env <<'MYSQLEOF'
# MySQL 备份凭证（只读即可；chmod 600）
# 格式: MYSQL_BACKUPS=( "用户|密码|库1,库2" ... )
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_BACKUPS=(
  "fequiz|fequiz2026prod|fequiz"
  "site|fd4f176d71ca04d6a7569a52efb5a480|personal_site"
)
MYSQLEOF
  chmod 600 /opt/lilnong-db-backup/mysql.env
  echo "   created mysql.env (fequiz + site 用户)"
else
  echo "   mysql.env already exists, keep as-is"
fi

# 2b. 脚本可执行 + 语法校验
chmod +x /opt/lilnong-db-backup/db-backup.sh
bash -n /opt/lilnong-db-backup/db-backup.sh && echo "   script syntax OK"

# 2c. crontab 定时（默认每天 02:30）
echo "==> Setup crontab (daily 02:30)..."
TMP_CRON="$(mktemp)"
crontab -l 2>/dev/null | grep -v 'lilnong-db-backup/db-backup.sh' > "$TMP_CRON" || true
echo "30 2 * * * /opt/lilnong-db-backup/db-backup.sh >> /var/log/lilnong-db-backup.log 2>&1" >> "$TMP_CRON"
crontab "$TMP_CRON"
rm -f "$TMP_CRON"
echo "   crontab installed:"
crontab -l | grep db-backup || true

echo "==> Done."
REMOTE

# ── 3. 提示手动配置 OSS ──────────────────────────────────────────────────────
cat <<'PROMPT'
============================================================
 下一步（你手动执行）— 配置服务器 ossutil 凭证
============================================================

SSH 到服务器后运行：

  ossutil config -e oss-cn-beijing.aliyuncs.com \
      -i <你的AccessKeyId> -k <你的AccessKeySecret>

验证：

  ossutil ls oss://hone-2023/

（若 AccessKey 拥有 hone-2023 的读写权限即可）

然后手动跑一次备份验证:

  bash /opt/lilnong-db-backup/db-backup.sh
  cat /var/log/lilnong-db-backup.log

============================================================
PROMPT
