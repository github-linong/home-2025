#!/usr/bin/env bash
# ============================================================================
# lilnong.top 数据库定时备份 → 阿里云 OSS
# ============================================================================
# 备份对象:
#   MySQL      : fequiz, personal_site
#   PostgreSQL : lilnong_auth, jjc_npl, jjc_spot_trading
# 上传到 OSS  : oss://hone-2023/backups/db/<YYYY-MM-DD>/
# 保留策略    : 本地 7 天, OSS 30 天
#
# 依赖:
#   - mysqldump / pg_dump
#   - ossutil 已配置 (~/.ossutilconfig)
#   - 凭证来源: /opt/lilnong-db-backup/mysql.env (MySQL), pg 用 postgres 系统用户
# ============================================================================
set -euo pipefail

# ── 配置 ─────────────────────────────────────────────────────────────────────
OSS_BUCKET="hone-2023"
OSS_PREFIX="backups/db"
KEEP_LOCAL_DAYS=7
KEEP_OSS_DAYS=30
BACKUP_ROOT="/var/backups/lilnong-db"
CRED_DIR="/opt/lilnong-db-backup"
MYSQL_ENV="$CRED_DIR/mysql.env"
LOG_FILE="/var/log/lilnong-db-backup.log"

# ── 初始化 ───────────────────────────────────────────────────────────────────
DATE_STR="$(date +%Y-%m-%d)"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/$DATE_STR"
mkdir -p "$BACKUP_DIR"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"; }

# 加载 MySQL 凭证（root 专属文件, chmod 600）
# 格式: MYSQL_BACKUPS 为多行 "用户|密码|库1,库2"（fequiz 只读即可）
if [[ -f "$MYSQL_ENV" ]]; then
  # shellcheck disable=SC1090
  source "$MYSQL_ENV"
else
  log "WARN: $MYSQL_ENV not found, MySQL backup skipped"
fi

MYSQL_HOST="${MYSQL_HOST:-127.0.0.1}"
MYSQL_PORT="${MYSQL_PORT:-3306}"

# ── 备份函数 ─────────────────────────────────────────────────────────────────
dump_mysql() {
  local user="$1" pass="$2" db="$3"
  local out="$BACKUP_DIR/mysql_${db}.sql"
  if mysqldump --no-tablespaces --single-transaction --quick \
    -h "$MYSQL_HOST" -P "$MYSQL_PORT" -u "$user" \
    ${pass:+ -p"$pass"} "$db" > "$out" 2>/dev/null; then
    log "OK   mysql:$db → $(du -h "$out" | cut -f1)"
  else
    log "FAIL mysql:$db"
    rm -f "$out"
  fi
}

dump_pg() {
  local db="$1"
  local out="$BACKUP_DIR/pg_${db}.sql"
  # 用 postgres 系统用户避免密码落盘
  if su - postgres -c "pg_dump --no-owner -d $db" > "$out" 2>/dev/null; then
    log "OK   pg:$db → $(du -h "$out" | cut -f1)"
  else
    log "FAIL pg:$db"
    rm -f "$out"
  fi
}

# ── 执行备份 ─────────────────────────────────────────────────────────────────
log "=== Backup start: $DATE_STR $STAMP ==="

# MySQL — 遍历 MYSQL_BACKUPS（默认 fequiz 用户，若管理员未配置扩展则跳过 personal_site）
MYSQL_DEFAULT_USER="${MYSQL_USER:-fequiz}"
MYSQL_DEFAULT_PASSWORD="${MYSQL_PASSWORD:-fequiz2026prod}"
if [[ "${#MYSQL_BACKUPS[@]}" -gt 0 ]]; then
  for entry in "${MYSQL_BACKUPS[@]}"; do
    IFS='|' read -r mu mp dbs <<< "$entry"
    for db in ${dbs//,/ }; do
      dump_mysql "$mu" "$mp" "$db"
    done
  done
else
  # 兼容单用户配置
  for db in fequiz personal_site; do
    dump_mysql "$MYSQL_DEFAULT_USER" "$MYSQL_DEFAULT_PASSWORD" "$db"
  done
fi

# PostgreSQL
dump_pg "lilnong_auth"
dump_pg "jjc_npl"
dump_pg "jjc_spot_trading"

# ── 压缩并上传 OSS ───────────────────────────────────────────────────────────
log "Compressing..."
TAR_FILE="$BACKUP_ROOT/${DATE_STR}.tar.gz"
tar -czf "$TAR_FILE" -C "$BACKUP_DIR" . 2>/dev/null
log "OK   tar → $TAR_FILE ($(du -h "$TAR_FILE" | cut -f1))"

log "Uploading to oss://$OSS_BUCKET/$OSS_PREFIX/$DATE_STR/ ..."
if ossutil cp "$TAR_FILE" "oss://$OSS_BUCKET/$OSS_PREFIX/$DATE_STR/" \
    --update -f 2>>"$LOG_FILE" | tail -1 >>"$LOG_FILE"; then
  log "OK   uploaded"
else
  log "FAIL upload to OSS"
fi

# ── 清理旧备份 ───────────────────────────────────────────────────────────────
# 本地: 仅保留最近 KEEP_LOCAL_DAYS 天
find "$BACKUP_ROOT" -maxdepth 1 -name '*.tar.gz' -mtime "+$KEEP_LOCAL_DAYS" -delete 2>/dev/null || true
# OSS: 删除超过 KEEP_OSS_DAYS 天的目录
for old_date in $(ossutil ls "oss://$OSS_BUCKET/$OSS_PREFIX/" 2>/dev/null \
  | grep -oE "[0-9]{4}-[0-9]{2}-[0-9]{2}/" | sort -u); do
  old_day="$(echo "$old_date" | tr -d '/')"
  if [[ $(date -d "$old_day" +%s 2>/dev/null || echo 0) -lt $(date -d "-${KEEP_OSS_DAYS} days" +%s 2>/dev/null || echo 0) ]]; then
    log "Cleanup OSS: $old_date"
    ossutil rm "oss://$OSS_BUCKET/$OSS_PREFIX/$old_date" -r -f >>"$LOG_FILE" 2>&1 || true
  fi
done

log "=== Backup done ==="
