#!/usr/bin/env bash
# 江湖 (jianghu) 一键启动：游戏服务端 :3011 + 客户端静态服务 :8081
# 幂等：端口已有服务则跳过，不重复起。用法：bash scripts/start-jianghu.sh
# 停止：kill $(lsof -t -iTCP:3011 -sTCP:LISTEN) ; kill $(lsof -t -iTCP:8081 -sTCP:LISTEN)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SERVER_PORT="${JIANGHU_PORT:-3011}"
CLIENT_PORT="${JIANGHU_CLIENT_PORT:-8081}"
NODE_BIN="${NODE_BIN:-node}"
PY_BIN="${PY_BIN:-python3}"

echo "== jianghu 一键启动 =="

if nc -z 127.0.0.1 "$SERVER_PORT" 2>/dev/null; then
  echo "  ✓ 服务端已在运行 :$SERVER_PORT (跳过)"
else
  echo "  ▶ 启动服务端 :$SERVER_PORT (DEV_SKIP_AUTH=true)..."
  (cd "$ROOT/apps/jianghu" && DEV_SKIP_AUTH=true nohup "$NODE_BIN" --experimental-strip-types src/server.ts >/tmp/jianghu-server.log 2>&1 &)
  sleep 1
  nc -z 127.0.0.1 "$SERVER_PORT" 2>/dev/null && echo "  ✓ 服务端已就绪" || echo "  ⚠ 服务端启动中，日志: /tmp/jianghu-server.log"
fi

if curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$CLIENT_PORT/index.html" 2>/dev/null; then
  echo "  ✓ 客户端已在运行 :$CLIENT_PORT (跳过)"
else
  echo "  ▶ 启动客户端静态服务 :$CLIENT_PORT..."
  (cd "$ROOT/apps/web-client" && nohup "$PY_BIN" -m http.server "$CLIENT_PORT" --bind 127.0.0.1 >/tmp/jianghu-client.log 2>&1 &)
  sleep 1
  curl -s -o /dev/null --max-time 2 "http://127.0.0.1:$CLIENT_PORT/index.html" 2>/dev/null && echo "  ✓ 客户端已就绪" || echo "  ⚠ 客户端启动中，日志: /tmp/jianghu-client.log"
fi

echo ""
echo "  → 浏览器打开:  http://localhost:$CLIENT_PORT/index.html?devUserId=dev   (带 devUserId = 登录态，可拾取/穿戴/保存)"
echo "  → 服务端 ws:    ws://localhost:$SERVER_PORT/ws/jianghu?devUserId=dev"
echo "  → 提示: 裸开(不带 devUserId) = 游客模式，拾取/装备不保存；开发环境免登录。"
