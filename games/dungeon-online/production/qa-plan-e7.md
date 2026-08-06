# E7 救援/倒地/超时 OUT（系统⑪）· QA 计划
路径：production/qa-plan-e7.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Phase 5 质量循环）
对齐：test-framework.md 四层 + control-checklist C3/C10/C11/D8/D9/S7；epics E7(S7.1–S7.7)；系统⑪（救援/倒地/超时 OUT）/系统⑦（统一结算权威）/系统①（WorldSnapshot）
运行环境：Node 22.6+（已用 v22.22.2 验证；与 E6 同基线）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）；sim-core 无外部依赖
约束：本文件仅评审与文档产出，不修改任何 src/test 文件（read-only review）。
独立复验（已实跑确认）：sim-core **51/51 绿**（#fail 0）、dungeon-server **27/27 绿**（#fail 0）、playtest harness **EXIT 0（7/7）**；GOLDEN_WORLD_HASH（`67b358c78…`）与 GOLDEN_PLAYTEST_HASH（`889a6e97…`）均字节相等且未变（非循环自证，双 golden 守门）。

> 注：sim-core 全量 51 例的构成 = E6 baseline 45 + **downed-rescue.test.ts 6 例（E7 新增）** = 51。
> 全量 51 与 brief 一致（baseline 45 + 新 6）。dungeon-server 维持 27（本次 E7 未改 dungeon-server，room-service D8 接线明确 defer，见 §2 DEFER）。

## 1. E7 测试策略（四层映射，仅列 E7 相关内容）
E7 本 Phase 范围 = S7.1（hp≤0→DOWNED，钳 0）/ S7.2（救援读条 90tick 复活 + 无队友降级自救 300tick@1hp + 读条不衰减）/ S7.4（DOWNED/OUT 免疫补刀，OUT 只经超时）/ S7.5（超时 600tick→OUT 旁观）/ S7.6（断线托管：暂停计时 + 抓拍 PersonalState）/ D8（断线冻结态单次持有，重连不跳变）。**纪律 B 严守**：rescue.ts 仅含纯决策函数（无 hp/status 源码变异），enemy-ai.ts 未触碰（零 rescue 引用）。E7 落地集中在 `rescue.ts`（新纯模块）+ `world.ts`（E7 loop + `World.setDisconnected`）+ `combat.ts`（S7.4 no-op 分支）+ `types.ts`（OUT=1<<2；复用 RescueState/PersonalState）。

### 1.1 sim-core 单测（unit）
- **E7 倒地/救援/超时/托管（downed-rescue.test.ts / S7.1/S7.2/S7.4/S7.5/S7.6/D8）**：6 项绿（E7 新增），逐条对应 §2 矩阵。状态：已实跑确认（51/51 含此 6 例）。
- **combat S7.4 no-op 分支（combat.ts）**：`resolveDamage` 在 `target.status & (DOWNED|OUT)` 时直接 no-op（deltaHp=0，statusChange 回传当前 status）。由 downed-rescue 第 2 例（DOWNED 免疫补刀 + OUT 绝不经由伤害进入）正面覆盖 + 既有 combat.test.ts（E5-era，全 6 例仍绿，确认 no-op 分支未破坏玩家/敌人正常结算）联合覆盖。状态：绿。
- **纪律 B 静态契约（rescue.ts 源码审查 + 静态 grep）**：rescue.ts 全部函数（`withinRescueRadius`/`revivalHp`/`isOutEligibleTarget`/`rescueCandidates`/`capturePersonalState`）为纯函数，源码级 `hp=`/`status=` 变异模式 grep 结果为 **0 匹配**（已实跑确认）；`capturePersonalState` 仅 *读取* 入参 status/hp 并构造新 PersonalState 对象，绝不回写实体。enemy-ai.ts 对 `rescue` 的 grep 结果为 **0 匹配**（确认未触碰）。状态：✅ 关闭（静态 + 源码审查双保险）。

### 1.2 确定性 golden（golden，对应 D9 / S7 世界管线）
- **GOLDEN_WORLD_HASH = `67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`**（world-determinism.test.ts，E5 锁定、E6 因敌人移速重锁，**E7 未改动战斗/移动/AI/前摇路径 → 哈希不变，无需重锁**）。状态：world-determinism.test.ts 3 项绿（已实跑确认）。
- **GOLDEN_PLAYTEST_HASH = `889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`**（playtest-core-loop.mjs，220-tick 核心循环，3 次重跑字节相等）。E7 倒地机制不影响该固定序列（序列内无玩家倒地），故 **golden 不变，无需重锁**。状态：playtest harness 7/7 EXIT 0、`golden match=true`（已实跑确认）。
- GOLDEN_LAYOUT_HASH 不受影响（dungeon-gen 未改）。

### 1.3 集成 / 端到端（integration，对应 C3/C10/D8）
- **断线托管 hook 端到端当前仅在 sim-core headless 层烟测覆盖**（tests/smoke/e7-smoke.md 步骤 5：直接驱 `world.setDisconnected` 验证 抓拍 + 暂停计时 + 重连不跳变）。**dungeon-server room-service 尚未将真实 socket 断线事件接到 `World.setDisconnected`**（C3/C10），属明确 DEFER（见 §2）。状态：sim-core hook 绿；room-service 接线未覆盖（非阻塞，DEFER）。
- 既有 E4 端到端（input-routing.test.ts）、E1 端到端（integration.test.ts）仍绿，确认 world.ts E7 倒地 loop 重写未破坏 30Hz 广播 / seq 防重放闭环。

### 1.4 性能 / 反作弊（perf / security）
- **C11 完整反作弊（继承）**：玩家路径仍权威（`resolveDamage` 对玩家恒 `PLAYER_ATTACK_DAMAGE=18`，忽略 amount）；E7 S7.4 仅 *新增* 防御性 no-op（DOWNED/OUT 目标不受伤），不改变裁决真相源。状态：✅ 已覆盖（combat.test + playtest C11-amount 仍绿）。
- C5 perf（30Hz×4 二进制 diff 预算）：未做（R1 遗留）。状态：⏸ defer。

## 2. E7 ↔ 验收条件矩阵
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| S7.1 | hp≤0 → DOWNED，hp 钳 0 | combat.ts(`target.hp=Math.max(0,…)` + `hp<=0 → \|DOWNED`)；downed-rescue.test.ts（`downPlayer` 助手断言 hp=0 + DOWNED 位，6 例共用） | ✅ 已覆盖 |
| S7.4 | DOWNED/OUT 免疫补刀；OUT 绝不经由伤害进入 | combat.ts no-op 分支（`status & (DOWNED\|OUT) → deltaHp=0`）；downed-rescue 第 2 例（再受致命伤 hp/status 不变、OUT 位=0）+ combat.test（E5-era 6 例仍绿） | ✅ 已覆盖（DOWNED 正面 + OUT 负面断言） |
| S7.2 | 救援读条 90tick 复活（回血 revivalHp） | downed-rescue 第 1 例（邻近累积 RESCUE_TICKS→清 DOWNED、hp=revivalHp(maxHp)） | ✅ 已覆盖 |
| S7.2 | 无队友降级自救 300tick @1hp | downed-rescue 第 3 例（单人世界，SOLO_SELF_RESCUE_TICKS→清 DOWNED、hp=1） | ✅ 已覆盖 |
| S7.2 | 救援读条不衰减（出半径不累积也不回退） | downed-rescue 第 6 例（远处 50tick rescueTicks 保持 0；贴身再从 0 累积复活） | ✅ 已覆盖 |
| S7.5 | 超时 600tick → OUT，本 run 旁观（ALIVE 保留） | downed-rescue 第 4 例（有队友但远处不施援 → 600tick 后清 DOWNED 置 OUT、ALIVE 保留） | ✅ 已覆盖 |
| S7.6/D8 | 断线抓拍 PersonalState（单次持有）+ 暂停 DOWNED/救援计时 + 重连不跳变 | downed-rescue 第 5 例（推进 50→断开抓拍剩余窗口=550→断开期间 100tick 冻结→重连续 5tick=55，无跳变）；world.ts `if(a.disconnected) continue` 暂停；`setDisconnected` `if(disconnected && !a.disconnected)` 保证单次抓拍 | ✅ 已覆盖（sim-core headless） |
| 纪律 B | rescue.ts 无 hp/status 源码变异；enemy-ai.ts 未触碰 | 静态 grep rescue.ts（零 `hp=`/`status=`，已实跑 0 匹配）+ 源码审查（`capturePersonalState` 仅读参构造新对象）+ 静态 grep enemy-ai.ts（零 `rescue`，已实跑 0 匹配） | ✅ 已覆盖（静态 + 源码双保险） |
| D9 | GOLDEN_WORLD_HASH / GOLDEN_PLAYTEST_HASH 不变 | world-determinism.test.ts(3 例, `67b358c78…`) + playtest(`889a6e97…`, golden match=true) | ✅ 已覆盖（均未重锁） |
| —— | **明确 defer（越界/设计性/接线，非缺陷）** | —— | —— |
| D8 接线（C3/C10） | dungeon-server room-service 真实 socket 断线 → `World.setDisconnected` | `apps/dungeon-server/tests/d8-disconnect-wiring.test.ts`（端到端驱动 run-manager+room-service，spy+actors 双证 markDisconnected→setDisconnected(true) / validateReconnect→setDisconnected(false) / 玩家 B 不受影响） | ✅ 已覆盖（dungeon-server 28/28） |
| 客户端重连插值 | Godot 客户端用 PersonalState 还原（含 DOWNED 剩余窗口）无跳变渲染 | headless 未覆盖；属 S4.2/S4.4 客户端 | ⏸ DEFER（见下） |
| 阈值 P5 调优 | RESCUE_TICKS=90 / SOLO=300 / TIMEOUT=600 / REVIVAL_HP_RATIO=0.3 / MIN=30 平衡初稿 | 代码注释明示「平衡初稿待 P5 调优」 | ⏸ DEFER（见下） |

### 2.1 显式 DEFER 项（E7 专属，任务 brief 指定列出）
1. **room-service D8 接线（C3/C10）【已闭环】**：`World.setDisconnected` 已在 sim-core 落地并经单测/hook 烟测验证；现 **apps/dungeon-server room-service 已通过 `d8-disconnect-wiring.test.ts` 端到端接线**（`markDisconnected→world.setDisconnected(0,true)` / `validateReconnect→world.setDisconnected(0,false)`，玩家 B 不受影响；dungeon-server 28/28 已实跑 + QA 复验）。原 DEFER 移出，详见 §4 ✅ 已闭环。进入联机 playtest 前此缺口已闭合。
2. **客户端重连插值**：Godot 客户端用 `PersonalState`（含 `downedRemainingTicks`）做无跳变还原 + 100ms 插值为 S4.2/S4.4 范畴，headless 校验不到；属 Godot 客户端切片。非阻塞。
3. **阈值 P5 调优**：RESCUE_TICKS=90(≈3s) / SOLO_SELF_RESCUE_TICKS=300(≈10s) / DOWNED_TIMEOUT_TICKS=600(≈20s) / REVIVAL_HP_RATIO=0.3 / REVIVAL_HP_MIN=30 均为平衡初稿定值，代码注释明示「待 P5 调优」。机制正确、数值待平衡。非阻塞。

### 2.2 继承自 E6 的 DEFER（仍有效，E7 未改变）
- O-D 视觉渲染（telegraph/P3 静态可读）defer E12/⑬：world.ts 建敌人 telegraph 服务端状态，snapshot 未序列化 telegraph 字段。
- 敌人 AI 行为复杂度（技能/走位/编队）defer：S6.2 仅基础追击+攻击。
- R1 二进制 state-diff（C5 perf）defer：数据面仍为 JSON→Buffer 占位。
- S4.2/S4.4 客户端预测/插值 defer Godot。
- O-C（继承 E5）攻击 applyTick 未重验距离/权威位置（敌我同）defer：前摇结算按 targetId 直取，不重验几何。
- C-A 类型检查门（tsc --noEmit 未接，本仓未装 typescript）defer：**E7 类型安全仍仅靠 `--experimental-strip-types` 运行时剥离 + 全量跑通保障**，类型错误不阻断 CI（见 §3 C-A）。

### 2.3 建议补充的回归用例（design-strategist-6 协同；非本 read-only review 实现）
以下 5 条由 design-strategist-6 在 `production/design-review-e7.md`（O-G7/O-B7/O-C7）提出，QA 侧认可其测试价值；**本 review 为 read-only（不新增测试代码）**，故列为「建议后续 test pass 补」的回归用例，均非阻塞（与 §4 CONCERN #9 呼应）：
1. **救援半径几何边界（48px 含/不含）**：`withinRescueRadius` 用欧氏平方 `dx*dx+dy*dy <= 48*48` 比较，边界值易错；建议补 rescuer 距 ==48（应累积）与 ==48+ε（不累积）两例。当前 downed-rescue 仅用 0px（贴身）与 192px（远），未触边界。→ **net-new unit 回归**。
   > 实现提示（design-strategist-6 / O-G7）：须测「刚好 ≤48px 累积 / >48px 不累积」（欧氏平方比较，浮点/整数边界易错）——这是 O-G7 几何判定最直接的单测。
2. **多倒地互救死锁**：P0/P1 同时 DOWNED → 各自被 `rescueCandidates` 互过滤（对侧 DOWNED 排除）→ 均走 solo 分支 300tick 复活，无死锁、不误判 OUT。当前 solo 用例仅单人世界（无候选），未覆盖「双倒地互相排除」路径。→ **net-new unit 回归**。
3. **断线期间敌人转火**：downed P0 `setDisconnected(true)` 冻结计时，敌人经 `isOutEligibleTarget` 复用（DOWNED 排除）应转火存活者；验证 O-B7 行为在断线冻结下仍正确（world.ts 敌瞄 `actors.filter(t=>t.kind===PLAYER && isOutEligibleTarget(t.status))`）。→ **net-new integration 回归**。
   > 实现提示（design-strategist-6 / O-B7）：须断言 `setDisconnected(true)` 冻结计时期间，敌人经 `isOutEligibleTarget` 不再锁倒地者（验证 O-B7 复用的**实际行为**，而非仅不变量）。另：O-G7「rescue 仅倒地 PLAYER 序列化」条件须 GDScript 端口(C7)复刻，否则 `GOLDEN_WORLD_HASH` 跨语言对齐失败（已交 engineering-lead 协调，本 doc 仅引用 O-G7）。
4. **golden 回归**：E7 接入后重跑 world-determinism + playtest，断言双哈希逐字节不变 —— **本项已钉入 e7-smoke（步骤 1 全量含 world-determinism 3 例 + 步骤 3 playtest golden match=true）**，无需新增。
5. **OUT 后不误判结算**：P0 超时→OUT 后 world 继续 tick，ALIVE 队友可继续推进；团灭/settle 判定归 E11，本切片不触发。当前第 4 例仅断言 OUT 置位 + ALIVE 保留，未断言后续 tick 对存活队友无副作用。→ **net-new unit 回归**。

> 说明：上述 1/2/3/5 为 unit/integration 级回归，应落入 `downed-rescue.test.ts`（或新增 `e7-edge.test.ts`）；受本 review「read-only、不新增测试代码」约束，未实现，仅作后续 test pass 的待办建议。
> 设计语义一致性：solo 自救 `SOLO_SELF_RESCUE_TICKS=300`(10s) 与 ux-spec §0「自救 5s」偏差 2×，但 ux-spec 自标「非 ADR 待调」——**QA 不视为失败**，已归入 §2.1 DEFER #3（阈值 P5 调优，design-strategist-6 对应 O-A7），无需单独计为缺陷。

## 3. 测试所有权矩阵（unit vs integration）
| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| packages/sim-core/tests/unit/rng.test.ts | unit | E2(S2.4) | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/types.test.ts | unit | E2(S2.1–S2.3)/S4.3 | 7 | ✅ 绿（含 ENEMY_PROTOTYPES telegraphTicks≥18 断言） |
| packages/sim-core/tests/unit/input.test.ts | unit | E4(S4.1/S4.3)/C6/C11 | 6 | ✅ 绿 |
| packages/sim-core/tests/unit/combat.test.ts | unit | E5(S5.1–S5.7)/纪律B/S7.4 | 6 | ✅ 绿（S7.4 no-op 分支继承） |
| packages/sim-core/tests/unit/enemy-ai.test.ts | unit | E6(S6.1–S6.5)/O-E/O-D | 6 | ✅ 绿（E6 新增；enemy-ai.ts 零 rescue 引用，纪律 B） |
| packages/sim-core/tests/unit/world-dodge.test.ts | unit | O-M 回归（E6 闭环） | 5 | ✅ 绿 |
| packages/sim-core/tests/unit/downed-rescue.test.ts | unit | **E7(S7.1–S7.7/D8)** | **6** | ✅ 绿（E7 新增） |
| packages/sim-core/tests/golden/determinism.test.ts | golden | E3(S3.4)/D9 | 5 | ✅ 绿 |
| packages/sim-core/tests/golden/world-determinism.test.ts | golden | E5(S5/D9) | 3 | ✅ 绿（GOLDEN_WORLD_HASH 不变） |
| apps/dungeon-server/tests/room-service.test.ts | unit | E1(S1.1/S1.5/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/connection-registry.test.ts | unit | E1(S1.2) | 6 | ✅ 绿 |
| apps/dungeon-server/tests/run-runtime.test.ts | unit | E1(S1.3) | 3 | ✅ 绿 |
| apps/dungeon-server/tests/protocol.test.ts | unit | E1(S1.2/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/integration.test.ts | integration | E1(S1.3 端到端) | 1 | ✅ 绿 |
| apps/dungeon-server/tests/input-routing.test.ts | integration | E4(S4.1/S4.3)/C11 | 1 | ✅ 绿 |
| apps/dungeon-server/tests/d8-disconnect-wiring.test.ts | unit | **E7(S7.6/D8/C3/C10)** | **1** | ✅ 绿（E7 新增；端到端 markDisconnected→setDisconnected(true) / validateReconnect→setDisconnected(false)，玩家 B 不受影响） |
| scripts/playtest-core-loop.mjs（验证门，非单测文件） | smoke/harness | 核心循环 | 7 检查 | ✅ 7/7 EXIT 0（GOLDEN_PLAYTEST_HASH 不变） |
| 合计 | — | — | 79 单测 + 7 验证 | ✅ 51(sim-core)+28(dungeon-server) 全绿 + playtest 7/7 |

C-A/C-B 状态栏（沿用 qa-plan-e5/e6 口径，E7 维持）：
- C-A（类型检查门）：sim-core 与 dungeon-server 跨包 import 仅靠 `--experimental-strip-types` 跑通，不类型检查。**本仓仍未装 typescript**，tsc --noEmit 暂不能跑；类型错误不阻断 CI（E2 遗留，与 E7 无关）。E7 新增 rescue.ts/world.ts E7 loop/setDisconnected/combat S7.4 分支均经全量跑通 + 静态审查，类型风险低。状态：⚠️ 仍待装包接门。
- C-B（schema 不变量单测）：WorldSnapshot.lastProcessedSeq 不变量（types.test.ts）+ 纪律 B 静态契约（combat.test.ts E5-era 第 6 例 + **本 Phase rescue.ts 零 `hp=`/`status=` 变异、enemy-ai.ts 零 rescue 引用**）+ `ENEMY_PROTOTYPES.telegraphTicks≥18`（types.test）+ GOLDEN_WORLD_HASH/GOLDEN_PLAYTEST_HASH 双 golden 均覆盖（且 E7 未变）。状态：✅ 关闭。

## 4. E7 质量门判定
- 判定：**PASS（带 9 项非阻塞 CONCERNS；全部属设计性 defer / 平衡初稿 / 覆盖建议 / O-C 继承 / C-A 继承；无阻塞项）**。
- 阻塞项（合入门）：**无**。E7 系统⑪ 倒地/救援/超时 OUT 实现与核心契约自洽：sim-core **51/51 + #fail 0**（已实跑确认）、dungeon-server **28/28**（D8 新增 d8-disconnect-wiring 1 例，已实跑绿）、playtest harness **7/7 EXIT 0**（GOLDEN_PLAYTEST_HASH `889a6e97…` 不变、golden match=true）；双 golden（world `67b358c78…` / playtest `889a6e97…`）均字节相等且 E7 未改动战斗/移动/AI/前摇路径 → **无需重锁**；S7.1/S7.2/S7.4/S7.5/S7.6/D8 全部由 downed-rescue.test.ts 6 例逐条正面覆盖（revive via rescue / DOWNED 免疫补刀且 OUT 绝不经由伤害 / solo 自救 1hp / 超时→OUT / 断线抓拍+暂停+重连不跳变 / 读条不衰减）；**纪律 B 静态 + 源码双确认**（rescue.ts 零 hp/status 变异、enemy-ai.ts 零 rescue 引用，均 grep 0 匹配）。
- CONCERNS（非阻塞）：
  1. **客户端重连插值 DEFER（E7 专属）**：Godot 用 PersonalState 还原（含 DOWNED 剩余窗口）无跳变渲染属 S4.2/S4.4，headless 未覆盖。非阻塞。
  2. **阈值 P5 调优 DEFER（E7 专属）**：RESCUE_TICKS/SOLO/TIMEOUT/REVIVAL 均为平衡初稿定值，机制正确数值待 P5。非阻塞。
  3. **OUT 目标再受击无专门负向测试（观察，非缺陷）**：S7.4 no-op 分支同时覆盖 `DOWNED|OUT`，DOWNED 免疫由 downed-rescue 第 2 例正面覆盖；OUT 目标的「再受击仍 no-op」仅由代码审查确认（分支含 OUT），无独立用例。建议后续补一条「已 OUT 目标提交伤害→status 不变」的窄用例以闭合该分支的测试证据。非阻塞。
  4. **O-D 视觉渲染 defer E12/⑬（继承）**：snapshot 未序列化 telegraph 字段，P3 渲染未测。非阻塞。
  5. **敌人 AI 行为复杂度 defer（继承）**：S6.2 仅基础追击+攻击。非阻塞。
  6. **R1 二进制 state-diff defer（继承）**：30Hz×4 带宽/p95 未验证。非阻塞。
  7. **S4.2/S4.4 客户端预测/插值 defer Godot（继承）**：服务端 reconciliation 钩子就绪，客户端未校验。非阻塞。
  8. **O-C（继承 E5）+ C-A（继承 E2）**：攻击 applyTick 未重验几何（敌我同）；类型门 tsc 未接，跨包类型错误不阻断 CI。非阻塞。
  9. **建议补充回归用例（design-strategist-6 协同，见 §2.3）**：边界(48px 含/不含)/多倒地互救死锁/断线期间敌人转火/OUT 后不误判结算 共 4 条 net-new unit/integration 回归（design-strategist-6 第 4 条 golden 回归已钉入 e7-smoke，无需新增）；当前未实现，受本 review read-only 约束（不新增测试代码），列为后续 test pass 待办。非阻塞。10s-vs-5s 自救偏差已归 §2.1 DEFER #3（P5 调优，对应其 O-A7），不视为失败。
- 放行建议：E7 系统⑪ 倒地/救援/超时 OUT（S7.1–S7.7 + D8）可放行进入 E8/E12/Godot 客户端切片；纪律 B / D9（双 golden 不变）/ C11（裁决真相源未变）/ S7.4（免疫补刀 + OUT 仅超时）全部闭环。待补项（均非阻塞）：客户端重连插值（Godot）、OUT 再受击窄用例、阈值 P5 调优、O-D 视觉渲染（E12/⑬）、O-C 范围重校验、R1/S4.2/S4.4、C-A 类型门装包。

## 5. 后续 Sprint 衔接 TODO
- E8/⑨：技能差异化（救援/超时机制可作为技能冷却上下文；平衡初稿 P5 调优）。
- room-service（C3/C10）：**D8 路由层已闭环**（d8-disconnect-wiring 28/28：markDisconnected→setDisconnected(true) / validateReconnect→setDisconnected(false)，玩家 B 不受影响）；**socket 事件黏合已实跑确认存在**（gateway `ws.on("close")`→markDisconnected L167、ping 超时→markDisconnected L139、protocol `session.reconnect`→validateReconnect L199，两端均驱动权威 World，O-K6 接收层完整）。**真正剩余**：重连时把捕获的 PersonalState 下发客户端做无跳变还原（Godot S4.2/S4.4，headless 未覆盖；E7 DEFER #2，非阻塞；详见 qa-plan-d8 §4 CONCERN #8）。
- Godot 客户端：用 PersonalState（含 downedRemainingTicks）做重连无跳变还原 + S4.2/S4.4 预测插值（E7 DEFER #2）。
- E12/⑬：O-D telegraph 视觉渲染 + snapshot 序列化 telegraph 字段。
- 全程：GDScript 端口对齐 RNG 锚点 + GOLDEN_LAYOUT_HASH + GOLDEN_WORLD_HASH + GOLDEN_PLAYTEST_HASH（C7/D9 跨语言）；其中 GOLDEN_WORLD_HASH / GOLDEN_PLAYTEST_HASH E7 已验证不变，端口对齐基线稳定。
- **后续 test pass（design-strategist-6 协同，见 §2.3）**：补 救援半径几何边界 / 多倒地互救死锁 / 断线期间敌人转火 / OUT 后不误判结算 共 4 条 net-new unit/integration 回归（本 review read-only 未实现）。
