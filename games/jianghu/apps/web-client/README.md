# 江湖 jianghu · 浏览器客户端 C1（第一个可玩版）

> 目标：零安装即玩 —— 浏览器打开即连真实 jianghu 权威服务端，看到/玩到 **主世界移动 + 技能 + 进副本**。
> 自包含单文件（Canvas 2D + WebSocket，内联 CSS/JS，**无构建步骤**）。本版含 **STOP 协议修复**（服务端 `sim-core` + 客户端同步升级，见 §3 / §5）。

---

## 1. 快速开始（3 步）

### ① 起 jianghu 服务端（终端 A）

```bash
cd games/jianghu/apps/jianghu
DEV_SKIP_AUTH=true PORT=3011 node --experimental-strip-types src/server.ts
```

- 端口默认 **3011**（`src/config.ts`：`port: num("PORT", 3011)`）。
- `DEV_SKIP_AUTH=true` 免登录（config 默认也是开启，除非显式 `DEV_SKIP_AUTH=false`；建议显式传，语义清晰）。
- 启动日志应看到：`server listening on :3011 (ws /ws/jianghu)` + `RESIDENT run ticking @ 12Hz`。

### ② 静态服务本目录（终端 B，任选其一）

```bash
cd games/jianghu/apps/web-client
python3 -m http.server 8080
# 或：npx serve . -l 8080
```

### ③ 浏览器打开

```
http://localhost:8080/index.html
```

即自动连接 `ws://localhost:3011/ws/jianghu?devUserId=dev` 并进入主世界。

**可选 URL 参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `server` | `ws://localhost:3011` | 覆盖服务端地址（如 `?server=ws://192.168.1.5:3011`） |
| `devUserId` | `dev` | 开发身份（免登录）；换一个即换一个角色座位 |
| `debug` | 关 | `?debug=1` 打开调试钩子（E2E/排障用，见 §4） |

> 直接双击 `index.html`（`file://`）通常也能跑，但个别浏览器对 `file://` 页发起 WebSocket 有 Origin 限制，**推荐静态服务**。

---

## 2. 操作说明

| 操作 | 按键 | 说明 |
|---|---|---|
| 移动 | `W A S D` / 方向键 | 8 向移动（按住持续移动，12Hz 上报；松开即发 STOP 立即停） |
| 格挡 | `空格` / 格挡按钮 | 服务端开 250ms 格挡窗口（PARRY_TICKS=3）；窗口内减伤 60%，角色出现青蓝护盾光环 |
| 技能 1-4 | `1 2 3 4` / 按钮 | 服务端权威 AoE 命中（半径 1.5 tile）；按钮显示剩余 CD（来自快照 `skillCd`，tick→秒） |
| 进副本 | 走到裂隙入口附近 → `F` 或「进副本」按钮 | 发 `dungeon.enter`；服务端校验主世界 + 入口 10s 冷却（`tryEnterEntrance`） |
| 出本 | 副本内按 `F` 或「出本」按钮 | 发 `dungeon.exit`，回主世界安全区 |
| 缩放 / 平移 | 滚轮 / 拖拽；双击回中 | 摄像机跟随本地玩家 |
| 小地图 | 右上角 | 玩家/敌人/BOSS/掉落/入口着色点位 + 视野框 |

**HUD**：顶部 = 连接状态 / 房间（主世界·副本）/ tick / 实体数 / 本地 HP 条 / 格挡态 / 技能 CD；底部 = 技能栏。

**配色（placeholder，对齐 art-bible）**：玩家=青蓝方块；敌人=红圆（精英=钢蓝+青环）；BOSS=深绯大圆+金环；地面掉落=稀有度菱形（白 `#D8D2C4` / 蓝 `#4C7FD6` / 金 `#F2A03C` / 暗金 `#C8324A`）+ itemId 标签；入口=紫青旋转裂隙。

---

## 3. 协议解析要点（实测帧结构，客户端 `decodeSnapshot` 与服务端 `protocol-binary.ts` 对称）

**双平面**：控制面 JSON（显式 `type`）；数据面二进制（`ws.binaryType='arraybuffer'`，`ws.send(Buffer)`）。

**连接时序**：`connect(/ws/jianghu?devUserId=)` → 收 `session.ready`（含 `seatId/tickMs=83.33/tickRate=12`）→ 发 `room.join` → 收 `room.join.ok`（`roomId=room_resident_public` + `reconnectToken`）→ 持续收二进制快照（12Hz，主世界含 4 个漂浮 LOOT_GROUND + 1 个 ENTRANCE + 自己）。

**二进制快照帧**（全量帧；msgType 判别）：

```
[msgType:u8=0x01][tick:u32 LE][entityCount:u16 LE]
+ 每实体：
  [id:u16][changeMask:u16][pos.x:i16][pos.y:i16][kind:u8][dir:u8]
  [hp:u16][maxHp:u16][status:u16][seCount:u8][(type:u8, remainingTicks:u16) × seCount]
  + 条件字段（changeMask 位决定，编码侧恒含 POS|KIND|DIR|VITALS|STATUS_EFFECTS）：
    bit5 OWNER      u16 ownerId
    bit6 PARRY      u8 active + u32 windowEndTick
    bit7 LOOT       u32 itemId + u8 rarity + u8 affixCount + u8×affixes + u16 ttlTicks
    bit8 TELEGRAPH  u8 shape + u8 color + u32 startTick + u32 applyTick + u16 radius
    bit9 ENTRANCE   u16 cooldownTicks + u32 lastUsedTick
    bit10 TIER      u8 tier (0 normal / 1 elite / 2 boss)
    bit11 SKILL_CD  u16×4 skillCd
    bit12 ATTRS     u8 str + u8 dex + u8 vit
```

**kind**：0=PLAYER 1=ENEMY 2=BOSS 3=LOOT_GROUND 4=TELEGRAPH 5=ENTRANCE。

**输入**（`gateway.routeInput` 只读 `msg.payload?.cmd`，**放顶层会被静默丢弃**）：

```js
ws.send(JSON.stringify({
  type: 'input.cmd',
  payload: { cmd: { seq: 1, tick: <lastTick>, action: 0, dir: 0 } }   // seq 严格递增
}));
```

- `action`：0=MOVE 1=PARRY 2..5=SKILL1..4 6=SIGNAL 7=STOP（技能须带 `skillSlot: 0..3`）。
- `dir`：0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE（顺时针，屏幕坐标 y 向下）。
- **STOP（7）**：全部移动键松开 / 失焦 / 切页 / 断连前，客户端发 `action:7`；服务端 `world.enqueueInput` 清该 seat 的 `pending` + `lastMove`，下一 tick 起立即停（不再沿最后 MOVE 惯性滑行）。STOP 也走同一 `seq` 单调计数（C11），回退 seq 不生效。
- **客户端不锁 target、不发伤害量** —— 技能命中/格挡/伤害全部服务端权威（`combat.resolveSkill`/`resolveDamage` 按范围结算）。

**进本/出本**：

```js
{ type:'dungeon.enter', requestId, payload:{ entranceId:1 } }   // → dungeon.enter.ok(roomId, reconnectToken)
{ type:'dungeon.exit',  requestId }                             // → dungeon.exit.ok(roomId=RESIDENT)
```

**重连**：断线自动重连（1s→5s 退避）→ 新连接 `session.ready` 后发 `session.reconnect { payload:{ roomId, reconnectToken } }` → `session.reconnect.ok`（原副本存活则回副本；已销毁则 `fellBackToResident` 回主世界，服务端 `validateReconnect` 校验 token 寿命）。

---

## 4. 调试 / 自动化钩子（`?debug=1`）

页面暴露 `window.__game`：

```js
GAME.connected / state / seatId / roomId / reconnectToken / lastSnapshot / localEntityId
GAME.snapshotCount / lastTick / skillCd / parryActive / localHp / localMaxHp / lastLocalPos
GAME.errors          // 收集的运行时/解码错误
GAME.debugEnterDungeon() / GAME.debugExitDungeon()   // 强制进出本（绕过「靠近入口」UI 门槛）
GAME.sendMove(dir) / GAME.sendSkill(slot) / GAME.sendParry()
```

---

## 5. 已知限制（MVP，Phase-2 待办）

1. ~~松开方向键后角色惯性滑行~~（**P0 已修复**）：新增 `InputAction.STOP=7`，客户端在全部移动键松开 / 失焦 / 切页 / 断连前发 STOP，服务端 `world.enqueueInput` 清 `pending` + `lastMove` 立即停。残余边界：`beforeunload` 的 STOP 为尽力而为（浏览器不保证送达）；纯网络断线（非主动关闭）时 STOP 无法发出，服务端仍按 `DISCONNECT_GRACE_MS`（30s）后清理玩家——如需断线即停，后续可在服务端 `markDisconnected` 时清该玩家 `lastMove`。
2. **无本地预测 / 回正**：所有实体（含本地玩家）都按 100ms 插值缓冲渲染，输入→画面有 ~100ms+RTT 延迟（手感待调）。Phase-2 再做客户端预测 + 服务端回正。
3. **无角色名**：协议未下发 displayName，玩家/敌人仅以形状+HP 条区分。
4. **diff/ChangeBit Phase-2**：当前客户端解析全量帧（服务端当前也发全量），后续服务端切 delta 需同步升级解码。
5. **TELEGRAPH 实体**：服务端当前未生成 telegraph（预留 kind=4），客户端已支持渲染（红/青预警圈），后续 BOSS 战启用。
6. **入口冷却 UI**：`entrance.cooldownTicks` 已读取并显示，但进本门槛主要靠「靠近 + 服务端冷却」；多人「集合缓冲取先到者」归 Phase-2。
7. **游客模式**：`devUserId` 缺省时服务端按游客处理（`guest_*`，零持久写），但 C1 客户端默认传 `devUserId=dev`（登录态，seatId 稳定、便于定位本地实体）。

---

## 6. 验证（真连真实服务端）

- **服务端回归**：`cd apps/jianghu && npm test` → **全绿（124 + STOP 新增用例）**（本版含 sim-core STOP 协议修复）。
- **C1 E2E**（`verify-e2e.mjs`，Puppeteer 真连真实 jianghu 服务端，puppeteer@24 + Chrome for Testing）：自管进程（起 jianghu 服务 + 静态服务 + Puppeteer）→ 断言链：连接→`session.ready`→`room.join`→收二进制快照→MOVE→SKILL1→**真实输入 walk+F 进副本**→副本内 SKILL1 命中敌人（HP 30→10，服务端权威）→出本→CDP 模拟断网→自动重连（`session.reconnect`）；截图存 `verify/01-overworld.png` / `02-dungeon.png` / `03-after-exit.png` / `04-final.png`。当前最新结果：**12/12 PASS**（含零 pageerror / GAME.errors / console.error）。退出码 0=全绿。

  ```bash
  cd games/jianghu/apps/web-client
  node verify-e2e.mjs --port 3011 --static 8090   # 默认 headless，加 --headed 可观察
  ```
