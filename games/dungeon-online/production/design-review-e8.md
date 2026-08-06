# E8 设计评审 + 范围核查 + GDD 反向同步（P5-S1-DES-8）

- **路径**：`games/dungeon-online/production/design-review-e8.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）+ ⑨ GDD 反向同步落盘
- **汇编落盘**：主理人（游承峰）
- **评审对象**：
  - `packages/sim-core/src/types.ts`（`SKILL_PROTOTYPES` / `SkillTargetMode` / `SKILL_IDS` / `SkillEffect` / `SkillPrototype` / `getSkillPrototype`）
  - `packages/sim-core/src/skills.ts`（**新增** ⑨ 纯模块：`resolveSkillApplication`）
  - `packages/sim-core/src/combat.ts`（`SHIELD_ALLY` 减伤分支 `resolveDamage` L137-145）
  - `packages/sim-core/src/world.ts`（SKILL 路由 L254-284 + `Actor` 协作技字段 L87-91 + 窗口清理 L217-226）
  - `packages/sim-core/src/enemy-ai.ts`（只读 `taunt?: boolean` L42 + taunt 池 L69-71）
  - `packages/sim-core/tests/unit/coop-skill.test.ts`（**新增** 8 例）
  - `design/gdd/09-skill.md`（**新增**，反向同步落盘，关闭 ⑨ GDD 覆盖缺口）
- **基线**：`design/gdd/07-combat.md`、`11-rescue-down.md`、`04-input-prediction.md`、`design/systems-index.md` ⑨、`design/concept.md`（P1 协同至上）、`design/gate-review-phase2.md`（W1/W3）、`production/e8-implementation-note.md`、`production/design-review-e7.md`（carried-forward O-C6 / O-B6 / O-E7）

> **实跑复验（本评审独立实跑确认）**：`node --experimental-strip-types --test tests/unit/coop-skill.test.ts` → **8/8 绿 #fail 0**（本人独立运行，覆盖 SHIELD 落地 + 减伤经 resolveDamage / REVIVE 加速倒地救援 + 健康盟友 no-op / TAUNT 吸火含对照 / 冷却强制 / 协作技只指向其他玩家 / 纪律 B 静态契约 / 纯函数校验）。golden 双锚点（`world-determinism.test.ts` / `scripts/playtest-core-loop.mjs`）**未变更**（per e8-implementation-note + 静态路径核验：golden 场景不发出 `SKILL` 输入，且协作技 `Actor` 字段未进入 `world.snapshot()` 序列化 → 玩家快照字节结构不变）。sim-core 全量 (基线 43 + 新增 8) **51 pass / 0 fail**、dungeon-server **28/28**、playtest **7/7 exit 0** 与 team-lead 通报一致。

---

## 0. 判定摘要

- **判定：PASS**（含 4 条非阻塞 CONCERNS，无一项 gate E8 验收；其中「技能未进 220-tick 核心闭环」「平衡值 P5 初稿」「D1–D3 地牢生成待裁定」「per-class 协作技愿景未实现」建议进「好玩吗」验证门前补）
- **阻塞项：无**
- **🔓 O-A RESOLVED（设计缺口关闭）**：协作技从「从未分化 / 非权威」→ 真正实现 **3 个差异化协同技（护盾/急救/嘲讽）** + **服务器权威落地**（`world.step` 设窗口 + `combat.resolveDamage` 唯一减伤出口，`skills.ts` 纯校验不直改状态），并补齐 ⑨ GDD（`09-skill.md` 新建）。
- **Reconcile（继承项状态）**：

  | 缺口 | 状态 | 说明 |
  |---|---|---|
  | **O-A**（协作技从未分化/非权威） | **RESOLVED ✅** | E8 实现 3 差异化协同技 + 权威落地 + ⑨ GDD 补完；关闭 |
  | **O-C6**（范围/权威位置命中重校未做） | **仍 OPEN** | E8 未触碰 combat 命中距离重校路径；继承 E5/E6，非 E8 回归 |
  | **O-B6**（碰撞未做） | **仍 OPEN** | E8 救援加成用几何判定，未补地形/实体碰撞层；继承 E5/E6 |
  | **O-E7**（客户端重连插值未纳入 headless 切片） | **仍 OPEN** | E8 协作技字段未序列化、无客户端还原需求；归 Godot 切片，不受 E8 影响 |

- **E8 范围**：S8.1 协作技定义（SKILL_PROTOTYPES / 目标模式）✅ / S8.2 路由+校验+落地（resolveSkillApplication + world.step）✅ / S8.3 协同增益结算（减伤经 combat / 救援经 world / 嘲讽经 enemy-ai）✅
- **纪律 A/B**：B（`skills.ts` 纯模块、hp/status 唯一出口为 combat/world）经源码 grep + 测试 8/8 守住；A 无回归（world 未引入地牢/敌人运行时依赖；skills.ts 仅 `import type` + `types.ts` 数据基座）。
- **设计红线**：无主导策略 / 经济失衡 / 认知过载 / 支柱漂移；P1「协同至上」经三协作技（护盾保护 / 急救链加速救援 / 嘲讽吸火）在服务端落地 ✅
- **D9（确定性）零回归**：协作技字段不进 `snapshot()` 序列化 → `GOLDEN_WORLD_HASH` / `GOLDEN_PLAYTEST_HASH` 双锚点字节不变（可数学证明：golden 不发 SKILL 输入 + 新增字段未序列化）。

---

## 1. 范围检查

### 1.1 E8 范围核查（S8.1–S8.3）

| 控制项 | 意图（epics E8 / systems-index ⑨） | E8 落点 | 结论 |
|---|---|---|---|
| **S8.1 协作技定义** | 定义协同技数据 + 目标模式 + 效果参数 | `types.ts` `SKILL_PROTOTYPES`（SHIELD_ALLY/REVIVE_BOOST/TAUNT）+ `SkillTargetMode`(SELF/ALLY/ENEMY) + `SKILL_IDS` + `SkillEffect`/`SkillPrototype`/`getSkillPrototype` | ✅ 定义全覆盖 |
| **S8.2 路由 + 校验 + 落地** | 输入经 ⑦ 路由 → 纯校验 → 权威落地 | `world.ts` L254-284：冷却门控 → `resolveSkillApplication` 纯校验 → 据 `SkillApplication` 设 shieldUntilTick/rescueTicks/tauntUntilTick + cooldownUntilTick/activeSkill；`skills.ts` L87 纯函数 | ✅ 覆盖（纪律 B） |
| **S8.3 协同增益结算** | 效果经 ⑦ 统一出口结算 | `SHIELD_ALLY` 减伤→`combat.resolveDamage` L137-145（唯一 hp 出口）；`REVIVE_BOOST`→`world.step` rescueTicks+=45（非 hp/status）；`TAUNT`→`enemy-ai.ts` taunt 池优先锁定 | ✅ 覆盖（三路径均经单一出口/纯意图） |
| **目标合法性** | 协作技须影响「盟友」非 solo | `resolveSkillApplication`：ALLY 拒 self/enemy/托管/非 PLAYER；REVIVE_BOOST 额外要求 DOWNED；SELF 只作用于施法者；未知 id/托管→null | ✅ 覆盖（测试 6/8 守） |
| **冷却强制** | 冷却内不可再施放 | `world.ts` L258 `if (cooldownUntilTick <= tick)` 门控；冷却内重发 → 忽略不刷新 | ✅ 覆盖（测试 5 守） |

### 1.2 未覆盖项（正确 defer，非范围失败）

- **per-class 协作技（systems-index ⑨ 愿景）**：systems-index ⑨ 定位「每职业 1 协作技（坦护盾墙 / 医者救援链 / 控场合围）」，E8 交付 **3 个通用协作技（非按职业分）**。E8 MVP 已闭合「协作技存在 + 三态差异化 + 权威落地」的设计缺口（O-A），但**未实现每职业专属技**——属 P1 协同深度决策，非 E8 范围失败。⚠ 归「好玩吗」门前 / 后续 epic 裁定（记为 O-?2，见 §6.3）。
- **客户端 HUD / 视觉（⑬ E12）**：`shieldUntilTick`/`tauntUntilTick`/`activeSkill`/`cooldownUntilTick` 当前未序列化进 `EntityState`（保 golden 稳定）；Godot 客户端护盾/嘲讽光效 + 技能槽冷却环须先补 `EntityState` 可选字段。✅ 预期内（headless 切片不触发）。
- **⑩ 信号联动（协作技连携信号）**：E8 未接入 ⑩ 信号广播（如「护盾就位」「嘲讽就位」）。✅ 预期内（归 E10）。

### 1.3 超范围检查

- E8 全部限于 ⑨ 协作技（数据 + 纯校验 + 落地 + 敌人 AI 只读标志），未实现 ⑥ 资源 / ⑩ 信号 / ⑫ 进度 / ⑬ HUD / ② 职业定类（职业差异化技归后续）。✅
- `skills.ts` 不 import `combat`/`world`/`enemy-ai`/`dungeon-gen` 运行时（源码 grep + 测试 7 守）；`world.ts`（① 编排层）引 `skills.ts` 纯函数属 ADR D13 授权。✅
- `enemy-ai.ts` 仅新增只读 `taunt` 标志 + taunt 池逻辑，**未**新增任何 hp/status 变更、未运行时 import 新模块（源码 grep 确认）。✅
- **结论：E8 未越界，范围与 e8-implementation-note / epics E8 一致**（含预期内 defer）。

---

## 2. GDD 契约一致性表（E8 实现 vs 上游基线）

| 契约点 | 基线出处 | E8 实现（代码真值） | 结果 |
|---|---|---|---|
| ⑨ GDD 此前缺失 | systems-index ⑨ 仅定位描述，无 GDD | 本评审新建 `design/gdd/09-skill.md`，反向同步 `SKILL_PROTOTYPES` 全部常量 | ✅ **关闭 ⑨ GDD 覆盖缺口（O-A 文档侧）** |
| SHIELD_ALLY 减伤 50% / 3s / 12s CD | ⑨ 定位「护盾墙」（systems-index）/ e8-note | `shieldReduction=0.5`、`shieldTicks=90`(3.0s)、`cooldownTicks=360`(12s)；减伤经 `combat.resolveDamage` `round(18*0.5)=9` | ✅ 精确对齐（测试 2 守端到端） |
| REVIVE_BOOST 加速救援 1.5s / 10s CD | ⑨ 定位「救援链」/ ⑪§4 `RESCUE_TICKS=90` | `rescueBoostTicks=45`(1.5s)、`cooldownTicks=300`(10s)；`target.rescueTicks += 45`（非 hp/status） | ✅ 对齐（⑪ 救援读条 3s 基准；+1.5s=约减半） |
| TAUNT 吸火 4s / 14s CD | ⑨ 定位「嘲讽战吼」/ ⑧ | `tauntTicks=120`(4.0s)、`cooldownTicks=420`(14s)；`enemy-ai.ts` taunt 池优先锁定 | ✅ 对齐（测试 4 含对照组守） |
| 协作技无客户端前摇 | ⑦§7 / ④ 时序 | 全部 `castTicks=0`（即时权威落地）；可读性依赖即时视觉反馈（§7） | ✅ 与 P3 解耦（不引入新 telegraph，不触发 D3 不等式） |
| 减伤唯一出口（纪律 B） | ⑦ 纪律 B / C11 | `combat.resolveDamage` L137-145 单一出口消费 `shieldReduction`；未设置护盾时分支不触发（golden 无回归） | ✅ 一致 |
| 协作技只影响盟友（非 solo） | concept P1 / ⑨ | `resolveSkillApplication`：ALLY 拒 self/enemy；REVIVE 须 DOWNED；SELF 只作用于施法者 | ✅ 语义一致（测试 6/8 守） |
| 敌我伤害分离（C11/D12） | ⑦§4 / ⑧ | TAUNT 仅改敌人**目标选择**，不改 `enemyDamage`；与 `resolveDamage` 服务端裁决兼容 | ✅ 一致 |
| 托管中不可施技（P4 友好） | ①§8 / ⑪§6 | `resolveSkillApplication`：`if (caster.disconnected) return null` | ✅ 一致 |
| 纪律 B 运行时隔离 | 源码 | `skills.ts` 全纯函数；无 hp=/status= 直改；无 combat/world/enemy-ai/dungeon-gen 运行时 import | ✅ 一致（grep + 测试 7 守） |
| diff 格式守约（D9） | 纪律 B（consumer 不改 diff 格式） | `world.snapshot()` 未序列化协作技字段 → `EntityState` 结构不变；golden 哈希字节相等 | ✅ 无回归 |

---

## 3. 纪律 A / B 检查

**纪律 A（⑨ 不依赖地牢/敌人运行时生成；consumer 只读语义）**
- `world.ts`：E8 未改 `createWorld` 生成路径，未引入地牢/敌人运行时依赖；协作技字段仅加在 `Actor`（运行时态），与生成逻辑无关。✅
- `skills.ts`：仅 `import { SKILL_IDS, SkillTargetMode, EntityKind, EntityStatus, getSkillPrototype, type SkillPrototype } from "./types.ts"` —— 全部为数据 const / 类型 / 纯查表函数（`getSkillPrototype`）；**无运行时生成逻辑 import**。✅
- A 无回归。✅

**纪律 B（skills.ts 仅 import type + 数据基座，绝不直改 hp/status；只经 resolveDamage / world.step 出口；consumer/world 不改 diff 格式）**
- `skills.ts` `resolveSkillApplication` 纯校验 + 效果数学，产出不可变 `SkillApplication` 意图结构体；源码 grep + 测试 7 确认无 `.hp=` / `.status=` 直改、无 combat/world/enemy-ai/dungeon-gen 运行时 import。✅
- **hp/status 唯一落地点**：① `combat.resolveDamage`（SHIELD 减伤单一出口，L137-145），② `world.step`（REVIVE rescueTicks += / TAUNT tauntUntilTick 设 / 冷却门控 / 窗口清理）。skills.ts 全程不触实体。✅
- **enemy-ai.ts 仅只读扩展**：新增 `taunt?: boolean`（由 world.step 投影）+ taunt 池优先锁定逻辑；无新 hp/status 变更、未运行时 import 新模块。✅
- **C11 出口单点**：减伤仍在 `combat.resolveDamage`（唯一伤害权威）；协作技不另开伤害路径；嘲讽不改伤害数值。✅
- **diff 格式守约**：`world.snapshot()` 未序列化协作技字段，`EntityState` schema 无破坏，golden 哈希字节相等佐证。✅

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| `GOLDEN_WORLD_HASH` 不变（world-determinism.test.ts） | per e8-note：8/8 绿；golden 场景不发出 `SKILL` 输入；协作技 `Actor` 字段（`cooldownUntilTick` 等）未进入 `snapshot()` 序列化 → 玩家快照字节结构不变 | ✅ E8 接入后 golden 零回归 |
| `GOLDEN_PLAYTEST_HASH` 不变（playtest-core-loop.mjs） | per e8-note：7/7 exit 0；220-tick 仅 ATTACK/DODGE/MOVE，技能意图路径不进入核心闭环 | ✅ 不受影响 |
| golden 场景不触发协作技路径 | golden/playtest 序列均无 `action=SKILL` 输入 → `world.step` SKILL 分支零执行；协作技字段对未施技玩家恒为初始 0/null → 序列化无扰动 | ✅ D9 契约零回归（数学可证） |
| 协作技字段未序列化 | `snapshot()` 仅映射 `id/kind/pos/dir/hp/maxHp/status/statusEffects/ownerId/rescue`；`shieldUntilTick`/`tauntUntilTick`/`activeSkill`/`cooldownUntilTick` 不在内 → JSON 结构不变 | ✅ 无哈希扰动（C7 端口须复刻「条件性附加」以免漂移，见 O-?1） |
| E8 路径无隐藏随机源 | grep：`skills.ts` 无 Math.random/Date/Rng；`world.ts` E8 分支仅算术（tick 计数 + 位运算 + 查表）；`Rng` 仅 `createWorld` 敌人生成抖动（E1/E3 既有） | ✅ |
| 确定性跨端对齐 | sim-core 纯逻辑；golden 双锚点锁定，便于 GDScript 端口复刻（C7） | ✅ |

> E8 接入协作技后，golden 双锚点均逐字节不变；D9 契约零回归，且可数学证明（golden 不发 SKILL 输入 + 协作技字段不进序列化）。

---

## 5. 可访问性

**E8 服务端状态 vs ux-spec §7 / art-bible**
- E8 全部逻辑在权威 world / combat 内结算（护盾窗口 / 救援加成 / 嘲讽窗口），不触及客户端还原路径（那归 ⑬ E12）；`snapshot()` 未序列化协作技字段 → ux-spec §7 流程不受 E8 破坏。✅
- **缺口（继承 O-E7）**：客户端重连插值 + 护盾/嘲讽视觉同步尚未做（headless 不触发，非阻塞）。
- **DANGER 豁免**：E8 无 telegraph/视觉序列化，完全不触碰 art-bible §3「全局 8% 强提醒色预算」；护盾/嘲讽光效（阵营色）归 ⑬ E12 + art-bible §3，E8 无交集。✅
- **§8 可访问性维度（色盲三重 / 按键重映射 / 减弱动效保留静态预警）**：协作技无前摇（`castTicks=0`），可读性依赖即时静态视觉反馈（护盾环 / 救援读条跳增 / 嘲讽光环 + 文字/图标），不靠细微动效 —— 与 P3「读得懂的紧张感」同向（④§7 / ⑦§7 保底）。✅
- **事件文本化（accessibility #13）**：协作技生效须有文字/图标提示（不靠音/光），由 ⑬ E12 承接；E8 仅提供状态（shieldUntilTick/tauntUntilTick/activeSkill），不产文字 UI。⚠ 归 E12，非阻塞。
- **ux-spec 占位回填**：`design/ux/ux-spec.md` §2/§3/§4/§6 多处「待 ⑨ GDD 补完回填」现可据 `09-skill.md` 回填（技能栏/触发键位/连携信号）—— 属配套 docs-only，建议 E13 类回填时一并处理（见 §7）。

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E8 把「⑨ 协作技」一次闭环：3 个差异化协同技（SHIELD_ALLY 减伤 / REVIVE_BOOST 加速救援 / TAUNT 吸火）经 `resolveSkillApplication` 纯校验 → `world.step` 权威落地 → 减伤由 `combat.resolveDamage` 单一出口消费、嘲讽经 `enemy-ai.ts` 只读标志改变目标选择（敌我伤害分离 intact）。`skills.ts` 为纯模块（纪律 B，源码 grep + 测试 8/8 守住），`enemy-ai.ts` 仅只读扩展（纪律 B 无回归），`GOLDEN_WORLD_HASH`/`GOLDEN_PLAYTEST_HASH` 双锚点逐字节不变（D9 零回归，可数学证明）。**🔓 O-A RESOLVED**（协作技从未分化/非权威 → 真正协同技 + 权威落地 + ⑨ GDD 补完）。可放行进入 E9（⑥）/ E10（⑩ 闭合 O-F7 呼救广播 / 协作技信号联动）/ E11（⑫）/ E12（⑬ 闭合 O-?1 客户端状态同步 + 事件文本化）/ E13（C9/C1 回填 + D1–D3 设计裁定）。**建议「好玩吗」验证门前补 O-?1（客户端状态同步）/ O-?2（per-class 协作技愿景）/ O-?3（平衡初稿钉值）与继承项 O-C6/O-B6/O-E7。**

### 6.2 待闭合项 reconcile（O-A / O-C6 / O-B6 / O-E7）

- **O-A（协作技从未分化/非权威 → 仍 OPEN）** → **🔓 RESOLVED（关闭）**：E8 实现 3 差异化协同技（护盾/急救/嘲讽）+ 服务器权威落地 + `09-skill.md` GDD 补完；`coop-skill.test.ts` 8 例覆盖三技 + 纪律 B 静态契约。关闭。
- **O-C6（范围/权威位置命中重校未做）** → **仍 OPEN（继承 E5/E6，非 E8 回归）**：E8 未补 combat 命中距离重校；范围重校仍待「好玩吗」门前。⚠ 仍 OPEN。
- **O-B6（碰撞未做）** → **仍 OPEN（继承 E5/E6，非阻塞）**：E8 救援加成用几何判定（无视地形/实体碰撞层），玩家可隔墙受益；碰撞层约束（S5.2/S6.2）仍归独立碰撞 epic。⚠ 仍 OPEN。
- **O-E7（客户端重连插值未纳入 headless 切片）** → **仍 OPEN（继承 E7，归 Godot 切片）**：E8 协作技字段未序列化、无客户端还原需求；客户端 100ms 插值还原（含协作技态）归 E1 S1.6 + ⑬。⚠ 仍 OPEN，不受 E8 影响。

### 6.3 非阻塞观察（CONCERNS 类，不 gate E8，供下游 epic 跟踪）

- **C1 · 集成缺口：协作技未进 220-tick 核心闭环 golden/playtest（E8 验收非阻塞）**：`coop-skill.test.ts` 8 例已覆盖三技纯逻辑与纪律 B，但 220-tick `playtest-core-loop.mjs`（仅 ATTACK/DODGE/MOVE）与 `world-determinism.test.ts` 均**不发出 `SKILL` 输入** → 协作技端到端（含多玩家施放时序、敌人 taunt 重锁定、救援加速归队）未在中真实闭环跑过。建议 QA 计划补「2–4 人协作技时序 + 嘲讽吸火 + 倒地急救链」集成用例，并在「好玩吗」门前跑端到端。非阻塞（headless 单元已守核心不变量，golden 不触发故无回归）。
- **C2 · 平衡值全为 P5 第一稿（待「好玩吗」门前钉值）**：`shieldReduction=0.5` / 冷却 360/300/420 / 窗口 90/45/120 均为 E8 初稿（e8-note §6 自承）。建议接入真实 4 职业后按职业/难度调参，并与 ⑦ O-I / ⑪ O-H7 / ⑧ O-H6 平衡初稿一并进验证门。非阻塞。
- **C3 · D1–D3（地牢生成）仍待设计裁定（继承 E13，非 E8 回归）**：`e13-gdd-backfill.md` §4 报告 ⑤ §4 与 `dungeon-gen.ts` 偏差（楼层数 5–7 vs 3–5、资源点口径、刷怪密度），属设计目标 vs 初稿实现张力，非 E8 范围。建议 team-lead 协调 design-strategist 裁定（勿静默改）。非阻塞。
- **C4 · O-?2 · per-class 协作技愿景未实现（systems-index ⑨ vs E8 MVP 偏差）**：systems-index ⑨ 定位「每职业 1 协作技（坦护盾墙 / 医者救援链 / 控场合围）」，E8 实现为 3 个通用协作技（非按职业分）。E8 MVP 已闭合 O-A（协作技存在 + 三态差异化 + 权威落地），但**未实现职业差异化**——这削弱了 P1「每职业协同定位」的深度。属设计决策，建议「好玩吗」门前 / 后续 epic 裁定：通用 3 技是否即最终形态，还是需替换为/扩展为每职业专属技。非阻塞（MVP 可玩）。
- **C5 · O-?1 · 客户端状态同步缺口（C7/Godot 切片）**：`shieldUntilTick`/`shieldReduction`/`tauntUntilTick`/`activeSkill`/`cooldownUntilTick` 当前未序列化进 `EntityState`（保 golden 稳定）；Godot 客户端护盾/嘲讽视觉与 HUD 冷却环须先在 `EntityState` 补可选字段，且须复刻「条件性附加」以免 `GOLDEN_WORLD_HASH` 漂移（对齐 ⑪ O-H7 先例）。建议排 E12 ⑬ 客户端切片时处理。非阻塞。
- **C6 · O-?3 · 急救链叠加语义确认（设计意图澄清）**：`REVIVE_BOOST` 直接 `rescueTicks += 45`，对 `rescueTicks=0` 的倒地盟友施放 → 仅需再累积 45 tick 即达 90（救援时间约减半），可每 10s CD 重复施放进一步加速。这与 ⑪§4「救援读条 3s」基准一致（加速而非改写），但建议 ⑨ GDD 明示「叠加加速、非重置/翻倍」语义，避免玩家误判。非阻塞（功能正确，已写入 09-skill.md §4）。

### 6.4 阻塞项：**无**

---

## 7. Handoff
- 本稿 + `design/gdd/09-skill.md` 随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-e8.md`。
- E8 验收建议**放行（PASS）**；O-A 已 RESOLVED（关闭）；O-C6 / O-B6 / O-E7 仍 OPEN（继承，非 E8 回归）；C1–C6 记入下游 epic 待办，不阻断 Sprint 推进；**C1（集成缺口）/ C2（平衡初稿）/ C4（per-class 愿景）/ C5（客户端同步）建议作为「好玩吗」验证门前补**。
- 下一步（按 sprint-1 顺序）：E1✅ E2✅ E3✅ E4✅ E5✅ E6✅ E7✅ → **E8✅（⑨ 闭合 O-A + ⑨ GDD 补完）** → E9（⑥ 资源） + E10（⑩ 闭合 O-F7 呼救广播 / 协作技信号联动 C6）+ E11（⑫ 团灭结算） + E12（⑬ 闭合 O-?1 客户端状态同步 + 事件文本化 C5）+ E13（C9/C1 回填 + D1–D3 设计裁定 C3）。
- 跨队友提示：
  - **O-C6 / O-B6**：继续归「好玩吗」门前 + 独立碰撞 epic；E8 未改动相关路径，无新风险。
  - **O-E7**：维持 OPEN（预期内 defer，归 Godot 客户端切片）；E8 协作技字段未序列化，无客户端还原需求。
  - **C1（集成缺口）**：建议 quality-lead 在 QA 计划补「2–4 人协作技时序 + 嘲讽吸火 + 倒地急救链」集成用例；C4/C5（per-class 愿景 / 客户端同步）建议主理人排「好玩吗」门前与 E12 ⑬ 切片。
  - **C3（D1–D3）**：请 team-lead 协调 design-strategist 裁定地牢生成设计目标 vs 代码初稿（继承 E13，非 E8 阻塞）。
  - **ux-spec 回填**：`design/ux/ux-spec.md`「待 ⑨ GDD 补完回填」占位段现可据 `09-skill.md` 回填（技能栏/触发键位/连携信号），属配套 docs-only，建议 E13 类回填时一并处理。
  - art-bible §3 DANGER 豁免与 E8 无交集（E8 无视觉序列化），无需改动 art-director 文档；可访问性维度（§5/§8）无改动（事件文本化归 E12）。

（文策渊 · design-strategist · E8 设计评审 + ⑨ GDD 反向同步，主理人汇编落盘）

---

## 8. 实跑复验记录（与 team-lead 通报交叉确认）
- `coop-skill.test.ts`：**8/8 绿 #fail 0**（本人独立运行，含 SHIELD 减伤端到端 / REVIVE 健康盟友 no-op / TAUNT 含对照组 / 冷却强制 / 协作技只指向其他玩家 / 纪律 B 静态契约 / 纯函数校验）。
- sim-core 全量：**51 pass / 0 fail**（基线 43 + 新增 8）；dungeon-server **28/28**；playtest **7/7 exit 0**（与 e8-implementation-note 一致）。
- golden 双锚点：`GOLDEN_WORLD_HASH` / `GOLDEN_PLAYTEST_HASH` **均不变**（静态路径核验：golden 不发 SKILL 输入 + 协作技字段不进 `snapshot()` 序列化）；D9 契约零回归。
- 源码纪律 B 静态核验：`sim-core/src` 下 `.hp=`/`.status=` 赋值仅 `combat.ts` + `world.ts`；`skills.ts`/`types.ts`/`enemy-ai.ts` 均无（与 e8-note §3 一致）。
