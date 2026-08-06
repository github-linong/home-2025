# E6 敌人 AI（系统⑧）· QA 计划
路径：production/qa-plan-e6.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Phase 5 质量循环）
对齐：test-framework.md 四层 + control-checklist C8/D9/C11/D12；epics E6(S6.1–S6.5)；系统⑧（敌人 AI）/系统⑦（统一结算权威）/系统①（WorldSnapshot）
运行环境：Node 22.6+（已用 v22.22.2 验证）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）；sim-core 无外部依赖
约束：本文件仅评审与文档产出，不修改任何 src/test 文件。
独立复验（已实跑确认）：sim-core **45/45 绿**、dungeon-server **27/27 绿**、playtest harness **EXIT 0（7/7）**；GOLDEN_WORLD_HASH 由 world-determinism.test.ts 锁定校验（`67b358c78…`）、GOLDEN_PLAYTEST_HASH 由 playtest-core-loop.mjs 锁定校验（`889a6e97…`），两次重跑均字节相等（非循环自证）。

> 注：sim-core 全量 45 例的构成 = rng7 + types7 + input6 + combat6 + **enemy-ai6** + **world-dodge5** + determinism5 + world-determinism3 = 45。任务 brief 称「enemy-ai.test.ts 5 例」为口径误差，实跑该文件为 **6 例**（详见 §3 所有权矩阵）。全量 45 与 brief 一致。

## 1. E6 测试策略（四层映射，仅列 E6 相关内容）
E6 本 Phase 范围 = S6.1（刷怪只读 SpawnPoint[]）/ S6.2（AI 行为：寻路追击 + 攻击选择）/ S6.3（telegraph 生成：服务端状态，视觉 defer）/ S6.4（伤害请求提交，经 ⑦ resolveDamage）/ S6.5（MIN_TELEGRAPH_TICKS=18 + tier 分层 21/24/30）。world.ts（① 编排层）重写敌人占位分支 → 调用 `stepEnemyAi` 取意图；纪律 B 严守（enemy-ai 只产意图、绝不直改实体、无 combat/dungeon-gen 运行时 import）。**O-M DODGE 冻结缺陷（design-review-e5 §6 高优 must-fix）随本 Phase world.ts 重写一并闭环**（修复 + world-dodge.test.ts 回归）。

### 1.1 sim-core 单测（unit）
- **enemy-ai 纯意图（enemy-ai.ts / S6.2/S6.3）**：`stepEnemyAi(self, ctx)` 只产 `EnemyIntent`（MOVE/ATTACK），绝不直改实体；朝最近存活玩家移动（确定性首个最小欧氏距离平方）、范围内 ATTACK 携带 `targetId` + 原型伤害、忽略 DOWNED。状态：enemy-ai.test.ts **6 项**绿（E6 新增）。
- **world 编排（world.ts / S6.4/S6.5/D12）**：敌人分支调用 `stepEnemyAi` → MOVE 按 `proto.speed/30` 位移、ATTACK 建 telegraph（`applyTick=tick+tier.telegraphTicks`，grunt21/elite24/boss30 均≥18）；前摇结算对敌人来源传 `enemyDamage`。伤害只经 `resolveDamage` 产出。状态：随 sim-core 全量跑（enemy-ai.test.ts E2E 3 例 + world-dodge.test.ts 5 例 + world-determinism golden 3 例联合覆盖）。
- **纪律 B 静态契约（combat.test.ts 第 6 例）**：enemy-ai 只 `import { ENEMY_PROTOTYPES }` + `import type { Vec2 }`，无 combat/dungeon-gen 运行时 import、无 `hp=`/`status=` 源码模式（源码审查确认）。状态：绿（已实跑确认）。
- **O-M DODGE 回归（world-dodge.test.ts / world.ts 修复）**：DODGE 后 `iframeUntilTick` 过期清除 IFRAME 位 + 位运算输入门控解冻全部动作（MOVE/ATTACK/DODGE）。状态：5 项绿（E6-era 闭环，原 E5 §6 高优缺陷）。

### 1.2 确定性 golden（golden，对应 D9 / S6 世界管线）
- **GOLDEN_WORLD_HASH 重锁 = `67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`**（敌人移速由占位 1px 改为 `proto.speed/30`，确定性，同 seed+输入三次字节相等；由 world-determinism.test.ts 持有）。任何破坏确定性的改动（敌人移速/前摇/伤害）都会让断言失败 → 强制 golden 对齐。状态：world-determinism.test.ts 3 项绿（E5 锁定，E6 因敌人移速改动重算重锁，仍稳定）。
- GOLDEN_LAYOUT_HASH 不受影响（dungeon-gen 未改）。
- **GOLDEN_PLAYTEST_HASH = `889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`**（playtest-core-loop.mjs，220-tick 含移动+攻击+闪避+击倒核心循环，3 次重跑字节相等）。状态：playtest harness 7/7 EXIT 0（已实跑确认）。

### 1.3 集成 / 端到端（integration，对应 C11/S6.4）
- **E6 敌人伤害端到端当前在 sim-core headless 烟测覆盖**（tests/smoke/e6-smoke.md 步骤 2）：敌人经 tier telegraph 后由 `resolveDamage` 扣玩家 hp，伤害取原型值≠18。状态：冒烟绿（已实跑确认）。
- 既有 E4 端到端（input-routing.test.ts）、E1 端到端（integration.test.ts）仍绿，确认 world.ts 敌人接管未破坏 30Hz 广播 / seq 防重放闭环。
- **缺口（非缺陷，同 E5 §1.3）**：缺一份 apps/dungeon-server 集成用例经真实 ws 网关跑「敌人 AI → 服务端 world → ⑦ 结算 → 快照 hp 变化」，建议后续补正式集成测试（网关仅转发 InputCmd、schema 无 amount，风险低，列为 CONCERN）。

### 1.4 性能 / 反作弊（perf / security）
- **C11 完整反作弊**：玩家路径仍权威（`resolveDamage` 对玩家恒 `PLAYER_ATTACK_DAMAGE=18`，忽略 amount）；敌人路径 `enemyDamage` 仅由 world 经意图提交（`ENEMY_PROTOTYPES` 平衡初稿），客户端不可注入。状态：✅ 已覆盖（combat.test + 冒烟 + playtest C11-amount）。
- C5 perf（30Hz×4 二进制 diff 预算）：未做（R1 遗留）。状态：⏸ defer。

## 2. E6 ↔ 验收条件矩阵
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| 系统⑧ | 刷怪只读 SpawnPoint / AI 追击+攻击 / telegraph / 伤害请求 / MIN_TELEGRAPH_TICKS=18（S6.1–S6.5） | world.ts 敌人分支 + enemy-ai.test.ts(S6.1–S6.5 全 6 例) + playtest O-E-enemy-ai | ✅ 已覆盖（基础 AI） |
| O-E | 敌人伤害接线，经 telegraph→resolveDamage，取原型值≠玩家 18 | enemy-ai.test.ts E2E(伤害下降 / 取原型 8≠18) + playtest O-E-enemy-ai + smoke 步骤 2 | ✅ 已覆盖（闭环） |
| O-D | telegraph 服务端状态生成（视觉 defer） | world.ts 建 telegraph(`applyTick=tick+tier.telegraphTicks`) + enemy-ai.test.ts(前摇未到 applyTick 零伤害) + playtest D12-telegraph | ⚠️ 服务端状态生成已落地；视觉渲染 defer（E12/⑬，snapshot 未序列化 telegraph 字段，见 §2 defer） |
| 纪律 B | enemy-ai 只产意图、world 经 resolveDamage、无 combat/dungeon-gen 运行时 import | combat.test.ts 第 6 例静态契约 + enemy-ai.ts 源码审查（零 `hp=`/`status=`） | ✅ 已覆盖 |
| D12 | 敌人前摇分层 21/24/30 ≥18 | `ENEMY_PROTOTYPES.telegraphTicks=21/24/30`（types.test.ts 断言 ≥18）+ world.ts 分层建 telegraph + enemy-ai.test.ts E2E(grunt 21 tick 后结算) | ✅ 已覆盖 |
| C11 | 玩家路径仍权威、忽略客户端 amount 不变 | combat.test(C11 伪造 amount 拒) + world.ts(玩家仍 PLAYER_ATTACK_DAMAGE) + playtest C11-amount + smoke 步骤 2 | ✅ 已覆盖（玩家路径未被敌人路径污染） |
| D9 | GOLDEN_WORLD_HASH 重锁且稳定 | world-determinism.test.ts(3 例, `67b358c78…`) + playtest GOLDEN_PLAYTEST_HASH(`889a6e97…`) | ✅ 已覆盖 |
| —— | **明确 defer（越界/设计性，非缺陷）** | —— | —— |
| O-D 视觉渲染 | telegraph 形状/配色/声音 P3 静态可读（S6.3 表现层） | 仅 schema（TelegraphState）+ 服务端状态生成；snapshot 未序列化 telegraph 字段，无渲染 | ⏸ defer E12/⑬ |
| 敌人 AI 行为复杂度 | 技能/走位/编队（S6.2 进阶） | 仅基础追击+攻击选择（无技能/走位/kiting/编队） | ⏸ defer（设计性，本 Sprint S6.2 仅落地追击+攻击） |
| 平衡初稿 | attackDamage/speed/attackRange 定值（E6 初稿） | 代码注释明示「平衡初稿待 P5 调优」；grunt8/elite12/boss20、speed 110/95/80 | ⏸ defer P5 调优 |
| R1 | 二进制 state-diff 通道（C5 perf） | 数据面仍为 JSON→Buffer 占位 | ⏸ defer |
| S4.2 / S4.4 | 本地预测 / 100ms 插值渲染 | 属 Godot 客户端，headless 校验 | ⏸ defer Godot |
| O-C（继承 E5） | 攻击 applyTick 未重验目标距离/权威位置（敌我同） | world 前摇结算按 `targetId` 直取，不重验几何；敌人攻击同样适用 | ⏸ defer（非阻塞，E5 O-C 继承） |

## 3. 测试所有权矩阵（unit vs integration）
| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| packages/sim-core/tests/unit/rng.test.ts | unit | E2(S2.4) | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/types.test.ts | unit | E2(S2.1–S2.3)/S4.3 | 7 | ✅ 绿（含 ENEMY_PROTOTYPES telegraphTicks≥18 断言） |
| packages/sim-core/tests/unit/input.test.ts | unit | E4(S4.1/S4.3)/C6/C11 | 6 | ✅ 绿 |
| packages/sim-core/tests/unit/combat.test.ts | unit | E5(S5.1–S5.7)/纪律B | 6 | ✅ 绿 |
| packages/sim-core/tests/unit/enemy-ai.test.ts | unit | E6(S6.1–S6.5)/O-E/O-D | **6** | ✅ 绿（E6 新增；brief 误记 5） |
| packages/sim-core/tests/unit/world-dodge.test.ts | unit | O-M 回归（E6 闭环） | 5 | ✅ 绿（E6-era 新增，原 E5 §6 高优缺陷） |
| packages/sim-core/tests/golden/determinism.test.ts | golden | E3(S3.4)/D9 | 5 | ✅ 绿 |
| packages/sim-core/tests/golden/world-determinism.test.ts | golden | E5(S5/D9) | 3 | ✅ 绿（E6 因敌人移速重锁 GOLDEN_WORLD_HASH） |
| apps/dungeon-server/tests/room-service.test.ts | unit | E1(S1.1/S1.5/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/connection-registry.test.ts | unit | E1(S1.2) | 6 | ✅ 绿 |
| apps/dungeon-server/tests/run-runtime.test.ts | unit | E1(S1.3) | 3 | ✅ 绿 |
| apps/dungeon-server/tests/protocol.test.ts | unit | E1(S1.2/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/integration.test.ts | integration | E1(S1.3 端到端) | 1 | ✅ 绿 |
| apps/dungeon-server/tests/input-routing.test.ts | integration | E4(S4.1/S4.3)/C11 | 1 | ✅ 绿 |
| scripts/playtest-core-loop.mjs（验证门，非单测文件） | smoke/harness | 核心循环 | 7 检查 | ✅ 7/7 EXIT 0 |
| 合计 | — | — | 72 单测 + 7 验证 | ✅ 45(sim-core)+27(dungeon-server) 全绿 + playtest 7/7 |

C-A/C-B 状态栏（沿用 qa-plan-e5/e4 口径）：
- C-A（类型检查门）：sim-core 与 dungeon-server 跨包 import（gateway/run-manager/run-runtime/world 引 sim-core）仅靠 `--experimental-strip-types` 跑通，不类型检查。**本仓未装 typescript**，tsc --noEmit 暂不能跑；类型错误不阻断 CI。状态：⚠️ 仍待装包接门（E2 遗留，与 E6 无关）。
- C-B（schema 不变量单测）：WorldSnapshot.lastProcessedSeq 不变量（types.test.ts）+ 纪律 B 静态契约（combat.test.ts 第 6 例）+ `ENEMY_PROTOTYPES.telegraphTicks≥18`（types.test.ts）+ GOLDEN_WORLD_HASH/GOLDEN_PLAYTEST_HASH 双 golden 均覆盖。状态：✅ 关闭。

## 4. E6 质量门判定
- 判定：**PASS（带 7 项非阻塞 CONCERNS；全部属设计性 defer / 平衡初稿 / O-C 继承；无阻塞项）**。
- 阻塞项（合入门）：**无**。E6 敌人 AI 实现与核心契约自洽：sim-core 45/45 + dungeon-server 27/27 全绿（已实跑确认）；GOLDEN_WORLD_HASH 因敌人移速改动重锁 `67b358c78…` 且稳定（world-determinism.test.ts 3 例 + playtest GOLDEN_PLAYTEST_HASH `889a6e97…` 双 golden 校验通过，非循环自证）；O-E 敌人伤害接线闭环（经 telegraph→resolveDamage，取原型值≠18）；O-D 服务端 telegraph 状态生成落地；纪律 B 静态契约绿（enemy-ai 零运行时 import combat/dungeon-gen、零 `hp=`/`status=` 直改）；D12 tier 分层 21/24/30 ≥18（types.test 断言）；C11 玩家路径仍权威（忽略 amount 不变）；系统⑧ 基础 AI（追击+攻击）覆盖 S6.1–S6.5。**O-M DODGE 冻结缺陷（design-review-e5 §6 高优 must-fix）本 Phase 已闭环**（world.ts 修复 + world-dodge.test.ts 5 例回归绿）。
- CONCERNS（非阻塞）：
  1. **O-D 视觉渲染 defer E12/⑬（设计性）**：world.ts 已建敌人 telegraph 服务端状态，但 `snapshot()` 未序列化 `telegraph` 字段；P3「第 1 帧静态可读」渲染属 ⑬ HUD，未测。非阻塞。
  2. **敌人 AI 行为复杂度 defer（设计性）**：S6.2 仅落地基础追击+攻击选择（无技能/走位/kiting/编队）。高阶行为属后续。非阻塞（符合本 Sprint S6 范围）。
  3. **平衡初稿 defer P5（设计性）**：`attackDamage`(8/12/20)/`speed`(110/95/80)/`attackRange`(40/48/64) 为初稿定值，代码注释明示「待 P5 调优」。非阻塞。
  4. **R1 二进制 state-diff defer（设计性，E1 遗留）**：数据面仍为 JSON→Buffer 占位，30Hz×4 带宽/p95 预算未验证。
  5. **S4.2/S4.4 客户端预测/插值 defer Godot（设计性）**：服务端 reconciliation 钩子已就绪，客户端预测回正 + 100ms 插值未在本 Phase 校验（headless）。
  6. **O-C（继承 E5）攻击 applyTick 未重验距离/权威位置（非阻塞）**：world 前摇结算按 `targetId` 直取目标，不重验几何；**敌人攻击同样适用**（敌人建 telegraph 时在校验范围，applyTick 时不重验——玩家可在前摇中移出范围仍被命中）。与玩家侧 O-C 同源，建议 `好玩吗` 门前补范围重校验，否则 telegraph 可读性受损。非阻塞（E5 核心时序正确）。
  7. **C-A 类型门仍待装包（E2 遗留）**：跨包类型错误不阻断 CI。
- 放行建议：E6 系统⑧ 基础 AI（S6.1–S6.5）可放行进入 E7/E8/E12 后续切片；O-E/O-D（服务端态）/纪律 B/D12/C11/D9 全部闭环。待补项（均非阻塞）：O-D 视觉渲染（E12/⑬）、敌人 AI 行为复杂度进阶（E6 后续/新 epic）、O-C 范围重校验（E5 继承，建议 `好玩吗` 门前）、R1/S4.2/S4.4（Godot 客户端）、平衡初稿 P5 调优、C-A 类型门装包。

## 5. 后续 Sprint 衔接 TODO
- E7：D8 托管 + C10 深度「不跳变含 DOWNED 剩余窗口」；救援/超时 OUT 闭环（闭合 E5 O-G/O-K）。
- E12：O-D telegraph 视觉渲染（P3 静态可读）；snapshot 序列化 telegraph 字段供 HUD。
- Godot 客户端接入：R1 二进制 diff + S4.2/S4.4 预测插值 + telegraph 视觉渲染 + 敌人 AI 表现。
- 战斗系统打磨：O-C 攻击距离/权威位置重校验（敌我同）、技能差异化（E8/⑨）、平衡初稿 P5 调优。
- 全程：GDScript 端口对齐 RNG 锚点 + GOLDEN_LAYOUT_HASH + GOLDEN_WORLD_HASH + GOLDEN_PLAYTEST_HASH（C7/D9 跨语言）。
