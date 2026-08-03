#!/usr/bin/env zsh
# dev.sh — 一键启动开发环境（tmux 多窗口）
# 用法:
#   ./scripts/dev.sh              # 启动全部服务
#   ./scripts/dev.sh web api2     # 只启动 web 和 api2
#   ./scripts/dev.sh --list       # 列出可用服务
#   ./scripts/dev.sh --stop       # 停止并销毁会话

set -eo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SESSION="personal-site-dev"

# ── 服务注册表 ──────────────────────────────────────
# 格式: 名称|目录|命令|描述
SERVICES=(
  "web|apps/web|npm run dev|Astro 站点 (:4321)"
  "api|apps/api|npm run dev|Legacy API (:3001)"
  "api2|apps/api2|npm run dev|API2 + Auth"
  "poker|apps/poker-realtime|npm run dev|德州扑克 WebSocket"
  "chat|apps/chat|npm run dev|聊天 WebSocket"
  "wander|apps/wander|npm run dev|Wander 游戏 WebSocket"
)

# 默认启动顺序（与注册表顺序一致）

# ── 辅助函数 ────────────────────────────────────────
get_field() {
  # $1=entry  $2=field(1-4)
  echo "$1" | awk -F'|' "{print \$$2}"
}

usage_list() {
  echo "可用服务:"
  for entry in "${SERVICES[@]}"; do
    name=$(get_field "$entry" 1)
    dir=$(get_field "$entry" 2)
    desc=$(get_field "$entry" 4)
    printf "  %-10s %-24s %s\n" "$name" "$desc" "($dir)"
  done
}

stop_session() {
  if tmux has-session -t "$SESSION" 2>/dev/null; then
    tmux kill-session -t "$SESSION"
    echo "已停止会话: $SESSION"
  else
    echo "会话 $SESSION 不存在"
  fi
}

find_service() {
  # $1=name → 打印匹配的 entry，找不到返回 1
  for entry in "${SERVICES[@]}"; do
    if [[ "$(get_field "$entry" 1)" == "$1" ]]; then
      echo "$entry"
      return 0
    fi
  done
  return 1
}

# ── 参数解析 ────────────────────────────────────────
case "${1:-}" in
  --list|-l)
    usage_list
    exit 0
    ;;
  --stop|-s)
    stop_session
    exit 0
    ;;
  --help|-h)
    echo "用法: $0 [服务...]"
    echo "      $0 --list       列出可用服务"
    echo "      $0 --stop       停止开发会话"
    echo ""
    echo "不传参数则启动全部服务。"
    exit 0
    ;;
esac

# 确定要启动的服务
if [[ $# -gt 0 ]]; then
  SELECTED_NAMES=("$@")
  # 校验
  for s in "${SELECTED_NAMES[@]}"; do
    if ! find_service "$s" > /dev/null 2>&1; then
      echo "未知服务: $s"
      usage_list
      exit 1
    fi
  done
else
  SELECTED_NAMES=()
  for entry in "${SERVICES[@]}"; do
    SELECTED_NAMES+=("$(get_field "$entry" 1)")
  done
fi

# ── 检查 tmux ──────────────────────────────────────
if ! command -v tmux &>/dev/null; then
  echo "错误: 未安装 tmux"
  echo "  brew install tmux"
  exit 1
fi

# 如果会话已存在，直接 attach
if tmux has-session -t "$SESSION" 2>/dev/null; then
  echo "会话 $SESSION 已存在，直接 attach..."
  tmux attach -t "$SESSION"
  exit 0
fi

# ── 创建 tmux 会话 ─────────────────────────────────
echo "创建开发会话: $SESSION"
echo "启动服务: ${SELECTED_NAMES[*]}"
echo ""

first=true
for name in "${SELECTED_NAMES[@]}"; do
  entry=$(find_service "$name")
  dir="$ROOT/$(get_field "$entry" 2)"
  cmd=$(get_field "$entry" 3)

  if $first; then
    tmux new-session -d -s "$SESSION" -n "$name" -c "$dir" \
      "$cmd; exec zsh"
    first=false
  else
    tmux new-window -t "$SESSION" -n "$name" -c "$dir" \
      "$cmd; exec zsh"
  fi
done

# 选中第一个窗口
tmux select-window -t "$SESSION":0

# Attach 并显示信息
echo "开发环境已就绪！按 Ctrl-b d 分离，按 Ctrl-b w 切换窗口"
echo ""
i=0
for name in "${SELECTED_NAMES[@]}"; do
  entry=$(find_service "$name")
  desc=$(get_field "$entry" 4)
  printf "  [%d] %-10s %s\n" "$i" "$name" "$desc"
  ((i++)) || true
done
echo ""
tmux attach -t "$SESSION"
