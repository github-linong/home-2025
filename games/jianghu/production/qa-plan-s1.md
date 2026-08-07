# 江湖 (jianghu) · Sprint 1 QA 计划

**路径**：`games/jianghu/production/qa-plan-s1.md`
**作者**：严守真（quality-lead）
**日期**：2026-08-07
**范围**：Sprint 1（E1–E5 + 垂直切片 playtest）收口双评审之 QA 侧
**性质**：只读评审 + 实测验证；不改任何运行时代码、不 commit。

---

## 1. 测试策略（四层）

| 层 | 类型 | 范围 | 执行方式 |
|---|---|---|---|
| L1 单元 | sim-core 纯函数（movement/combat/parry/spawning/loot/dungeonGen/rng/world）+ server 模块（auth/persistence/inventory/room-service/connection-registry/protocol-binary/run-runtime） | 120 用例 | `node --experimental-strip-types --test`（CI 可 gate） |
| L2 集成 | 依赖方向静态扫描（C6）+ 实例生命周期（C-Dgn/C-Net）+ 双模式 e2e（C-Per）+ last-wins（C-Per-4） | instance-lifecycle(9) / dependency-direction(5) / dual-mode-e2e(3) / last-wins(3) 等 | 同上（fake Conn / fake store） |
| L3 E2E | 真 ws 双平面（C3/C4/C5）+ 真断线重连恢复副本订阅（C10） | integration.test.ts(2) | `startServer(0)` + `ws` 客户端 |
| L4 垂直切片 | headless 核心循环（加入→移动→战斗→掉装→拾取→进本→BOSS→出本→D9） | 12 检查项 | `scripts/playtest-core-loop.mjs`（EXIT 0 = PASS） |

**回归范围（每次改动后必跑）**：120/120 全绿 + `npm run typecheck` 0 error + playtest 12/12 EXIT 0 + golden 哈希不变（`32ed5135…cc6a7b` 与 `fb383df8…5a12f4` 双锚点）。

**质量门（advisory，放行由用户拍板）**：
- 门 A（进浏览器客户端）：L1–L4 全绿 + C-Per-3 闭环接线闭合（见评审 P1）。
- 门 B（commit）：门 A 通过 + 无新增 FAIL/BLOCKER Bug。

## 2. 覆盖矩阵（Sprint 1 验收标准 ↔ 测试 ↔ 代码）

| 验收标准 | 控制项 | 测试证据 | 代码证据 |
|---|---|---|---|
| TICK_RATE 全局唯一 | C1 | run-runtime.test.ts「TICK_RATE bound to sim-core single source」 | `constants.ts:22`；全仓无裸写 12/83.33 |
| 心跳显式覆盖 5s/1s | C2 | （配置断言缺失 → 见缺口 P2-3） | `config.ts:41,43` + `gateway.ts:169-192` |
| 双平面传输 + 帧首 msgType | C3/C4 | binary-protocol.test.ts(7) + integration C3/C4 | `protocol-binary.ts`（u8 msgType + changeMask） |
| RESIDENT 常驻 + sweep 排除 | C5 | room-service.test.ts | `room-service.ts:64-79,281-292` |
| 纪律 A/B 依赖方向 | C6 | dependency-direction.test.ts(5) | spawning/dungeonGen 仅 type import；world 单点编排 |
| 预测/模拟常量单一来源 | C7 | movement/combat/parry 测试 | `constants.ts`；movement 取 CELLS_PER_TICK |
| 服务端权威战斗 | C9 | combat.test.ts(6) + world-combat(11) | `combat.resolveDamage` + `world.step` |
| 反作弊：忽略 amount + seq 单调 | C11 | combat.test「amount=9999 被 baseAmount=10 覆盖」+ movement.test「seq 回退丢弃」 | `combat.ts:49` + `world.ts:346` |
| 条件序列化 | C12 | binary-protocol round-trip | `types.ts` 一次性声明 + `world.snapshot`/changeMask |
| 游客零持久写 | C-Per-1 | persistence-auth.test.ts C-Per-1 | `persistence.ts:199-202`（guest 分支零 load/save） |
| guestId UUID v4 / 仅 /api/me | C-Per-2 | auth-dual-mode + auth-verify-production | `ids.ts:23` + `auth.ts:65` |
| 背包满→地面溢出 TTL | C-Per-3 | persistence-auth C-Per-3 + world-combat 掉装/拾取 | `inventory.ts:27-48` + `world.ts` 掉装/拾取/TTL |
| last-wins 顶替原子 | C-Per-4 | last-wins.test.ts(3) + dual-mode-e2e | `connection-registry:44-66` + `room-service.enforceLastWins` |
| 重连无跳变 | C10 | integration E2E C10（真 ws） | `protocol.ts:159-212` session.reconnect |
| 实例域隔离 | C-Net-1 | instance-lifecycle C-Net-1（decode 帧双向零泄漏） | `connection-registry:91-111` 按 roomId 路由 |
| 订阅切换原子 | C-Net-2 | instance-lifecycle C-Net-2 | `setRoom` 单值 + dispatch 返回 roomId |
| 重连恢复订阅/回落 | C-Net-3 | instance-lifecycle C-Net-3/C10 | `protocol.ts:159-212` |
| seed 仅服务端 | C-Dgn-1 | instance-lifecycle「snapshot never carries seed」 | `run-manager.ts:216` + `WorldSnapshot` 无 seed 字段 |
| 成员锁定不可变 | C-Dgn-2 | instance-lifecycle C-Dgn-2 | `room-service.createInstanceRoom` locked=true |
| BOSS 置最深层 | C-Dgn-3 | dungeonGen.test「100 次 0 异常」 | `dungeonGen.ts:90-101` |
| 副本寿命/入口冷却 | C-Dgn-4 | instance-lifecycle ×3 | `constants.ts:255,262` + `run-manager.checkInstanceExpiry` |
| 核心循环机械闭环 + D9 | E1–E5 | playtest-core-loop 12/12 + determinism golden | `scripts/playtest-core-loop.mjs` |

## 3. 已知缺口（分级）

### P0（阻塞，Sprint 1 收口前必须闭合）
- 无。

### P1（高优先，闭合后视为 C-Per-3 真正闭环；建议进浏览器客户端前闭合）
- **P1-1 拾取→背包持久化接线缺失**：`run-manager.applyPickupToInventory` 已实现但**无任何生产路径调用**（`bootResidentRun`/`enterInstance` 的 startRun 均未传 `onPickup`；gateway 未接线）；且**无测试覆盖**（全仓 test 无 `applyPickupToInventory` 引用）。后果：真实服务器中玩家拾取不落背包，仅存于 sim 世界瞬态。详见 `qa-review-s1.md` 的 F1。

### P2（非阻塞，Phase-2 / 客户端阶段处理）
- **P2-1 服务端入口坐标强校验未做**：`dungeon.enter` 由客户端踩入口触发，服务端只校验冷却+域边界（playtest 报告 §4#8 已诚实列出）。
- **P2-2 副本内死亡惩罚/背包落库未在垂直切片覆盖**（playtest 报告 §4#9）。
- **P2-3 C2 心跳配置无独立断言测试**：`config.ts` 已写死 5s/1s，但无测试锁值（防未来回归漂移）。
- **P2-4 world.ts:363 LOOT_GROUND 占位速度裸写 `0.333`**（注释注明为保 E1 golden 稳定，刻意例外；建议改注释为显式 DEV_EXCEPTION 并留 TODO）。
- **P2-5 run-manager.enqueueInput 双队列记账**：run-loop 扁平队列与 world.pending 双写，run-loop 队列 onTick 未消费（死记账，无害但易误导）。
- **P2-6 C1/C2/C3/C4/C5/C6/C12 勾选滞后**：代码已实现并有测试，但控制清单仍为未勾选（见评审 §5 清单状态偏差）。

## 4. 建议下一步

1. 闭合 P1-1：在 gateway/run-manager 生产路径接 `onPickup` → `applyPickupToInventory`（登录玩家），并补 1–2 个接线测试（拾取→背包→溢出回落地面）。
2. 主理人拍板控制清单状态：对已实现项补勾选（C1–C6、C12），对 P2 项标注 Phase-2。
3. 门 A 通过后进浏览器客户端阶段（客户端预测/插值/重连手感为全新测试面）。
