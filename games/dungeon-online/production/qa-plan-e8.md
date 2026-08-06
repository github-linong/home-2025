# E8 协作技（系统⑨，闭合 O-A 设计缺口）· QA 计划
路径：production/qa-plan-e8.md ｜ 作者：严守真（quality-lead-1）｜ 状态：已落盘（Phase 5 质量循环）
对齐：test-framework.md 四层 + control-checklist C11/B 纪律 / D9 / S8；epics E8(S8.1–S8.3)；系统⑨（协作技）/系统⑦（统一结算权威）/系统⑧（敌人 AI 目标选择）/系统⑪（救援读条）
运行环境：Node 22.6+（已用 v22.22.2 验证；与 E6/E7 同基线）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）；sim-core 无外部依赖
约束：本文件仅评审与文档产出，不修改任何 src/test 文件（read-only review）。
独立复验（已实跑确认）：sim-core **unit 51/51 绿**（#fail 0）、sim-core **golden 8/8 绿**（#fail 0）、dungeon-server **28/28 绿**（#fail 0）、playtest harness **EXIT 0（7/7）**；GOLDEN_WORLD_HASH（`67b358c78…`）与 GOLDEN_PLAYTEST_HASH（`889a6e97…`）均字节相等且未变（非循环自证，双 golden 守门）；纪律 B 静态 grep 全量仅命中 skills.ts 一处注释行、零真实 `hp=`/`status=` 赋值。

> 注：sim-core unit 全量 51 例的构成 = **E8 之前 baseline 43 + 本 Epic 新增 coop-skill.test.ts 8 例** = 51（与 e8-implementation-note.md 一致，已逐文件重数核实：combat 6 / world-dodge 5 / enemy-ai 6 / input 6 / types 7 / coop-skill 8 / rng 7 / downed-rescue 6 = 51）。golden 全量 8 例 = determinism 5 + world-determinism 3。
> dungeon-server 全量 28 例：E7 收口 D8 接线（`d8-disconnect-wiring.test.ts`）后由 27→28，本 Epic 未改 dungeon-server，28/28 证实零回归。

## 1. E8 测试策略（四层映射）
E8 本 Phase 范围 = S8.1（SHIELD_ALLY 减伤护盾）/ S8.2（REVIVE_BOOST 加速倒地救援）/ S8.3（TAUNT 吸引敌火）/ 目标模式校验（ALLY 必须指向「其他玩家」、SELF 仅自身、ENEMY 预留）/ 冷却强制 / 纪律 B（所有 hp/status 改变只经 `combat.resolveDamage` 与 `world.step` 两个单一出口）。**落地集中在 4 个既有 src 文件 + 1 个新纯模块**：
- `types.ts`（SKILL_PROTOTYPES / SkillTargetMode / SKILL_IDS / SkillApplication 数据 + 类型，纯数据无逻辑）
- `skills.ts`（**新增纯模块**：`resolveSkillApplication()` 仅做校验 + 效果数学，产出不可变 `SkillApplication` 意图，绝不直改实体）
- `world.ts`（`world.step` 消费意图落地 shield/revive/taunt + 冷却；`snapshot()` 不序列化协作技状态字段）
- `combat.ts`（`resolveDamage` 内新增 SHIELD_ALLY 减伤分支，单一 hp 结算出口）
- `enemy-ai.ts`（新增只读 `taunt?: boolean` 标志，据嘲讽池优先锁定；未新增任何 `hp=`/`status=` 变更，未运行时 import combat/dungeon-gen）

### 1.1 sim-core 单测（unit）
- **协作技三技能 + 纪律 B + 冷却 + 目标校验 + 纯函数（coop-skill.test.ts）**：8 项绿（E8 新增），逐条对应 §2 矩阵。状态：已实跑确认（unit 51/51 含此 8 例）。
- **纪律 B 静态契约（skills.ts 源码审查 + 静态 grep）**：coop-skill.test.ts 第 7 例在运行时读取 skills.ts 源码，断言其不含 `.hp=`/`.status=` 变异且未运行时 import combat/dungeon-gen；同时全仓 `grep -rnE "\.hp\s*=|status\s*=" packages/sim-core/src | grep -vE "combat\.ts|world\.ts"` 实跑仅命中 skills.ts:13 一行注释，**零真实赋值**。状态：✅ 关闭（单测 + 静态 grep 双保险）。
- **既有单测回归**：combat 6 / enemy-ai 6 / world-dodge 5 / input 6 / types 7 / rng 7 / downed-rescue 6 全部仍绿，确认 SHIELD_ALLY 减伤分支（combat.ts）与 world.step 协作技路由重写未破坏玩家/敌人正常结算、倒地/救援、DODGE、C11 裁决。状态：✅ 绿（build 51/51 含）。

### 1.2 确定性 golden（golden，对应 D9）
- **GOLDEN_WORLD_HASH = `67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`**（world-determinism.test.ts，E5 锁定、E6 因敌人移速重锁；**E8 仅新增 Actor 协作技运行时字段且 `snapshot()` 未序列化这些字段、golden 固定序列不发 SKILL 输入 → 哈希不变，无需重锁**）。状态：world-determinism.test.ts 3 项 + determinism.test.ts 5 项 = **8/8 绿**（已实跑确认）。
- **GOLDEN_PLAYTEST_HASH = `889a6e972dbac53a89912b1fa28b68fbc53623f764b0e3fea65b233d4e4fca14`**（playtest-core-loop.mjs，220-tick 核心循环，3 次重跑字节相等）。playtest 固定序列只发 ATTACK/DODGE/MOVE，技能意图路径不进入核心闭环 → **golden 不变，无需重锁**。状态：playtest harness 7/7 EXIT 0、`golden match=true`（已实跑确认，本次观测 hash 与该常量逐字符相等）。
- GOLDEN_LAYOUT_HASH 不受影响（dungeon-gen 未改）。

### 1.3 集成 / 端到端（integration，对应 C11/B）
- **协作技端到端**：coop-skill.test.ts 第 1/2/3/4 例经由真实 `createWorld` + `enqueueInput` + `world.step` 驱动，端到端验证 SHIELD_ALLY 护盾落地 + 经 `resolveDamage` 减伤、REVIVE_BOOST 加速倒地救援读条、TAUNT 改变敌人 AI 目标选择（含对照组）。状态：✅ 已覆盖（sim-core headless）。
- **dungeon-server**：E8 未改 `apps/dungeon-server/src/`（git diff 仅含 sim-core/src 4 文件 + 设计文档），`npm test` 28/28 绿证实网关/房间/断线接线零回归。状态：✅ 绿。
- 注：协作技意图路径经 `InputCmd(action=SKILL, target, param)` 走既有 E4 每玩家输入路由 + C11 seq 防重放，无新增网关代码路径，故既有 input-routing / integration 端到端已间接覆盖其「输入可达性」（具体协作效果在 sim-core headless 层正面验证）。

### 1.4 性能 / 反作弊（perf / security）
- **C11 完整反作弊（继承）**：协作技意图 `SkillApplication` 只携带 targetId/skillId/冷却/效果 tick，**绝不携带伤害数值**（与 CombatIntent 纪律一致）；真实落地仍经 `world.step`/`combat.resolveDamage` 权威裁决。状态：✅ 已覆盖（skills.ts 纯模块 + coop-skill 第 7/8 例）。
- C5 perf（30Hz×4 二进制 diff 预算）：未做（R1 遗留）。状态：⏸ defer。

## 2. E8 ↔ 验收条件矩阵（O-A 闭合）
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| S8.1 | SHIELD_ALLY：给目标盟友施加减伤护盾窗口（×0.5，3s=90tick），冷却 12s=360tick | coop-skill.test.ts 第 1 例（shieldUntilTick=90、shieldReduction=0.5、cooldownUntilTick=360、target hp/status 未被直改） | ✅ 已覆盖 |
| S8.1 | SHIELD_ALLY 减伤经 `combat.resolveDamage` 单一出口生效（18×(1−0.5)=9） | coop-skill.test.ts 第 2 例（resolveDamage 落 9 点伤害、deltaHp 一致） | ✅ 已覆盖 |
| S8.2 | REVIVE_BOOST：给倒地盟友救援读条 +1.5s=45tick，加速归队；健康盟友 no-op | coop-skill.test.ts 第 3 例（DOWNED 盟友 rescueTicks +=45、caster 进冷却；健康盟友零加成、零冷却） | ✅ 已覆盖 |
| S8.3 | TAUNT：施法者吸引敌火（敌人 AI 优先锁定嘲讽者，保护队友），冷却 14s=420tick | coop-skill.test.ts 第 4 例（对照组锁定最近盟友 → 嘲讽后改锁施法者；tauntUntilTick>0、进冷却） | ✅ 已覆盖 |
| S8 | 冷却强制：冷却内不可再次施放（不刷新、不二次落地） | coop-skill.test.ts 第 5 例（冷却内重放 → cooldown 不刷新、shield 不重设） | ✅ 已覆盖 |
| S8 | 协作技只能指向「其他玩家盟友」：self / enemy → no-op 且不进冷却 | coop-skill.test.ts 第 6 例（self/enemy 目标均被拒、零冷却消耗） | ✅ 已覆盖 |
| 纪律 B | skills.ts 无 `hp=`/`status=` 源码变异；不运行时 import combat/dungeon-gen | coop-skill.test.ts 第 7 例（源码断言）+ 全仓静态 grep（仅 skills.ts:13 注释行） | ✅ 已覆盖（单测 + 静态双保险） |
| S8 | 纯函数 `resolveSkillApplication`：目标模式 / DOWNED 要求 / 未知 id / 托管中校验 | coop-skill.test.ts 第 8 例（8 条分支断言：盟友有效 / self 拒 / enemy 拒 / 健康盟友 REVIVE 拒 / DOWNED 盟友 REVIVE 有效 / TAUNT SELF 有效 / 未知 id 拒 / 托管中拒） | ✅ 已覆盖 |
| O-A | 协作技从「未分化」→ 真正协同技（护盾/急救链/嘲讽三技能落地并单测） | 上述 8 例 + types.ts SKILL_PROTOTYPES + world.step 路由 + combat 减伤分支 | ✅ 已闭合（从 QA 视角） |
| D9 | GOLDEN_WORLD_HASH / GOLDEN_PLAYTEST_HASH 不变 | world-determinism.test.ts(3) + determinism.test.ts(5) = 8/8；playtest golden match=true | ✅ 已覆盖（均未重锁） |
| —— | **明确 DEFER（越界/设计性/接线，非缺陷）** | —— | —— |
| 客户端技能触发/HUD/视觉 | Godot 实现技能触发输入、HUD 技能槽与冷却环、护盾/嘲讽视觉（阵营色） | headless 未覆盖；属 O-E7（独立 Epic）客户端切片 | ⏸ DEFER |
| 核心循环集成覆盖 | 220-tick 核心闭环 golden/playtest 实际发出 SKILL 输入（含双玩家协作场景） | 当前 golden/playtest 固定序列不发 SKILL；仅 coop-skill.test.ts 8 例覆盖 | ⏸ DEFER（见 §3 关注点 a） |
| 阈值 P5 调优 | shieldReduction=0.5 / 各 CD 与窗口时长（360/300/420/90/45/120）为初稿 | 代码注释 + e8-implementation-note.md §1/§6 明示「平衡初稿待 P5 调优」 | ⏸ DEFER（见 §3 关注点 b） |

## 3. 关注点（CONCERNS，全部非阻塞）
> 以下项不影响 E8 合入门（已有单测 + 全量绿 + golden 稳定），列为后续跟进建议，供 team-lead 排期。

- **(a) 核心循环集成覆盖缺口（design-strategist-3 在 design-review-e8.md §6.3 以 C1 协同确认，结论一致）**：协作技目前**未被** 220-tick 核心闭环 golden / playtest 实际触发——golden 固定序列不发 SKILL 输入，且新增 Actor 字段未进 `snapshot()` 序列化，故 golden 永远不触及技能路径；技能正确性**仅由 coop-skill.test.ts 8 例**（纯逻辑层）覆盖，集成层是盲点。coop-skill 现有 8 例已守三技落地 + 纪律 B，但**未覆盖端到端时序**：
  - `coop-skill.test.ts` 第 2 例只验 SHIELD 减伤（×0.5），**未验「护盾叠加 i-frame 的优先级」**（实现说明 §5 声明 i-frame 优先全额免伤，但无单测/集成断言）。
  - 第 3 例对倒地盟友 `rescueTicks += 45` 时**显式把玩家摆到 RESCUE_RADIUS 外**以隔离护盾加成，故**未验「+45 在邻近队友在场时实际加速归队（而非绕过 ⑪ 救援半径）」**——即「+45 是否真的让倒地盟友更快满 RESCUE_TICKS 复活」未经端到端验证。
  - 第 4 例 TAUNT 翻目标仅用 2 人（非嘲讽者更近），**未验「3+ 玩家中嘲讽期间敌人目标池收窄 / 多嘲讽者并存」**。
  - **建议回归用例 backlog（跟进，非阻塞）**：① 2–4 人协作技时序用例（shield 减伤叠加 i-frame 优先级、revive 对倒地盟友 `rescueTicks` 跳增 + 邻近判定、taunt 期间敌人目标池收窄）；② 倒地急救链 + 邻近队友的端到端救援归队（验证 +45 tick 实际加速而非绕过 ⑪ 救援半径，玩家需置于 RESCUE_RADIUS 内并走到 RESCUE_TICKS 阈值）。**最佳落点**：在 `playtest-core-loop.mjs` 验证台新增一个 co-op 场景（如 P1 嘲讽 + P2 护盾 + 倒地 P3 急救链），并将其纳入确定性 golden 守门。
  - **⚠ 硬前置卡点（C5 / O-?1，design-strategist-3 review §6.3 登记）**：co-op golden 场景在 `playtest-core-loop.mjs` 落地**之前**，须先由 engineering 在 `EntityState` 补可选序列化字段（`shieldUntilTick` / `shieldReduction` / `tauntUntilTick` / `activeSkill` / `cooldownUntilTick`）；否则协作技态无法跨语言对齐、golden 也读不到。补字段时**必须复刻「条件性附加」**——仅对「持有该态的实体」带字段、未持有则不写键（JSON 丢弃 undefined），否则 `GOLDEN_WORLD_HASH` 会与 E8 前基线漂移。这正是 ⑪ O-H7（`rescue` 字段仅倒地 PLAYER 带）已验证过的先例，可让 engineering-lead 照抄该模式（world.snapshot 当前只映射 `id/kind/pos/dir/hp/maxHp/status/statusEffects/ownerId/rescue`，协作技字段不在内 → 这恰是 golden 零回归的原因，不能破坏）。该「补字段 + 条件性附加」属 C7/Godot 客户端切片，归 E12 ⑬；**建议将其列为 co-op golden 场景的前置卡点**，避免 QA 先写场景、工程滞后导致 golden 无法对齐。
  - 其余 CONCERNS（C2 平衡初稿 / C4 O-?2 per-class 愿景 / C5 客户端同步 / C6 O-?3 急救链叠加语义）详见 design-strategist-3 `production/design-review-e8.md` §6.3（文件已落盘，绝对路径 `/Users/lnmacmini/Projects/personal-site/games/dungeon-online/production/design-review-e8.md`）。本项与 C1 均非阻塞、不阻 E8 合入门，与 PASS 判定一致。
- **(b) 平衡常量初稿**：减伤比例 0.5、各冷却/窗口时长（360/300/420/90/45/120 tick）均为 P5 第一稿，集中在 `SKILL_PROTOTYPES` 便于调。建议接入真实 4 职业后按 GDD⑨ S8.3（坦护盾墙 / 医者救援链 / 控场合围）差异化调优。机制正确、数值待平衡。
- **(c) 冷却强制仅单元级验证**：冷却门控（冷却内重放被忽略、不进冷却、不二次落地）在 coop-skill.test.ts 第 5 例正面验证，但端到端（经网关 + 真实多 tick 时序 + 断线托管期间冷却计时）未在集成层复测。建议后续补一个「多 tick 真实时序冷却」集成用例。
- **(d) 客户端未实现**：协作技触发输入、HUD 技能槽/冷却环、护盾/嘲讽视觉均属 Godot 客户端（O-E7 独立 Epic），本仓无需改动即可维持确定性；接入客户端时 `EntityState` 需补可选字段同步 shield/taunt 状态（world.snapshot 当前有意不序列化，保 golden 稳定）。

## 4. 权责矩阵（ownership）
| 项 | 负责成员 | 本次状态 |
|---|---|---|
| 协作技实现（skills.ts/types.ts/world.ts/combat.ts/enemy-ai.ts） | 程基岩（engineering-lead） | 已实现，未提交（working-tree，符合指示） |
| 单测覆盖（coop-skill.test.ts 8 例） | 程基岩（engineering-lead） | 已新增，8/8 绿 |
| QA 计划 + 烟雾清单 + 全量复验 + 纪律 B grep | 严守真（quality-lead-1） | 本文件 + tests/smoke/e8-smoke.md，已落盘 |
| GDD⑨ S8.3 协作技 UX / 数值差异化 | design-strategist / content-designer（并行，不在 E8 代码范围） | 设计文档并行编辑中（git 显示 design/gdd/*.md 改动，非 QA 门控项） |
| Godot 客户端技能触发/HUD/视觉 | client/art（O-E7 独立 Epic） | DEFER（见 §3 d） |
| 平衡 P5 调优 | design-strategist + engineering（P5） | DEFER（见 §3 b） |

## 5. 质量门判定（QA Verdict）
- **E8 合入门判定：✅ PASS（非 FAIL / 非 CONCERNS 阻塞）**
  - 全部 4 个套件实跑绿：sim-core unit **51/51**、golden **8/8**、dungeon-server **28/28**、playtest **7/7 EXIT 0**。
  - 纪律 B 守约：全仓 `hp=`/`status=` 变异仅出现在 `combat.ts`/`world.ts`；skills.ts/enemy-ai.ts/types.ts/rescue.ts/input.ts 零真实赋值（grep 仅命中注释）。
  - 双 golden 字节相等、未变（非循环自证）。
  - O-A 设计缺口从 QA 视角**已闭合**：协作技从「未分化」→ 三技能落地并经 8 例单测覆盖，机制正确、确定性 intact。
- 放行建议：可放行合入门；§3 (a)–(d) 关注点建议排期跟进，不阻塞本次合入。
- 文档一致性提示（非阻塞）：E7 的 `qa-plan-e7.md` 记录 E8 之前 sim-core baseline 为 51（45 E6 + 6 E7），与 E8 实现说明「baseline 43 + 8 = 51」表述不一致（差 2 例）。实跑当前 unit 总数为 51、E8 新增 8 例 → 真实 baseline 应为 43。建议后续统一两文档的 baseline 计数口径（疑似 E7 文档超计 2 例或期间有 2 例被合并/移除），不影响门控结论。
