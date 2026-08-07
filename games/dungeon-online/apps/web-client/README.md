# Dungeon Online 浏览器试玩版

> 这是最小可运行救火版（Canvas + 原生 WebSocket），让你能在浏览器里立刻试玩核心循环。Godot 4 客户端仍作为正式客户端继续迭代。

## 启动方式（共 3 步）

### 1. 起 dungeon-server（开发免登录模式）

```bash
cd games/dungeon-online/apps/dungeon-server
DEV_SKIP_AUTH=true PORT=3010 node --experimental-strip-types src/server.ts
```

看到日志 `dungeon-server listening on http://127.0.0.1:3010 (ws /ws/dungeon)` 即成功。

### 2. 起静态文件服务

```bash
cd games/dungeon-online/apps/web-client
python3 -m http.server 8080
```

### 3. 浏览器打开

```
http://localhost:8080/index.html
```

如果服务端改了端口，用 URL 参数指定：
```
http://localhost:8080/index.html?server=ws://localhost:3010
```

## 操作

- `WASD` / `方向键`：移动
- `空格` / `J`：攻击

## 当前状态

- 单人自动建房 + 开局（私密房，seat 0 为房主）
- 服务端权威 30Hz，客户端只渲染快照（纪律 B）
- 已渲染：玩家/敌人/telegraph 危险区/HP 条/护盾/嘲讽标记
- 数据面为二进制 `world.snap`，控制面为 JSON `type`

## 已知临时限制

- 这是最小版本，插值、音效、完整 UI 尚未实现。
- 需 `DEV_SKIP_AUTH=true` 才能用浏览器直接进（生产应走正式鉴权）。
