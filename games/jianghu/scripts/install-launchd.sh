#!/usr/bin/env bash
# 江湖 jianghu 服务端常驻安装（launchd LaunchAgent）
# 解决：对话环境的后台进程跨轮会被回收 → 游戏服务端(:3011)频繁"连不上"。
# 用法：在【你自己的终端】执行一次：  bash games/jianghu/scripts/install-launchd.sh
# 效果：开机自启 + 进程崩溃/被杀自动拉起；不再依赖任何 AI 会话。
# 卸载：bash games/jianghu/scripts/install-launchd.sh --uninstall
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PLIST="$HOME/Library/LaunchAgents/com.linong.jianghu.plist"
LABEL="com.linong.jianghu"
NODE_BIN="$(command -v node || echo /Users/lnmacmini/.workbuddy/binaries/node/versions/22.22.2/bin/node)"

if [ "${1:-}" = "--uninstall" ]; then
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
  rm -f "$PLIST"
  echo "✅ 已卸载（服务已停止，端口 3011 释放）"
  exit 0
fi

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>$LABEL</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>--experimental-strip-types</string>
        <string>src/server.ts</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$ROOT/apps/jianghu</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>DEV_SKIP_AUTH</key>
        <string>true</string>
        <key>JIANGHU_JSON_STORE_DIR</key>
        <string>$ROOT/data</string>
        <key>PORT</key>
        <string>3011</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$ROOT/data/launchd.log</string>
    <key>StandardErrorPath</key>
    <string>$ROOT/data/launchd.log</string>
</dict>
</plist>
PLISTEOF

mkdir -p "$ROOT/data"
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✅ LaunchAgent 已安装并启动"
sleep 2
if nc -z 127.0.0.1 3011 2>/dev/null; then
  echo "✅ 服务端 :3011 已就绪（开机自启 + 崩溃自动拉起）"
  echo "   可玩地址: http://localhost:8081/index.html?devUserId=dev"
else
  echo "⚠ 服务端未就绪，查看日志: $ROOT/data/launchd.log"
fi
