# E5 战斗（系统⑦ 结算权威）· QA 计划
路径：production/qa-plan-e5.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Phase 5 质量循环）
对齐：test-framework.md 四层 + control-checklist C11/D9/D12/C6/O2；epics E5(S5.1–S5.8)；系统⑦（统一结算权威）/系统①（WorldSnapshot）
运行环境：Node 22.6+（已用 v22.22.2 验证）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）；sim-core 无外部依赖
约束：本文件仅评审与文档产出，不修改任何 src/test 文件。
独立复验：sim-core 34/34 绿、dungeon-server 27/27 绿（已实跑确认）；GOLDEN_WORLD_HASH 已用独立脚本重算校验（非循环自证，见 §2 注）。

## 1. E5 测试策略（四层映射，仅列 E5 相关内容）
E5 本 Phase 范围 = S5.1（统一结算核心）/S5.3（普攻·闪避 i-frame·技能结算入口）/S5.5（倒地触发）/S5.6（命中权威判定点）/S5.7（反作弊基线）/S5.8（telegraph 调度落地）+ O2 移动接管 + D12 前摇。S5.2 碰撞 / S5.4 范围命中（空间校验）、SKILL 差异化、telegraph 视觉渲染、⑧ 敌人 AI、⑪ 救援倒地均不在本 Phase（defer，见 §2）。

### 1.1 sim-core 单测（unit）
- 系统⑦ 通用结算权威（combat.ts / S5.1/S5.3/S5.5/S5.6/S5.7）：resolveDamage 纯函数——扣血 / hp≤0 置 DOWNED / DODGE 授予 IFRAME 并抵消后续命中 / telegraph 前摇未完成伤害 no-op / **C11 伪造 amount 拒（req.amount 被完全忽略，按 PLAYER_ATTACK_DAMAGE=18 裁决）**。状态：combat.test.ts 6 项绿（E5 新增）。
- 纪律 B 静态契约（combat.test.ts 第 6 例）：enemy-ai 只 `import type` 引用 combat/dungeon-gen，绝不运行时 import、绝不直改实体 hp/status。状态：绿（本仓 src 下无任何模块运行时 import combat/dungeon-gen，已 grep 全量确认）。
- world 路由（world.ts / O2/D12/C11）：MOVE 按 CLASS_BASE.moveSpeed/30 每 tick 位移（移除占位 MOVE_SPEED_PX）；ATTACK/SKILL 经 ≥18 tick 前摇（D12）路由到 resolveDamage，amount 恒传 0（客户端无 amount 字段，结构上无法伪造）；DODGE 即时经 ⑦ 授予来源 IFRAME。状态：随 sim-core 全量跑（world 行为由 combat.test + world-determinism golden + smoke 联合覆盖）。

### 1.2 确定性 golden（golden，对应 D9 / S5 战斗管线）
- **GOLDEN_WORLD_HASH 已锁 = `823863c6b4927719b78d28f4e4de1867e4da281141191b58b303d3888017ed27`**（sha256(JSON.stringify(WorldSnapshot.entities))，固定输入序列含一次 ATTACK，共 26 tick）。由 world-determinism.test.ts 持有，替换 E4 遗留的 PENDING_E5。同 seed+输入 → 同 hash、跨运行字节相等；任何破坏确定性的改动（移动/战斗/AI/前摇）都会让断言失败 → 强制 golden 对齐。状态：world-determinism.test.ts 3 项绿（E5 新增）。
- 已用独立脚本（仓库外 /tmp）按相同固定序列重算 sha256，**两次运行字节级相等且等于锁定值**（非循环自证，同 e1-e3 GOLDEN_LAYOUT_HASH 手法）。
- GOLDEN_LAYOUT_HASH 未动（determinism.test.ts 仍持有 E3 布局锚点），保持 intact。

### 1.3 集成 / 端到端（integration，对应 C11/S5.7）
- **E5 战斗端到端当前仅在 sim-core headless 烟测覆盖**（tests/smoke/e5-smoke.md 步骤 2）：InputCmd 带 ATTACK 意图 → world 经前摇后由 resolveDamage 扣目标 hp → 快照含 hp 变化；C11 伪造 amount 被服务端覆盖。状态：冒烟绿（已实跑确认）。
- 既有 E4 端到端（input-routing.test.ts）、E1 端到端（integration.test.ts）仍绿，确认 world.ts 战斗接管未破坏 30Hz 广播 / seq 防重放闭环。
- **缺口（非缺陷）**：缺一份 apps/dungeon-server 集成用例经真实 ws 网关跑「客户端 ATTACK → 服务端 world → ⑦ 结算 → 快照 hp 变化」，建议 E6 接入 enemy-ai 时补正式集成测试（本 Phase 因网关仅转发 InputCmd 且 schema 无 amount，风险低，列为 CONCERN）。

### 1.4 性能 / 反作弊（perf / security）
- C11 完整反作弊（命中权威校验 / 拒伪造伤害数值）：**本 Phase 落地**。双重保险——(a) InputCmd schema 无 amount 字段，客户端结构上无法表达伤害数值；(b) resolveDamage 忽略 req.amount 无论如何。已单测覆盖（combat.test 第 5 例 + 冒烟）。状态：✅ 已覆盖（单测 + 冒烟级）。
- C5 perf（30Hz×4 二进制 diff 预算）：**未做**，数据面仍为 JSON→Buffer 占位（R1 遗留）。状态：⏸ defer。
- 碰撞/范围命中（S5.2/S5.4）：战斗按 targetId 直击，未做空间距离/碰撞层校验。状态：⏸ defer（见 §2）。

## 2. E5 ↔ 验收条件矩阵
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| 系统⑦ | resolveDamage 通用结算权威（玩家+敌人共用，纯函数，唯一伤害真相源） | combat.test.ts(扣血/ DOWNED/DODGE/telegraph no-op) + world.ts 路由 | ✅ 已覆盖 |
| C11 完整 | 服务端权威结算 + 拒伪造伤害数值（意图而非数值），闭环 E4 seq 防重放基线 | combat.test.ts(C11 伪造 amount 拒) + smoke(C11 覆盖) + world.ts 仅传 amount=0 + InputCmd 无 amount 字段 | ✅ 已覆盖（闭环 E4 基线） |
| D9 | 确定性 golden 不破（GOLDEN_WORLD_HASH 已锁，world 确定性） | world-determinism.test.ts(3 例) + 独立脚本重算校验（非循环自证） | ✅ 已覆盖（已独立校验） |
| O2 闭环 | CLASS_BASE[classId].moveSpeed 驱动每 tick 位移（移除占位 MOVE_SPEED_PX） | world.ts moveSpeedPerTick = moveSpeed/30（grep 确认 MOVE_SPEED_PX 仅存于注释） | ✅ 已覆盖 |
| D12 | telegraph 前摇 ≥18 tick（MIN_TELEGRAPH_TICKS=18，0.6s@30Hz） | combat.test.ts(前摇 no-op/完成生效) + world.ts applyTick=tick+18 + types ENEMY_PROTOTYPES≥18 | ✅ 已覆盖 |
| 系统① | WorldSnapshot 兼容（战斗管线接入不破坏快照 schema/lastProcessedSeq） | world.snapshot() 仍产 WorldSnapshot（含 entities/lastProcessedSeq）；E1/E4 集成回归绿 | ✅ 已覆盖 |
| S5.5 | 倒地触发：hp≤0 → DOWNED 位（接管交 E7） | combat.test.ts(hp≤0 置 DOWNED) | ✅ 已覆盖（触发层） |
| S5.6 | 命中权威判定点：application_tick 服务器裁定（D13） | world.ts 设 applyTick=tick+MIN_TELEGRAPH_TICKS；resolveDamage 读 state.tick | ✅ 已覆盖 |
| S5.3 DODGE（resolveDamage 层） | DODGE 授予 IFRAME 并抵消后续命中（纯函数层） | combat.test.ts(DODGE 用例：直调 resolveDamage 验证 i-frame 抵消) | ✅ 已覆盖（结算层） |
| S5.3 DODGE（world 编排层） | 闪避后玩家不被冻结 + IFRAME 位在窗口过期后清除 | ⚠️ **缺陷 O-M（见 §6）：world.step 输入门控用严格相等 `a.status===ALIVE`，DODGE 后 status=ALIVE\|IFRAME(17)≠1 → 整支输入分支被跳过，玩家永久冻结；且无任何清除 IFRAME 位逻辑** | ❌ 缺陷（高优 must-fix，见 §6） |
| —— | **明确 defer（越界/设计性，非缺陷）** | —— | —— |
| ⑧ 敌人 AI | 真实 telegraph/伤害请求经 ⑦ 提交（E6.S6.4/S6.5） | 占位 AI（1px/tick 逼近）仅验证循环；golden 固定序列用占位 AI | ⏸ defer E6 |
| ⑪ 救援倒地 | DOWNED 接管/自救/呼救/超时 OUT/D8 托管（E7.S7.1–S7.7） | 仅置 DOWNED 位；救援/超时/OUT 未实现 | ⏸ defer E7 |
| R1 | 二进制 state-diff 通道（C5 perf） | 数据面仍为 JSON→Buffer 占位 | ⏸ defer |
| S4.2 / S4.4 | 本地预测 / 100ms 插值渲染 | 属 Godot 客户端，headless 校验 | ⏸ defer Godot |
| telegraph 视觉渲染 | P3 静态可读 shape+color+sound（S5.8 表现层） | 仅 schema（TelegraphState）；无渲染 | ⏸ defer Godot/美术 |
| SKILL 技能差异化 | 技能伤害/效果差异化（S5.3 进阶） | world.ts 将 SKILL 等同 ATTACK 路由（同 dmg/前摇），skillId 暂忽略 | ⏸ defer |
| 碰撞检测（S5.2/S5.4） | 空间碰撞层 / 范围命中（权威位置校验） | 战斗按 targetId 直击，未做距离/碰撞校验 | ⏸ defer |

## 3. 测试所有权矩阵（unit vs integration）
| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| packages/sim-core/tests/unit/rng.test.ts | unit | E2(S2.4) | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/types.test.ts | unit | E2(S2.1–S2.3)/S4.3 | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/input.test.ts | unit | E4(S4.1/S4.3)/C6/C11 | 6 | ✅ 绿 |
| packages/sim-core/tests/unit/combat.test.ts | unit | E5(S5.1–S5.7) | 6 | ✅ 绿（E5 新增） |
| packages/sim-core/tests/golden/determinism.test.ts | golden | E3(S3.4)/D9 | 5 | ✅ 绿 |
| packages/sim-core/tests/golden/world-determinism.test.ts | golden | E5(S5/D9) | 3 | ✅ 绿（E5 新增） |
| apps/dungeon-server/tests/room-service.test.ts | unit | E1(S1.1/S1.5/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/connection-registry.test.ts | unit | E1(S1.2) | 6 | ✅ 绿 |
| apps/dungeon-server/tests/run-runtime.test.ts | unit | E1(S1.3) | 3 | ✅ 绿 |
| apps/dungeon-server/tests/protocol.test.ts | unit | E1(S1.2/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/integration.test.ts | integration | E1(S1.3 端到端) | 1 | ✅ 绿 |
| apps/dungeon-server/tests/input-routing.test.ts | integration | E4(S4.1/S4.3)/C11 | 1 | ✅ 绿 |
| packages/sim-core/tests/unit/world-dodge.test.ts | unit | E5(S5.3 / O-M 回归) | — | ⏸ 规划中（O-M DODGE 冻结回归，待补，见 §6） |
| 合计 | — | — | 61 | ✅ 34(sim-core)+27(dungeon-server) 全绿（O-M 回归未计入，规划中） |

C-A/C-B 状态栏（沿用 qa-plan-e4/e2 口径）：
- C-A（类型检查门）：sim-core 与 dungeon-server 跨包 import（gateway/run-manager/run-runtime/world 引 sim-core）仅靠 `--experimental-strip-types` 跑通，不类型检查。**本仓未装 typescript**，tsc --noEmit 暂不能跑；类型错误不阻断 CI。状态：⚠️ 仍待装包接门（E2 遗留，与 E5 无关）。
- C-B（schema 不变量单测）：WorldSnapshot.lastProcessedSeq 不变量（types.test.ts）+ 纪律 B 静态契约（combat.test.ts 第 6 例）+ ENEMY_PROTOTYPES telegraphTicks≥18（types.test.ts）均覆盖。状态：✅ 关闭。

## 4. E5 质量门判定
- 判定：**PASS（带 9 项非阻塞 CONCERNS；其中 8 项属设计性 defer / 类型门遗留，1 项为高优 must-fix 功能缺陷 O-M [DODGE 冻结]）**。
- 阻塞项（合入门）：**无**。E5 服务端战斗管线实现与核心契约自洽：sim-core 34/34 + dungeon-server 27/27 全绿（已实跑确认）；GOLDEN_WORLD_HASH 锁定的世界确定性经独立脚本重算校验通过（非循环自证）；C11 完整反作弊闭环 E4 基线；D12 前摇、O2 移动接管、系统① 快照兼容均验证通过；纪律 B 静态契约全量 grep 通过。
- **发布/「好玩吗」门阻塞项：有 1 项（缺陷 O-M，见 §6）**——DODGE 冻结为 in-scope 高优 must-fix，不 gate 合入门（核心契约 + 全绿），但**必须在「好玩吗」人工验证门前闭环**，否则一闪避即卡死。
- CONCERNS（非阻塞）：
  1. **⑧ 敌人 AI defer E6（设计性）**：本 Phase 仅占位 AI（1px/tick 逼近）验证循环；真实 enemy telegraph/伤害请求经 ⑦ 提交属 E6.S6.4/S6.5。golden 固定序列即用占位 AI，确定性锚点不依赖敌人行为细节。
  2. **⑪ 救援倒地 defer E7（设计性）**：resolveDamage 仅置 DOWNED 位；自救/呼救/超时 OUT/D8 托管属 E7，本 Phase 未实现未测。
  3. **R1 二进制 state-diff defer（设计性，E1 遗留）**：数据面仍为 JSON→Buffer 占位，30Hz×4 带宽/p95 预算未验证。
  4. **S4.2/S4.4 客户端预测/插值 defer Godot（设计性）**：服务端 reconciliation 钩子（lastProcessedSeq）已就绪，但客户端本地预测回正 + 100ms 插值未在本 Phase 校验（headless）。
  5. **telegraph 视觉渲染 defer（设计性）**：TelegraphState schema（shape/color/applyTick）已定义，P3 静态可读预警的渲染属 Godot 客户端/美术，未测。
  6. **SKILL 技能差异化 defer（设计性）**：world.ts 当前将 SKILL 等同 ATTACK 路由（同 PLAYER_ATTACK_DAMAGE=18、同 18-tick 前摇），CombatIntent.skillId 暂未驱动差异化；技能系统进阶属后续。
  7. **碰撞检测 / 范围命中 defer（S5.2/S5.4）**：战斗按 targetId 直击目标实体，未做空间距离/碰撞层校验（权威位置范围命中）。当前 slice 由「选中目标即命中」近似，精确碰撞/范围校验建议 E6 敌人 AI 接入时一并落地。
  8. **C-A 类型门仍待装包（E2 遗留）**：跨包类型错误不阻断 CI。
  9. **⚠️ 高优 must-fix 功能缺陷 O-M：DODGE 冻结（S5.3 world 编排层）**：实测确认——玩家 DODGE 后 status=ALIVE|IFRAME(17)，world.step 输入门控严格相等 `a.status===EntityStatus.ALIVE` 将其排除 → 后续 MOVE/ATTACK/DODGE 整支输入分支被跳过，玩家**永久冻结**（实测 5 tick 位移 1088→1088 不变）；且全仓无清除 IFRAME 位逻辑，窗口过期后位仍驻留（tick 21 仍置位）。该缺陷**不 gate E5 合入门**（核心契约 + 34/34·27/27 全绿），但**必须在「好玩吗」人工验证门前闭环**。推荐修复（归 engineering，非 QA 改动）：(a) 每 tick 初对 `iframeUntilTick` 过期实体清 `IFRAME` 位；(b) 玩家输入门控改为位运算 `(a.status & EntityStatus.ALIVE)`。回归缺口：world-determinism.test.ts 固定序列无 DODGE、combat.test DODGE 用例直调 resolveDamage 不经 world.step，两者均抓不到。必须补一条 **world 层 DODGE 回归**（见 §6 + e5-smoke 步骤 2b）。
- 放行建议：E5 服务端战斗管线可放行进入 E6/E7；C11 完整已在 E5 闭环（E4 遗留的「客户端为真相源」风险已消除）。**但 O-M 缺陷须在「好玩吗」门前闭环（高优）**，并补 world 层 DODGE 回归测试。待补项：O-M DODGE 冻结修复 + 回归测试、E6 接入真实敌人伤害请求 + 正式 dungeon-server 战斗集成测试、E7 救援/超时闭环、R1/S4.2/S4.4/S5.2 碰撞在后续 Sprint 补齐。

## 5. 后续 Sprint 衔接 TODO
- E6： enemy-ai 真实 telegraph（≥18 tick）/ 伤害请求经 ⑦ 提交（纪律 B）；补 dungeon-server 战斗集成用例（客户端 ATTACK → ⑦ 结算 → 快照 hp 变化）。
- E7：D8 托管 + C10 深度「不跳变含 DOWNED 剩余窗口」（protocol.ts 已 defer）；救援/超时 OUT 闭环。
- Godot 客户端接入：R1 二进制 diff + S4.2/S4.4 预测插值 + telegraph 视觉渲染 + SKILL 差异化表现。
- 碰撞/范围命中：S5.2/S5.4 空间校验（权威位置）落地。
- 全程：GDScript 端口对齐 RNG 锚点 + GOLDEN_LAYOUT_HASH + GOLDEN_WORLD_HASH（C7/D9 跨语言）。

## 6. 缺陷记录 O-M（高优 must-fix）：DODGE 冻结（S5.3 world 编排层）
> 来源：design-strategist-1 设计评审 design-review-e5.md §O-M；QA 独立实跑确认（2025 复验）。

### 6.1 现象（实跑确认）
- 玩家 DODGE 后 `status = ALIVE|IFRAME = 1|16 = 17`；`iframeUntilTick = tick+12`。
- 随后 5 tick 发 MOVE：玩家 x 坐标 `1088 → 1088`，**完全未移动（永久冻结）**。
- 再推进 15 tick（tick=21，远超 iframeUntilTick=12）：`status` 仍为 `17`，**IFRAME 位从未清除**。

### 6.2 根因（两处）
1. **输入门控严格相等（`packages/sim-core/src/world.ts:164`）**：
   `if (a.status === EntityStatus.ALIVE && a.kind === EntityKind.PLAYER)` —— `ALIVE=1`，DODGE 后 `status=17`，`17===1` 为 false → 整支玩家输入分支（MOVE/ATTACK/SKILL/DODGE）被跳过。
2. **无 IFRAME 位清除逻辑**：`combat.ts` 的 DODGE 路径 `ent.status |= EntityStatus.IFRAME`，全仓（combat.ts / world.ts）无任何在 `iframeUntilTick` 过期后清 `IFRAME` 位的代码。位一旦置上即永久驻留。

### 6.3 为何现有红灯没现（覆盖缺口）
- `world-determinism.test.ts` 固定序列**不含 DODGE**（仅一次 ATTACK + 占位移动）。
- `combat.test.ts` DODGE 用例**直接调 `resolveDamage`**（绕过 `world.step`），故不触发 world 层门控。
- 两者均无法触达「DODGE → world.step 输入分支」路径。

### 6.4 推荐修复（归 engineering；QA 不改动 src）
- (a) `world.step` 每 tick 初：对所有 `iframeUntilTick != null && state.tick > iframeUntilTick` 的实体清 `IFRAME` 位（`a.status &= ~EntityStatus.IFRAME`）。
- (b) 玩家输入门控改为位运算：`if ((a.status & EntityStatus.ALIVE) && a.kind === EntityKind.PLAYER)`（DOWNED/OUT 仍按位排除，不影响现有逻辑）。

### 6.5 必须补的回归测试（world 层 DODGE）
> 回归断言设计参考 design-strategist-1 补充：同时守住「解冻」与「免伤窗口正确过期」两件事。
- 新增 `packages/sim-core/tests/unit/world-dodge.test.ts`（规划中，见 §3 所有权矩阵）：
  1. **窗口内（tick ≤ iframeUntilTick）仍可操控（解冻关键）**：玩家 DODGE → 随后连续多 tick 发 MOVE → **位置持续变化（不被冻结）**；且可再次 DODGE / 发 ATTACK（输入分支不再被门控排除）。机理：DODGE 只叠加 IFRAME 位、不清除 ALIVE，位运算门控 `(status & ALIVE)` 下 `17 & 1 = 1` 为真 → 解冻单点由修复 (b) 解决。
  2. **窗口内免伤（D12/D13 语义不变）**：窗口内承受敌人命中 → 玩家 HP 不降（IFRAME 抵消），验证 DODGE 的「免伤」只影响伤害摄入、不剥夺操控权。
  3. **窗口后位生命周期卫生（修复 a）**：`iframeUntilTick` 过期（>12 tick）→ `status` 的 IFRAME 位被清除（`(status & IFRAME)===0`）且 `(status & ALIVE)` 仍为真，可继续正常行动。
  4. **可重复闪避**：第二次 DODGE 仍生效（再次授予 IFRAME 窗口）。
  5. **战斗输入仍可用**：DODGE 后发 ATTACK（经前摇）→ 目标 hp 下降（战斗管线未被冻结连带阻断）。
- 同步将 DODGE 场景纳入 `world-determinism.test.ts` 固定序列（或独立 golden），确保确定性锚点覆盖闪避路径（修复后同 seed+含 DODGE 输入 → 同哈希）。
- 该用例应在 O-M 修复后转绿；修复前作为**已知失败回归守卫**，纳入 e5-smoke 步骤 2b（见 tests/smoke/e5-smoke.md）。

### 6.6 门禁影响
- **合入门（merge）**：不阻塞——核心契约 + 34/34·27/27 全绿，设计-strategist 明确「不 gate E5 落盘」。
- **「好玩吗」人工验证门**：**必须闭环（高优）**——否则玩家一旦闪避即永久卡死，破坏核心战斗手感与四大支柱 P3（可读紧张）验证。
