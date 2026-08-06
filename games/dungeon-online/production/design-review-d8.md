# D8 设计评审 + 范围核查（P5-S1-DES-8）

- **路径**：`games/dungeon-online/production/design-review-d8.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审（只读不改码）
- **评审对象**：Epic D8 — room-service 断线/重连接线（关闭设计缺口 **O-K6**）
- **基线**：`production/design-review-e7.md` §8（O-D7 RESOLVED / O-K6 服务端 RESOLVED / O-E7 OPEN）、`production/epics.md`（D8 C3/C10）、`packages/sim-core/src/{world,rescue}.ts`、`apps/dungeon-server/src/{gateway,protocol,room-service,server,run-manager}.ts`、`apps/dungeon-server/tests/d8-disconnect-wiring.test.ts`

> **实跑复验（本评审独立实跑）**：`apps/dungeon-server/tests/d8-disconnect-wiring.test.ts` **1/1 通过**（spy 记录 `World.setDisconnected` 调用 + actor `disconnected` 状态双证，玩家 B 全程不受影响，重连无跳变）。与 e7 §8.1 通报一致。

---

## 0. 判定摘要

- **判定：PASS**
- **阻塞项：无**
- **缺口关闭**：**O-K6（重连 seq 连续性契约 / 断线托管端到端）→ CLOSED（服务端端到端）**。D8 接线在 room-service 层落地，由 gateway（socket 断线 + 心跳超时）与 protocol（session.reconnect 重连握手）双向驱动，经 `setWorldResolver` 桥接到权威 `World.setDisconnected`；**三者同发 + 无跳变恢复**在服务端完整闭环。
- **设计红线**：无主导策略 / 经济失衡 / 认知过载 / 支柱漂移；P4「重连友好 / 不劝退」在服务端完整落地（冻结计时 + 抓拍 + 无跳变恢复）。
- **重要更正（CORRECTION）**：先前的 QA 评审（quality-lead-5）误称「ws→markDisconnected 胶水代码是 TODO」。经源码确认，**该胶水已 WIRED**：`gateway.ts:139`（ping 超时）与 `gateway.ts:167`（ws close）均调用 `markDisconnected(room, verified.userId)`；`protocol.ts:199`（`session.reconnect`）调用 `validateReconnect`。因此 **O-K6 在服务端是真实端到端闭合，而非「计划 / 占位」**。

---

## 1. 端到端接线追踪（无跳变设计如何被强制）

整条链路（从 socket 事件到 World 状态）：

| 阶段 | 文件:行 | 动作 | 对 World 的影响 |
|---|---|---|---|
| 心跳超时 | `gateway.ts:137-140` | `if (now-lastPong > pongTimeoutMs) markDisconnected(room, verified.userId)` | → room-service |
| socket 关闭 | `gateway.ts:164-167` | `ws.on("close")` → `markDisconnected(room, verified.userId)` | → room-service |
| 重连握手 | `protocol.ts:199` | `session.reconnect` → `validateReconnect(room, userId, seatIndex, token, runId)` | → room-service |
| 房间层断开 | `room-service.ts:271-292` | `markDisconnected`：找 seat(userId)→置 status=disconnected→`applyWorldDisconnect(seatIndex, true)`→启动 `disconnectGraceMs` 计时 | 调 World |
| 房间层重连 | `room-service.ts:236-269` | `validateReconnect`：校验 token→清计时→`applyWorldDisconnect(seatIndex, false)` | 调 World |
| 托管桥 | `room-service.ts:85-94` | `applyWorldDisconnect`：`worldResolver(roomId)?.setDisconnected(seatIndex, disconnected)` | 唯一出口（纪律 B） |
| 解析器注入 | `server.ts:35` | `setWorldResolver((roomId) => runManager.getWorld(roomId))` | 桥接权威 World |
| World 钩子 | `world.ts:368-383` | `setDisconnected(playerId, disconnected)`：置位 + 单次抓拍 PersonalState | 写 actor |
| tick 跳过 | `world.ts:205-211` | step() 玩家推进门控 `!a.disconnected`（L209） | 断开期跳过该玩家 tick |
| 计时冻结 | `world.ts:303` | E7 循环 `if (a.disconnected) continue` | 断开期 **不推进** `downedTicks`/`rescueTicks` |
| 快照 | `rescue.ts:123-137` | `capturePersonalState`：单次持有，含 `downedRemainingTicks` | 供客户端还原（信息性） |

**身份映射**：`seatIndex ≡ actor.ownerId ≡ World 玩家 id`（`protocol.ts` game.start 写入 `ownerId = seatId`；`room-service.applyWorldDisconnect` 以 `seatIndex` 驱动 `setDisconnected`）。故断线/重连以 `seatIndex` 无歧义映射到 World actor。

### 1.1 三者同发（disconnect 时刻）
`setDisconnected(true)` 在同一调用内完成三件事（`world.ts:368-383`）：
1. **跳过该玩家本 tick**（step 门控 `!a.disconnected`，`world.ts:209`）；
2. **暂停 DOWNED/救援计时**（E7 循环 `if (a.disconnected) continue`，`world.ts:303` —— 整段 `downedTicks += 1` 与救援/超时逻辑被跳过）；
3. **单次抓拍 PersonalState**（`if (disconnected && !a.disconnected)` 守卫，`capturePersonalState` 仅在「转入断开」时写一次，重连不覆盖）。

### 1.2 无跳变恢复（reconnect 时刻）
`setDisconnected(false)`（`world.ts:368-383`）仅清 `a.disconnected` 标志，**不触碰** `downedTicks`/`rescueTicks`/`personalState`。因此：
- 断开期计数器从未推进（§1.1.2）→ 重连后从冻结值继续累加（e7 `downed-rescue.test.ts` 验证 50→55 无跳变，见 e7 §2）；
- `downedRemainingTicks` 仅作客户端还原参考，服务端权威恢复走冻结计数器，不重算、不跳变。

### 1.3 实跑复验
`apps/dungeon-server/tests/d8-disconnect-wiring.test.ts` **1/1 通过**：
- spy 包裹 `world.setDisconnected` 证明 hook 被**真实触发**（非橡皮图章）；
- `markDisconnected(room,"A")` → 断言 `calls` 含 `{playerId:0, disconnected:true}` 且 `actor A.disconnected===true`；
- `validateReconnect(room,"A",0,token,runId)` → 断言 `calls` 含 `{playerId:0, disconnected:false}` 且 `actor A.disconnected===false`（无跳变恢复）；
- 玩家 B 全程 `disconnected===false`（不受影响）；
- 测试以 `setWorldResolver((roomId)=>runManager.getWorld(roomId))` 桥接（`server.ts:35` 同款），与运行期一致。

---

## 2. 缺口 reconcile 表（O-D7 / O-K6 / O-G6 / O-C6 / O-B6 / O-E7）

| 缺口 | 来源 | D8 评审结论 | 状态 |
|---|---|---|---|
| **O-K6** | 重连 seq 连续性契约 / 断线托管端到端 | D8 接线在服务端完整闭环：`gateway`（ping 超时 L139 / ws close L167）→ `markDisconnected`；`protocol`（session.reconnect L199）→ `validateReconnect`；二者经 `applyWorldDisconnect` → `World.setDisconnected`，经 `server.ts:35` 桥接。三者同发 + 无跳变恢复 + 玩家 B 不受影响，d8 测试 1/1 双证。**更正 quality-lead-5 误报：ws→markDisconnected 胶水已 WIRED，非 TODO**。 | ✅ **CLOSED（服务端端到端）** |
| **O-D7** | D8 room-service 接线（C3/C10） | 已由 engineering-lead-6 在 room-service 层落地（e7 §8.1 RESOLVED）：`markDisconnected`/`validateReconnect` → `world.setDisconnected`；d8 测试双证；未改 sim-core。 | ✅ RESOLVED（server 层，继承 e7 §8） |
| **O-G6** | DOWNED 触发后无计时/OUT/救援 | E7 已在 sim-core 实现全链（e7 §6.2 RESOLVED）；D8 依赖其 `setDisconnected` 钩子（已就位），不新增但复用。 | ✅ RESOLVED（from E7） |
| **O-C6** | 范围/权威位置命中校验 | 仍 OPEN。D8 仅驱动断线托管钩子，未触及 combat 命中距离重校（`RESCUE_RADIUS` 为独立几何机制）；继承 E5/E6，非 D8 回归。 | ⚠ 仍 OPEN（不受 D8 影响） |
| **O-B6** | 碰撞未做 | 仍 OPEN。救援半径判定为纯几何（无视地形/实体碰撞层），D8 不改此路径；继承 E5/E6，非阻塞。 | ⚠ 仍 OPEN（不受 D8 影响） |
| **O-E7** | S7.7 客户端重连插值 | **唯一真实剩余缺口**：服务端状态（冻结计时 + PersonalState 抓拍 + 无跳变恢复）已就位，但 Godot 客户端 100ms 平滑插值还原未做，归 Godot 客户端切片 / 联机 epic（C10 客户端部分）。 | ⚠ OPEN（预期内 defer，客户端闭环） |

> **结论**：D8 关闭 **O-K6（服务端端到端）**；O-D7 / O-G6 已 RESOLVED；O-C6 / O-B6 仍 OPEN 但**不受 D8 影响**（继承 E5/E6）；O-E7 是 D8 之外唯一真实剩余缺口（客户端）。

---

## 3. CONCERNS（非阻塞，不 gate D8 验收）

### 3.1 O-E7 · Godot 客户端重连插值未纳入（唯一真实剩余缺口）
服务端已保证「无跳变恢复」（冻结计数器 + 重连续算，§1.2 / d8 测试双证）。但客户端侧：
- 重连后 100ms 平滑插值还原（E1 S1.6 + ⑬）尚未实现；
- 跨断线 `seq` 不重置的客户端契约（C10 客户端部分）待客户端切片落地时显式约定。

**非阻塞**：headless 服务端切片不触发；归 Godot 客户端 epic。建议主理人将「联机 playtest 前必补项」由 O-D7 降级为 O-E7（仅客户端插值），与 e7 §8.3 一致。

### 3.2 player-left epic · disconnectGraceMs 不反向 setDisconnected（设计缺口，建议独立 epic 跟踪）
`markDisconnected`（`room-service.ts:271-292`）在断开时启动 `disconnectGraceMs` 宽限计时器（L282-291）；宽限到期（`seat.status==="disconnected"` 仍成立）回调 `clearSeat(room, seat.seatIndex)`（L284）将座位复位为空。**但 `clearSeat`（`room-service.ts:303-310`）只复位座位，不调用 `applyWorldDisconnect(room, seatIndex, false)`** —— 即宽限到期「永久离开」路径**不反向清除 World actor 的 `disconnected` 标志**。

**后果（仅当玩家永久离开、未重连）**：
- 该 World actor 的 `disconnected` 永久为 `true` → step() 永久跳过其 tick（位置冻结，视觉上可接受）；
- 若离开时该 actor 处于 **DOWNED**：E7 循环 `if (a.disconnected) continue`（`world.ts:303`）使其 `downedTicks` **永久冻结**，既不续算到 OUT，也不被队友救援（救援逻辑在同段被跳过，且 `rescueCandidates` 排除 disconnected 队友，`rescue.ts:112`）—— actor 卡在 DOWNED 态，直到 world reset 才清；
- World 无「座位已腾空」概念，仅有 `disconnected` 布尔，故永久离开玩家在 world 内呈「冻结残态」（co-op 下其余玩家不受影响，但残留不优雅）。

**对比**：重连路径（`validateReconnect`）正确反向调用 `applyWorldDisconnect(seatIndex, false)`（`room-service.ts:266`）；唯独宽限到期（永久离开）路径缺失该反向调用。

**建议（非阻塞，供 player-left epic 收口）**：在 `clearSeat` 或宽限到期回调中显式处理「永久离开」—— 至少调用 `applyWorldDisconnect(room, seatIndex, false)` 解除托管冻结；更优是在 World 引入显式 `LEFT`/移除态（与 OUT 区分），使永久离开玩家的 DOWNED actor 能正常超时到 OUT 或移出 world。D8 验收不受影响（服务端断线/重连闭环本身正确），但此缺口应在联机 playtest 前闭合。

---

## 4. 判定与遗留

### 4.1 判定：**PASS**
D8 将「断线/重连接线」在服务端完整闭环：`gateway`（ping 超时 L139 / ws close L167）与 `protocol`（session.reconnect L199）双向驱动 `room-service.markDisconnected` / `validateReconnect` → `applyWorldDisconnect` → `World.setDisconnected`（经 `server.ts:35` 桥接）。World 端三者同发（跳过 tick + 暂停 DOWNED/救援计时 + 单次抓拍 PersonalState）与无跳变恢复（冻结计数器续算）经源码 grep + `d8-disconnect-wiring.test.ts` 1/1 双证落地。**更正 quality-lead-5 误报**：ws→markDisconnected 胶水已 WIRED，O-K6 在服务端真实端到端闭合。设计红线无违反，P4「重连友好」服务端落地。可放行。

### 4.2 缺口状态
- **O-K6 → CLOSED（服务端端到端）**
- O-D7 / O-G6 → RESOLVED
- O-C6 / O-B6 → 仍 OPEN（继承 E5/E6，不受 D8 影响）
- O-E7 → OPEN（唯一真实剩余缺口，客户端插值，归 Godot 切片）

### 4.3 非阻塞 CONCERNS
- O-E7（客户端重连插值，预期内 defer）
- player-left epic（disconnectGraceMs 不反向 setDisconnected，建议独立 epic 收口）

### 4.4 阻塞项：**无**

---

## 5. Handoff
- 本稿随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-d8.md`。
- 主理人合入时建议：将「联机 playtest 前必补项」由 O-D7 降级为 O-E7（仅客户端插值）；O-K6 标记 **CLOSED（服务端）**。
- 跨队友提示：
  - **quality-lead**：D8 测试面（`d8-disconnect-wiring.test.ts` 1/1）已覆盖断线/重连 hook 触发 + actor 状态 + 他者不受影响；建议 QA 计划补「断开期间该玩家 DOWNED → 宽限到期永久离开 → actor 是否卡 DOWNED」用例（呼应本稿 §3.2 player-left），并回归。
  - **engineering-lead**：player-left epic（§3.2）建议收口：宽限到期路径补 `applyWorldDisconnect(seatIndex, false)` 解除冻结，或引入显式 LEFT/移除态。不影响 D8 验收。
  - **Godot 客户端 owner**：O-E7 客户端重连插值（100ms）与跨断线 seq 契约（C10 客户端部分）待客户端切片落地时显式实现并约定。
  - **design-strategist（⑪ GDD）**：本评审不涉及 ⑪ 阈值变更（D8 仅接线），O-A7 / O-G7 / O-I7 平衡初稿仍归「好玩吗」门前（见 e7 §6.3）。

（文策渊 · design-strategist · D8 设计评审，主理人汇编落盘）
