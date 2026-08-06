# D8 房间服务断线/重连接线（真实联机挂钩）· QA 计划

路径：production/qa-plan-d8.md ｜ 作者：严守真（quality-lead-11）｜ 状态：已落盘（Phase 5 质量循环）
对齐：epics **D8**（C3/C10 真实 socket 断线/重连 → 权威 `World.setDisconnected`）；系统⑩（房间/重连）；系统⑦（统一结算权威，`setDisconnected` 为唯一托管入口）；design gap **O-K6**；系统①（WorldSnapshot）；sim-core S7.6（`setDisconnected` 三者同发：跳过 tick + 暂停 DOWNED/救援计时 + 单次抓拍 PersonalState）。
运行环境：Node 22.22.2（本 review 实跑验证）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）；sim-core 无外部依赖。
约束：本文件仅评审与文档产出，**不修改任何 src/test 文件**（read-only review）。D8 不新增 sim-core 逻辑，仅新增 server 层接线 + 1 个端到端集成测试。
独立复验（2025-08-06，本 review 亲跑确认）：dungeon-server **28/28 #fail 0**；sim-core **51/51 #fail 0**；playtest 核心循环 **7/7 EXIT 0** 且 GOLDEN_PLAYTEST_HASH 字节相等。

---

## 0. 本 review 对 quality-lead-5 的更正（重要）

**quality-lead-5 的上一版 review 错误地标记「ws event → markDisconnected 胶水层是 pre-playtest TODO（未接）」。此结论不成立，本 review 经源码实读逐行确认该胶水**已落地**：**

- `apps/dungeon-server/src/gateway.ts:139`（ping 超时 timer 分支）与 `:167`（`ws.on("close")` 分支）**均已调用** `markDisconnected(room, verified.userId)`。
- `apps/dungeon-server/src/protocol.ts:199`（`case "session.reconnect"` 内）**已调用** `validateReconnect(...)`。
- 二者均经 `room-service.ts` 的 `applyWorldDisconnect(room, seatIndex, bool)`（L85）→ 权威 `World.setDisconnected(seatIndex, bool)`（room-service.ts:93）驱动真实 World。
- 桥接由 `server.ts:35` `setWorldResolver((roomId) => runManager.getWorld(roomId))` 注入（run-manager.ts `getWorld` L31 声明 / L76 实现）。

**结论：O-K6 在服务端层已真正端到端闭环（end-to-end CLOSED at the server layer）。** 不是 TODO，不是 DEFER——真实 socket 生命周期（close / ping-timeout / session.reconnect）已完整路由进已落的 `World.setDisconnected` 托管钩子。本 review 将此更正显式记录，以免遗留错误门禁结论。

---

## 1. D8 测试策略（四层映射）

D8 范围 = 把**真实** room-service 的断线/重连事件接到 E7 已落的 `World.setDisconnected`（系统⑦ 唯一托管入口）。D8 之前：hook 在 sim-core headless 层已验证，但 room-service 的 `markDisconnected`/`validateReconnect` 只翻房间座位状态，未驱动权威 World（E7 DEFER #1 / design-review O-D7）。D8 闭合该缺口：通过依赖注入 `worldResolver(roomId)` 桥接 run-manager 持有的权威 World，seatIndex === World 玩家 id 驱动 `setDisconnected`。

### 1.1 真实 socket 黏合（已实跑源码确认存在，非 D8 新写但归本 Epic 闭环）——O-K6 关键落点
- `gateway.ts` `ws.on("close")`（L164-169）：`clearInterval(pingTimer)` 后 `getRoom(conn.roomId)`，若房存在则 `markDisconnected(room, verified.userId)`（L167）。
- `gateway.ts` ping 超时 timer（L136-153）：`Date.now()-lastPong > pongTimeoutMs` 时 `getRoom` → `markDisconnected(room, verified.userId)`（L139）→ `ws.close(4000,"ping_timeout")`。
- `protocol.ts` `case "session.reconnect"`（L191-227）：L199 `validateReconnect(room, userId, seatIndex, reconnectToken, runId)` → `roomSnapshot` 广播 + 拉取 `runManager.getSnapshot` 全量 WorldSnapshot 经数据面下发。
- 两者最终都进 `applyWorldDisconnect`（room-service.ts L85）→ `World.setDisconnected`（L93）。故「真实 socket 断线/重连 → World 托管」在**接收层 + 房间层 + World 层三方**完整闭环。

### 1.2 端到端集成测试（integration，对应 C3/C10）— D8 主要新增覆盖
- **`apps/dungeon-server/tests/d8-disconnect-wiring.test.ts`（NEW，1 例，已实跑确认在 28 内）**：端到端驱动 run-manager + room-service，等价复刻 `server.ts` L35 的真实接线：
  - 桥接 `setWorldResolver((roomId) => runManager.getWorld(roomId))`。
  - 启动 2 玩家 run（`seatId === seatIndex === 0/1`，镜像 `protocol.ts` game.start）。
  - **spy 包裹 `world.setDisconnected`**（记录调用并透传真实实现）→ 证明 hook 被**真实触发，非橡皮图章**。
  - `markDisconnected(room, "A")` → 断言 ① hook 以 `(0, true)` 被调用；② World 内 A 实体 `disconnected === true`；③ 玩家 B 不受影响。
  - `validateReconnect(room, "A", 0, token, runId)` → 断言 ④ hook 以 `(0, false)` 被调用；⑤ A `disconnected === false`（恢复推进）；⑥ B 仍不受影响。
  - 还原 `setWorldResolver(null)`（防御，避免污染其他测试文件全局状态）。
  - 状态：已实跑确认（dungeon-server 28/28 含此 1 例）。

### 1.3 sim-core 单测（继承，S7.6/D8 三者同发 + 单次抓拍 + 重连不跳变）
D8 复用 E7 已落的 `setDisconnected` 机制，由 `downed-rescue.test.ts` 第 5 例 / e7-smoke 步骤 5 覆盖（D8 不重复实现）：
- `world.setDisconnected(true)`：单次抓拍 `PersonalState`（剩余窗口 = `DOWNED_TIMEOUT_TICKS - downedTicks`）。
- `world.step` 内 `if (a.disconnected) continue` 暂停 `downedTicks`/`rescueTicks` 推进；移动门控 `!a.disconnected` 跳过该 actor tick。
- 断开窗口内冻结不进 OUT；重连从剩余窗口续算无跳变。
- 状态：51/51 含（D8 机制在 sim-core 层已验证）。

### 1.4 确定性 golden（golden，对应 D9）
D8 不改 sim-core world 推进/移动/AI/前摇 → 双 golden 不变（E7 已锁，D8 不重锁）。状态：playtest 7/7 `golden match=true`。

### 1.5 性能 / 反作弊（perf / security）
- **C11 裁决真相源未变**：D8 仅置 `disconnected` 标记，不动伤害/血量；`combat.resolveDamage` 仍是唯一伤害裁决点。状态：✅ 继承（combat.test + playtest C11-amount 仍绿）。
- C5 perf（30Hz×4 二进制 diff 预算）：未做（R1 遗留）。状态：⏸ defer。

---

## 2. D8 ↔ 验收条件矩阵（O-K6 闭合计据）

| 门禁 | 验收条件（O-K6 落点） | 覆盖测试 | 状态 |
|---|---|---|---|
| C3 | socket 断线 → 权威 World 托管钩子（跳过 tick + 暂停 DOWNED/救援计时 + 抓拍 PersonalState） | d8-disconnect-wiring.test.ts（`markDisconnected → world.setDisconnected(0,true)` + spy 双证）+ sim-core `setDisconnected` 三者同发逻辑（world.ts）+ 真实 socket 黏合（gateway.ts L139/L167） | ✅ 已覆盖 |
| C10 | 重连 → 恢复推进（计时从剩余窗口续算，无跳变） | d8-disconnect-wiring.test.ts（`validateReconnect → world.setDisconnected(0,false)`）+ sim-core 重连不跳变（downed-rescue 第 5 例）+ 真实 `session.reconnect`（protocol.ts L199） | ✅ 已覆盖 |
| **O-K6** | **真实 socket 断线/重连路由进已落 `World.setDisconnected`，联机掉线/重连无状态跳变（服务端层 end-to-end 闭环）** | 上述 C3+C10 端到端 + 真实 socket 黏合（gateway.ts L139/L167 + protocol.ts L199）+ sim-core 机制 | ✅ **已闭环（见 §4 与 §0 更正）** |
| 纪律 B | room-service 仅调 `world.setDisconnected`，绝不直改 sim-core 实体 hp/status | 静态 grep room-service.ts（零 sim-core 实体变异，仅 L93 `setDisconnected`；`seat.status` 为房间级 `SeatStatus`） | ✅ 已覆盖 |
| D9 | 双 golden 不变 | playtest 7/7 `golden match=true`（`889a6e97…`） | ✅ 已覆盖 |
| 隔离性 | 玩家 B 不受 A 断线/重连影响 | d8-disconnect-wiring.test.ts（B `disconnected === false` 全程 6 处断言） | ✅ 已覆盖 |
| 映射一致性 | 房间座位 `seatIndex === World 玩家 id`（驱动 `setDisconnected`） | 测试镜像 `protocol.ts` game.start；`applyWorldDisconnect` 传 `seat.seatIndex` | ✅ 已覆盖 |

---

## 3. 测试所有权矩阵（相对 E7 新增/变更）

| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| apps/dungeon-server/tests/d8-disconnect-wiring.test.ts | unit/integration | **D8（C3/C10/S7.6）** | **1（NEW）** | ✅ 绿（端到端 markDisconnected→setDisconnected(0,true) / validateReconnect→setDisconnected(0,false)，玩家 B 不受影响；spy 双证） |
| packages/sim-core/tests/unit/downed-rescue.test.ts | unit | E7（S7.6/D8 机制层） | 6 | ✅ 绿（继承；第 5 例覆盖抓拍+暂停+重连不跳变） |
| packages/sim-core/tests/unit/*.test.ts（其余 6 文件） | unit | E2/E4/E5/E6/O-M | 37 | ✅ 绿（继承） |
| packages/sim-core/tests/golden/*.test.ts | golden | E3/E5/D9 | 8 | ✅ 绿（继承；双 golden 不变） |
| apps/dungeon-server/tests/*.test.ts（其余 15 文件） | unit/integration | E1/S1.x/E4 | 27 | ✅ 绿（继承） |
| scripts/playtest-core-loop.mjs（验证门） | smoke/harness | 核心循环 | 7 检查 | ✅ 7/7 EXIT 0（GOLDEN_PLAYTEST_HASH 不变） |
| **合计** | — | — | **79 单测 + 7 验证** | ✅ **51(sim-core) + 28(dungeon-server) 全绿 + playtest 7/7** |

测试计数变化（相对 E7 baseline）：
- dungeon-server：**27 → 28**（+1 d8 接线）。
- sim-core：**51（不变）**，D8 不含 sim-core 新增测试（机制层继承 E7）。
- playtest：**7（不变）**，golden 未重锁。

C-A/C-B 状态栏（沿用 qa-plan-e7 口径，D8 维持）：
- **C-A（类型检查门）**：新增 `setWorldResolver` / `getWorld(roomId): World | null` 桥接类型仅经 `--experimental-strip-types` 跑通，未接 `tsc --noEmit`（本仓仍未装 typescript）。状态：⚠️ 仍待装包接门（非阻塞）。
- **C-B（schema 不变量单测）**：纪律 B 静态契约（room-service.ts 零 sim-core 实体变异，仅 L93 `setDisconnected`）+ 双 golden 均覆盖；本 review 实跑 grep 复核（见 §4 静态证据）。状态：✅ 关闭。

---

## 4. D8 质量门判定

- **判定：PASS（带非阻塞 CONCERNS；无阻塞项）。**
- **O-K6：✅ CLOSED（已闭环，服务端层 end-to-end）**。真实 socket 断线/重连已通过依赖注入桥接进 E7 已落的权威 `World.setDisconnected`：掉线期间 tick 跳过 + DOWNED/救援计时暂停 + 单次 PersonalState 抓拍，重连从剩余窗口续算**无状态跳变**。端到端由 `d8-disconnect-wiring.test.ts` 正面覆盖（spy 证明 hook 真实触发、玩家 B 全程隔离）；**真实 socket 黏合（gateway.ts L139/L167 + protocol.ts L199）经本 review 源码实读确认已落地**，故 O-K6 非「函数层闭环」而是「真实联机生命周期闭环」。
- **阻塞项（合入门）：无**。D8（C3/C10 + O-K6）实现与核心契约自洽：dungeon-server **28/28 #fail 0**、sim-core **51/51 #fail 0**、playtest **7/7 EXIT 0**（golden `889a6e97…` 字节相等、未变）；纪律 B / D9（双 golden 不变）/ C11（裁决真相源未变）全部闭环。

### 静态证据（本 review 亲跑 grep，apps/dungeon-server/src/room-service.ts）
- `world.` 引用命中：仅 L23（类型 import）、L83（注释）、**L93 `world.setDisconnected(seatIndex, disconnected)`** → room-service 对 sim-core 实体唯一的写入口即 `setDisconnected`。✅
- `seat.status = "occupied" | "disconnected"`（L194/L257/L274）均为房间级 `SeatStatus`（合法 room-service 域，非 sim-core `EntityStatus` 位掩码）。✅
- `rescueTicks | downedTicks | EntityStatus` → **0 匹配**（grep exit 1 = 无命中）→ 未触碰 sim-core 计时/位掩码。✅

### CONCERNS（非阻塞，附 severity）

**(a) `disconnectGraceMs` 宽限 → `clearSeat` 路径不反向 `world.setDisconnected(false)`**（open follow-up，非 FAIL）。
- `markDisconnected` 的 `setTimeout(config.disconnectGraceMs)` 到期（room-service.ts L282-290）调 `clearSeat(room, seatIndex)`（L303-310），仅清空房间座位（`emptySeat`），**不调用 `applyWorldDisconnect(..., false)`**；`leaveRoom`（L312-319）→ `clearSeat` 亦不反向。
- 后果：宽限超时 / 主动离开后，**World 内该 actor 仍处 `disconnected` 态，计时保持冻结**，直到后续 **player-left epic** 显式处置。
- 处置建议（非本 Epic 范围，归独立 epic）：明确 player-left epic 何时/如何对 World 该 actor 做最终处理（清理 / 置 OUT / 托管续算），必要时反向 `world.setDisconnected(false)` 或等价 finalize，避免世界内僵尸 `disconnected` actor 长期冻结计时。

**(b) O-E7 Godot 客户端重连插值仍 OPEN**（继承 E7，非阻塞）。
- Godot 用 `PersonalState`（含 `downedRemainingTicks`）做无跳变还原 + 100ms 插值属 S4.2/S4.4，headless / 服务端层未覆盖。服务端托管钩子已闭环，但客户端侧还原动画/插值尚未实装验证。

**(c) 无自动化 ws 级 E2E（仅 d8 单元测试 + 手动 smoke）**（非阻塞，建议后续 test pass 补）。
- `d8-disconnect-wiring.test.ts` 直接调用 `markDisconnected` / `validateReconnect`，未走真实 `ws close 事件 → gateway → protocol session.reconnect` 路径；gateway/protocol 黏合虽经源码确认（§1.1），但「真实 socket 生命周期 → 权威托管」**无自动化端到端回归**，仅 `d8-smoke.md` 步骤 6 手动覆盖。
- 建议补一条 ws 级 E2E——起 server → 建 2 连接 → 关闭 A 连接（触发 `ws.on('close')`）→ 断言 World A `disconnected===true` 且 B 隔离 → A 持 `reconnectToken` 发 `session.reconnect` → 断言 `disconnected===false`，把 gateway+protocol+room-service+World 串成一条自动化回归。

以下为继承/派生非阻塞项（不影响 D8 放行）：
4. **（non-blocking）d8 测试未端到端断言「三者同发」在接线路径下的全链路行为**：断言了 World 级 `disconnected` 翻转 + hook 真实调用 + B 隔离；而「跳过 tick + 暂停 DOWNED/救援 + 单次抓拍」逐条行为在 sim-core 层（downed-rescue 第 5 例 + e7-smoke 步骤 5）已覆盖，但二者未串成「机制层 + 接线路径」集成回归。建议后续补：先经权威 `resolveDamage` 击倒 A，再 `markDisconnected` 驱动若干 `world.step`，断言断开窗口内 `downedTicks` 冻结 + `personalState` 已抓拍 + `validateReconnect` 后从剩余窗口续算无跳变。
5. **（non-blocking）resolver-null 防御分支未端到端断言**：`applyWorldDisconnect` 在 `worldResolver` 未注入时静默 `return`（L90-91）；d8 测试末尾 `setWorldResolver(null)` 仅作清理。建议补：不注入 resolver 直接 `markDisconnected` → 不抛错 + `room.seat.status` 仍变 `disconnected` + 后续 `validateReconnect` 不抛错。
6. **（non-blocking，继承 E7）C-A 类型检查门**：本仓未装 typescript，`tsc --noEmit` 暂不能跑；跨包类型错误不阻断 CI。新增 resolver 桥接类型仅经 `--experimental-strip-types` 跑通。
7. **（non-blocking，继承 E7）R1 二进制 state-diff（C5 perf）**：30Hz×4 带宽/p95 未验证。
8. **（non-blocking，继承 E7）阈值 P5 调优**：`disconnectGraceMs`（≈30s）为平衡初稿定值，机制正确、数值待 P5。

### 放行建议
D8（C3/C10 + O-K6）**可放行进入联机 playtest**。纪律 B / D9 / C11 均闭环，断线→托管→重连全链路 hook 已接，且**真实 socket 黏合已确认落地**（更正 quality-lead-5 的误判）。
待补项（均非阻塞）：player-left epic 对 World actor 的最终处置（CONCERN a）、Godot 客户端重连插值（b）、ws 级自动化 E2E（c）、全链路「机制+接线」回归（4）、resolver-null 断言（5）、C-A 类型门（6）、R1 perf（7）、阈值 P5 调优（8）。

---

## 5. 后续 Sprint 衔接 TODO
- **player-left epic（最高优先，收 CONCERN a）**：明确 `disconnectGraceMs` 超时 / `clearSeat` / `leaveRoom` 后，World 内该 actor 的处置（清理 / 置 OUT / 托管续算），必要时反向 `world.setDisconnected(false)` 或等价 finalize——这是 D8 已知的 deferred boundary，也是 O-K6 之外「玩家真正离开」的最后一块。
- **Godot 客户端**：用 `PersonalState`（含 `downedRemainingTicks`）做重连无跳变还原 + S4.2/S4.4 预测插值（收 CONCERN b）。
- **后续 test pass（收 CONCERN c / 4 / 5）**：补 ws 级 E2E + 全链路断线冻结/重连续算集成用例 + resolver-null 防御断言。
- 全程：GDScript 端口对齐 RNG 锚点 + 双 golden（C7/D9 跨语言）；D8 不改变哈希基线，端口对齐稳定。
