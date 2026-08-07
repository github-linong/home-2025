# 江湖 (jianghu) · Sprint 1 收口 QA 评审报告

**路径**：`games/jianghu/production/qa-review-s1.md`
**作者**：严守真（quality-lead）
**日期**：2026-08-07
**对象**：Sprint 1（E1–E5 + 垂直切片 playtest）· 收口双评审 QA 侧
**方式**：只读代码/文档 + 实跑现有测试；**未改任何运行时代码、未 commit**。
**性质**：质量门为 advisory，最终放行由用户决定。

---

## 0. 总判定：**CONCERNS（无阻塞，含 1 项 P1 高优先待闭合）**

- 我**独立实跑**的三道验收全部通过：**120/120 测试绿、typecheck 0 error、playtest 12/12 PASS EXIT 0**，与报告数字一致，非抄录。
- 抽查 10 项关键门禁：**已勾选的 8 项（C7/C9/C11/C-Per-1/C-Net-1/C-Dgn-1/C10/C6）全部属实**；无「勾了但没实现」的反向造假。
- 发现 **1 项「勾选但生产接线缺失」高优先项（P1-1/F1）**：C-Per-3 宣称「E4 闭环已接」，但 `applyPickupToInventory` 无任何生产调用点、无测试覆盖 → 拾取→背包持久化在真实服务器上未接通。**不阻塞**核心循环机械闭环（playtest 已证明），但闭合前不应宣称 C-Per-3 闭环完成，建议进浏览器客户端前先补接线。
- 若主理人将「勾了但未接线」按 FAIL 标准从严执行，可升级为 FAIL；本报告按「非阻塞 CONCERNS + P1 高优先」给判，放行权在用户。

---

## 1. 测试证据（实测数字，本人实跑）

| 项 | 命令 | 结果 |
|---|---|---|
| 单元/集成套件 | `cd apps/jianghu && node --experimental-strip-types --test tests/*.test.ts sim-core/tests/unit/*.test.ts sim-core/tests/golden/*.test.ts` | **120/120 pass / 0 fail / 0 skip**（# tests 120） |
| 类型检查 | `cd apps/jianghu && npm run typecheck` | **0 error（EXIT 0）** |
| 垂直切片 | `cd games/jianghu && node --experimental-strip-types scripts/playtest-core-loop.mjs` | **12/12 PASS，EXIT 0**；GOLDEN_PLAYTEST_HASH=`fb383df88bd8cb85deaabc9c6c3fd6bb8b1138ab4f65a10302ef1419ce5a12f4`（与报告锁定值一致） |
| 黄金哈希 | determinism.test.ts | `GOLDEN_WORLD_HASH=32ed513580c7739340794b7221e6a27ac541cc0100dd0065b518832fd2cc6a7b`（=报告 `32ed5135…cc6a7b`，未变） |

**分文件用例数（共 120）**：world-combat 11 · instance-lifecycle 9 · movement 9 · dungeonGen 8 · room-service 7 · persistence-auth 7 · binary-protocol 7 · connection-registry 6 · spawning 6 · rng 6 · loot 6 · combat 6 · dependency-direction 5 · parry 5 · auth-dual-mode 4 · determinism 4 · run-runtime 3 · last-wins 3 · dual-mode-e2e 3 · auth-verify-production 3 · integration 2。

playtest 关键实测值：移动 16.00px/tick（=CELLS_PER_TICK×TILE）；普通怪 hp 序列 [10,0]；掉落 rarity=2 affixes=[38,16,52] ttl=1800；BOSS hp [264,…,0] phase 首现 hp=120；BOSS 必掉 rarity=3 ttl=1800；进本 seed 派生一致（serverTick=0）且快照无 seed；出本回 (768,720)。

---

## 2. 控制清单抽查（勾选 vs 实现）

> 核验方式：逐条对照代码 + 测试断言，不轻信勾选状态。

| 门禁 | 勾选 | 代码/测试核验 | 结论 |
|---|---|---|---|
| **C1** 常量单源 | ⬜ 未勾 | `constants.ts:22` TICK_RATE=12 唯一定义；全仓 grep 无裸写 12/83.33（仅注释/测试）；run-runtime/gateway 均 import；run-runtime.test「C1: no local redefinition」 | ✅ 实现但**清单未勾**（勾选滞后） |
| **C6** 纪律 A/B | ⬜ 未勾 | spawning 仅 type-import loot；dungeonGen 仅 type-import spawning；world=sim-core 单点编排；dependency-direction.test(5) 静态扫描 | ✅ 实现但**清单未勾** |
| **C7** 预测常量 | ☑ 已勾 | TICK_RATE/BASE_SPEED/PARRY_TICKS/MIN_TELEGRAPH_TICKS 全在 constants.ts；movement/combat/parry 均 import 消费；playtest 移动=16px/tick 印证 | ✅ **勾选属实** |
| **C9** combat 服务端权威 | ☑ 已勾 | `combat.resolveDamage` 按 baseAmount 结算；`parry.judgeParry` 服务端时间窗；`world.step` 开窗/清窗 | ✅ **勾选属实** |
| **C11** 反作弊 | ☑ 已勾 | `combat.ts:49` 忽略 amount（测试：amount=9999→deltaHp=-10）；`world.ts:346` seq 严格递增（回退静默丢弃）；skillCd 服务端闸门 | ✅ **勾选属实** |
| **C12** 条件序列化 | ⬜ 未勾 | `types.ts` EntityState 一次性声明；`world.snapshot` 条件附加字段；`protocol-binary` changeMask | ✅ 实现但**清单未勾** |
| **C-Per-1** 游客零写 | ☑ 已勾 | `persistence.ts:199-202` guest 分支不调 store.load/save；gateway autosave 跳过 guest；persistence-auth C-Per-1 断言 saveCount=0/loadCount=0/keys 无 guestId | ✅ **勾选属实** |
| **C-Net-1** 域隔离 | ☑ 已勾 | `connection-registry:97` 按 `conn.roomId` 路由广播；startRun onBroadcast 仅本 room 域；protocol dungeon.enter 域边界；instance-lifecycle decode 帧双向零泄漏 | ✅ **勾选属实** |
| **C-Dgn-1** seed 仅服务端 | ☑ 已勾 | `run-manager.ts:216` seed 内部计算，返回仅 instanceRoomId；WorldSnapshot 无 seed 字段；instance-lifecycle 断言 `"seed" in snap === false` | ✅ **勾选属实** |
| **C10** 重连无跳变 | ☑ 已勾 | `protocol.ts` session.reconnect 寿命内回实例/销毁后 fellBackToResident；integration E2E C10 真 ws 断线重连恢复副本订阅 | ✅ **勾选属实** |

其余核验（非抽查）：C2 心跳 5s/1s（`config.ts:41,43` + `gateway.ts`）；C3/C4 双平面 + 帧首 msgType（`protocol-binary.ts` + integration）；C5 RESIDENT 常驻 + sweep 排除（`room-service.ts`）；C-Dgn-2 成员锁定（room-service locked=true + joinInstance 拒非成员）；C-Dgn-3 BOSS 置深（dungeonGen.test 100 次 0 异常）；C-Dgn-4 30min/10s（constants + tryEnterEntrance + checkInstanceExpiry）；C-Net-2 原子切换（setRoom 单值）；C-Net-3 重连回落；C-Per-2 guestId UUID v4 + 仅 /api/me；C-Per-3 溢出→地面 TTL（inventory + world）；C-Per-4 last-wins。

**清单状态偏差（文档治理，非代码缺陷）**：C1/C2/C3/C4/C5/C6/C12 代码已实现并有测试，但控制清单仍为未勾选 → 勾选滞后于实现，建议主理人一次核对补勾。C13（并发水位监控）未实现且未勾选，与 C-A（Phase-2）一致，合理。

---

## 3. Bug 发现（带严重级 + 文件:行号）

| ID | 严重级 | 标题 | 证据 | 影响 |
|---|---|---|---|---|
| **F1** | **Major（P1）** | 拾取→背包持久化生产接线缺失（C-Per-3「E4 闭环已接」勾选不实） | `run-manager.ts:302` 定义 `applyPickupToInventory`；但 `bootResidentRun`（run-manager.ts:172-182）与 `enterInstance` 内 startRun（run-manager.ts:225-233）**均未传 `onPickup`**；gateway 全文无调用；全仓 `*.test.ts` 无 `applyPickupToInventory` 引用（grep 实证）。`onPickup` 仅出现在 run-manager 自身定义与注释 | 真实服务器中玩家拾取**不落背包**：物品仅存于 sim 世界瞬态，断线/复活/出本即失。控制清单 C-Per-3「完整 C-Per-3 闭环」与 playtest 报告 §4#9「背包入库闭环由 applyPickupToInventory + persistence 测试覆盖」表述**均过实**（该函数无测试、无调用） |
| F2 | Minor（P2） | LOOT_GROUND 占位速度裸写魔法数 `0.333` | `world.ts:363`（注释称保 E1 golden 稳定，刻意例外但违反 C7 字面纪律） | 低；golden 稳定是有效理由，建议显式标记 DEV_EXCEPTION + TODO |
| F3 | Minor（P2） | `enqueueInput` 双队列记账 | `run-manager.ts:129-134`：run-loop 扁平队列 + world.pending 双写；run-loop onTick 未消费该队列 | 低；死记账，易误导后续维护者 |
| F4 | Minor（P2） | 服务端入口坐标强校验未做 | `protocol.ts:117` dungeon.enter 仅 Number(payload.entranceId)，无坐标重叠校验（playtest 报告 §4#8 已诚实列出） | 中低；客户端可伪造入口触发，MVP 可接受，Phase-2 补 |

**无 Blocker / Critical。无确定性破坏**（golden 双锚点未变）。

---

## 4. 缺口清单（分级）

- **P0**：无。
- **P1（高优先，建议进浏览器客户端前闭合）**：F1 拾取→背包接线 + 补接线测试。**（F1 已闭合，见 §6 engineering-lead 补记；2026-08-07）**
- **P2（非阻塞）**：F2 魔法数标注 · F3 双队列清理 · F4 入口坐标校验 · C2 心跳无独立断言测试 · C1/C2/C3/C4/C5/C6/C12 清单补勾 · 控制清单「E4 闭环已接」表述修正。
- **P3（Phase-2，已在 playtest 报告 §4 诚实列出，本报告认同）**：无浏览器渲染/插值/预测回正；无真人手感评估；无多人同本；无真 ws 抖动/RTT；telegraph 视觉未接；敌人 AI 无追击；碰撞为抽象；副本死亡惩罚/背包落库未在切片覆盖。

---

## 5. 结论与建议

1. **机械闭环验证可信**：三道验收我本人实跑通过，数字与报告一致；已勾选核心门禁无造假。
2. **必须闭合**：F1（P1）——在 gateway/run-manager 生产路径接 `onPickup → applyPickupToInventory`（登录玩家入库、游客忽略），并补接线测试；否则 C-Per-3「闭环」与「背包落库由测试覆盖」两处表述失真。
3. **建议**：主理人拍板清单补勾（C1–C6/C12）；F2–F4 留 Phase-2 或随手清理。
4. **门判**：门 A（进浏览器客户端）在 F1 闭合后 PASS；当前状态 = **CONCERNS**（无阻塞，1 项 P1 待闭合）。

---

## 6. F1 修复确认（engineering-lead 补记，2026-08-07）

> 本补记不改动严守真 QA 侧原始评审结论；仅记录 F1（P1）已在生产路径闭合并补测试。

- **状态**：**F1 已闭合**（原「CONCERNS」中唯一 P1 项）。
- **修复内容**：
  1. `src/run-manager.ts`：新增模块级 `activeCharacterService` + `setActiveCharacterService`（参照 gateway 模式，避免 run-manager 反向 import gateway，C6 纪律 B）；新增默认 `handlePickup(roomId, seatId, loot)` —— seatId → `CharacterService.getSeatInfo` 解析，游客/未知座位直接忽略（C-Per-1 零持久写），登录 → `void applyPickupToInventory(...).catch(()=>{})`（不阻塞 12Hz 循环）。
  2. `bootResidentRun` 与 `enterInstance` 的 `startRun` 均传 `onPickup`（F1 原缺口两处调用点）。
  3. `src/persistence.ts`：`CharacterService` 增加 `seatInfoById` 登记（`begin` 时记录 userId + guest）+ `getSeatInfo(seatId)`（seat/player 映射本就是 CharacterService 唯一权威）。
  4. `src/server.ts`：启动时 `setActiveCharacterService(characterService)` 注入。
- **测试证据**：新增 `tests/pickup-inventory.test.ts` ×3 —— 登录拾取入背包（addItem 生效）/ 满包溢出落回地面（C-Per-3，原掉落被消费 + 溢出 re-spawn 新实体）/ 游客零持久写（C-Per-1，store.load/save 计数 0）。全套 123/123 绿、typecheck 0 error、playtest 12/12 EXIT 0、golden `fb383df8…` 未变（详见补记后实跑输出）。
- **seatId → 游客解析方式（选定）**：CharacterService 是 seat/player 映射唯一权威（assignSeat 分配座位、begin 为双模式 choke point），故在 `begin` 登记 `seatId → {userId, guest}`，`handlePickup` 经 `getSeatInfo` 判定；未登记座位（未 begin）视为未知 → 忽略。不引入第二份 seat 登记表（gateway.liveSessions 仅存在线连接，会丢失离线成员座位解析，故不采用）。
