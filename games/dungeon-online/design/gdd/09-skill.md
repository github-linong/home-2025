# GDD ⑨ 协作技系统（Co-op Skills）
**路径**：`games/dungeon-online/design/gdd/09-skill.md` ｜ 标记：`[MVP][P1]`
**依赖（systems-index §2）**：依赖 ⑦战斗(协同增益结算入口) + ②角色与职业(状态/职业数据) + ①联机与房间(权威状态容器 + diff 下发)；被依赖 ⑬。
**循环依赖纪律 B（systems-index §2.3）**：协作技是「协同增益结算」的消费者，效果经 ⑦ 结算；本系统运行时模块 `skills.ts` 纯校验 + 效果数学，**绝不**直改 hp/status，所有状态改变只经 `combat.resolveDamage` / `world.step` 两个单一出口（与 ⑦ 纪律 B 同源）。

> 本稿为 **E8 反向同步（reverse-sync）落盘**：代码为权威真相源（`packages/sim-core/src/types.ts` 的 `SKILL_PROTOTYPES` / `skills.ts` / `combat.ts` / `world.ts` / `enemy-ai.ts`）。E8 前 **⑨ 无 GDD**（systems-index ⑨ 仅有定位描述），本稿关闭 ⑨ 的 GDD 覆盖缺口（O-A 的文档侧一半）。所有数值为 **P5 平衡初稿（待调）**，集中锁在 `SKILL_PROTOTYPES`，未散落。

## 1. 目的与支柱对齐
服务 **P1「协同至上」**：协作技是「影响盟友」的协同能力（区别于 solo 普攻/闪避），把胜利路径绑定到队友配合上——护盾保护、加速救援、嘲讽吸火，使「无配合难通关 MVP 小队内容」成为可玩现实（gate-review-phase2 W1/W3：⑨ 是 P1 验证门槛最高的系统）。向上支撑 ⑬ HUD（技能槽/CD/护盾·嘲讽光效）、⑪ 救援（急救链直接加速救援读条）。不引入经济/掉落（资源系统 ⑥ 负责）。

## 2. 依赖与上游接口
- **依赖**：⑦ 战斗（协同增益/减伤/救援加成结算入口；减伤经 `resolveDamage` 单一出口）、② 角色与职业（EntityStatus / EntityKind / 阵营色）、① 联机与房间（权威世界状态容器 + diff 下发）、⑪ 救援（急救链改 `rescueTicks` 加速归队）。
- **提供接口（被依赖方）**：
  - → ⑦ 战斗：减伤护盾窗口经 `combat.resolveDamage` 消费；其余效果（救援读条/嘲讽）经 `world.step` 落地。
  - → ⑬ HUD：`activeSkill` / `cooldownUntilTick` / `shieldUntilTick` / `tauntUntilTick` 状态（**当前未序列化进 `EntityState`，客户端接入前须补可选字段**，见 §8 O-?）。
  - → ⑧ 敌人/AI：嘲讽窗口经 `enemy-ai.ts` 只读 `taunt` 标志改变目标选择（吸引敌火）。
- **上游接口需求（→程基岩）**：逐 tick 技能路由时序、冷却闸门位置、与 ④ 预测回正对齐（协作技无客户端前摇，即时权威落地）。

## 3. 核心机制
- **协作技定位**：影响「盟友」的协同能力（非 solo）。三技能各司其职：护盾链接（减伤保护）、急救链（加速救援）、嘲讽战吼（吸火保护队友）。
- **目标模式（`SkillTargetMode`，`types.ts`）**：
  - `ALLY`(1)：必须指向**其他** PLAYER 盟友（不能指向自己 / 敌人 / 资源 / 弹幕）；`REVIVE_BOOST` 额外要求目标处于 `DOWNED`（只救倒地盟友）；`SHIELD_ALLY` 可施于任意（含倒地）玩家盟友（护盾保护）。
  - `SELF`(0)：仅作用于施法者自身（`TAUNT`：吸引敌火保护队友，本质是「影响盟友」的协同技）。
  - `ENEMY`(2)：**预留**（未来进攻型协作技；本 Epic 未启用，任何指向敌人的协作技在 `resolveSkillApplication` 被拒）。
- **意图流水线（纪律 B 核心）**：
  1. `InputCmd(action=SKILL, target=盟友实体 id, param=技能 id)` 经 ① 路由到 `world.step`（enemy-ai / 玩家同口径）。
  2. `skills.ts` `resolveSkillApplication(caster, target, skillId, tick)` **纯校验 + 效果数学**：按目标模式校验 + 产出不可变 `SkillApplication` 意图结构体（含 `shieldTicks/shieldReduction/rescueBoostTicks/tauntTicks/cooldownTicks`）；托管中 / 未知 id / 非法目标 → 返回 `null`（不进入冷却、不落地）。
  3. `world.step` 消费意图落地：① `SHIELD_ALLY` → 设 `target.shieldUntilTick` / `target.shieldReduction`；② `REVIVE_BOOST` → `target.rescueTicks += 45`；③ `TAUNT` → 设 `caster.tauntUntilTick`；统一写 `caster.cooldownUntilTick` / `caster.activeSkill`。
  4. 冷却/窗口过期由 `world.step` 每 tick 清理（`shieldUntilTick`/`tauntUntilTick`/`cooldownUntilTick` 复位），保证确定性。
- **伤害减伤（唯一出口）**：`SHIELD_ALLY` 的减伤在 `combat.resolveDamage` 内落地——目标处于护盾窗口且 `shieldReduction>0` 时，`dmg = round(dmgBase * (1 - shieldReduction))`；未设置/已过期 → `dmgBase` 原样结算（golden 场景此分支恒不触发）。与 `DODGE` 的 IFRAME 全免伤正交：同时持有护盾与 i-frame 时 i-frame 优先（全额免伤）。
- **嘲讽（只读标志改变 AI 目标选择）**：`world.step` 向 `enemy-ai.ts` 投影 `taunt` 只读标志（施法者 `tauntUntilTick>0`）；`enemy-ai.ts` 若有任意嘲讽中玩家，则目标池仅含嘲讽者（取最近），否则退回默认「最近存活玩家」。嘲讽**不改变敌人伤害数值**，与敌我伤害分离（C11/D12）兼容。
- **施法前摇**：全部 `castTicks=0`（即时、服务器权威落地，无客户端前摇）。可读性依赖即时视觉反馈（见 §7）。
- **托管约束**：施法者 `disconnected`（托管中）→ `resolveSkillApplication` 直接拒（托管期间不可施技）。

## 4. 数值/平衡初稿（`待调` · 锁在 `SKILL_PROTOTYPES`，集中可调）
- **`TICK_RATE`：引用 `ADR-NET-01`（锁 30Hz），本系统不再单独定义。**
- 三协作技全量常量（代码真值，`types.ts` `SKILL_PROTOTYPES`，E8 实现）：

| 技能 | id | 目标模式 | 施法前摇 `castTicks` | 冷却 `cooldownTicks` | 冷却(秒) | 效果参数（E8 初稿） | 落地方式 |
|---|---|---|---|---|---|---|---|
| `SHIELD_ALLY` 护盾链接 | 0 | `ALLY`（其他 PLAYER，含倒地） | 0（即时） | 360 | 12s | `shieldTicks=90`(3.0s)、`shieldReduction=0.5`（减伤 50%） | `world.step` 设 `target.shieldUntilTick`/`shieldReduction` → `combat.resolveDamage` 消费 |
| `REVIVE_BOOST` 急救链 | 1 | `ALLY`（须 `DOWNED`） | 0 | 300 | 10s | `rescueBoostTicks=45`(1.5s) | `world.step` 给 `target.rescueTicks += 45`（非 hp/status） |
| `TAUNT` 嘲讽战吼 | 2 | `SELF`（施法者自身） | 0 | 420 | 14s | `tauntTicks=120`(4.0s) | `world.step` 设 `caster.tauntUntilTick` → 敌人 AI 经 taunt 池优先锁定 |

- **减伤公式（代数学）**：护盾窗口内，`finalDamage = max(0, round(baseDamage * (1 - 0.5)))`。`baseDamage` = 玩家 `PLAYER_ATTACK_DAMAGE=18` 或敌人 `enemyDamage`（C11/D12 服务端裁决）。例：被普攻命中 → `round(18*0.5)=9`（减半）。
- **急救链叠加语义**：`rescueTicks += 45` 直接加进救援读条（总 `RESCUE_TICKS=90`=3.0s，见 ⑪§4）。对 `rescueTicks=0` 的倒地盟友施放 → 仅需再累积 45 tick 即达 90（救援时间约减半）；可重复施放（每 10s CD）进一步加速，但受 `RESCUE_RADIUS`(48px)/邻近判定约束（⑪§4）。
- **`SkillTargetMode.ENEMY=2` / `getSkillPrototype` 预留位**：未来进攻型协作技扩展用；本 Epic 未启用。
- 以上数值全为 **P5 平衡初稿（O-H9/O-I9，待「好玩吗」门前钉值）**；接入真实 4 职业后建议按职业差异化（见 §8 / e8-implementation-note §6）。

## 5. 状态机/流程
- **实体状态位（复用 `types.EntityStatus`，代码权威）**：协作技不改 `DOWNED`/`OUT`/`IFRAME` 等位；其运行时态落在 `Actor` 扩展字段：`cooldownUntilTick` / `activeSkill` / `shieldUntilTick` / `shieldReduction` / `tauntUntilTick`（仅 `world.step` 维护）。
- 施法者：`ALIVE&!DOWNED&!OUT&!disconnected` → 收 `SKILL` 输入 + 冷却就绪 → `resolveSkillApplication` 校验 → `world.step` 落地效果 + 进入冷却 → 窗口/冷却过期复位。
- 目标（ALLY）：`SHIELD_ALLY` → 进入护盾窗口（减伤生效至 `shieldUntilTick`）；`REVIVE_BOOST` → `rescueTicks` 跳增（加速 ⑪ 救援归队，自身仍 `DOWNED` 直至读条满）。
- 敌人 AI：`TAUNT` 期间目标池收窄为嘲讽者（移动 + 攻击均优先），保护非嘲讽队友。
- **协作技结算 tick 流程（与 ⑦ 同构）**：收集本 tick SKILL 输入 → `resolveSkillApplication` 纯校验+效果数学 → `world.step` 落地（设窗口/加成/嘲讽 + 冷却）→ `combat.resolveDamage`/`world.step` 唯一出口写权威状态 → ① 经 diff 下发。

## 6. 联机/权威服务器影响
- 全部协作技效果在服务器逐 tick 裁定（`world.step` 落地 + `combat.resolveDamage` 减伤），客户端仅预测表现；结果作为权威 diff 经 ① 下发，④ 据其回正。
- **与 ④ 回正对齐边界**：协作技无客户端前摇（`castTicks=0`），施放即时权威落地；客户端技能触发输入与 HUD 冷却环由 ⑬ 消费本地预测 + 服务器 `activeSkill`/`cooldownUntilTick` 校准。
- **确定性（D9 契约）**：协作技运行时字段加在 `Actor` 上，但 `world.snapshot()` **未序列化** `cooldownUntilTick`/`activeSkill`/`shieldUntilTick`/`shieldReduction`/`tauntUntilTick` → 玩家快照字节结构与 E8 前一致，`GOLDEN_WORLD_HASH` 不受影响（golden 场景不发出 SKILL 输入，且新增字段不进序列化）。Godot 客户端如需同步护盾/嘲讽视觉，须在 `EntityState` 补可选字段（见 §8 O-?）。
- 断线：托管中玩家 `disconnected` → `resolveSkillApplication` 拒其施技；其已持有的护盾/嘲讽窗口由 `world.step` 过期清理（确定性 intact）。

## 7. 可读性/UX 约束（P3 硬约束）
- 协作技**无 telegraph 前摇**（`castTicks=0`）→ 可读性依赖**即时视觉反馈**（不靠细微动效）：护盾链接 = 目标盟友静态护盾环（自身阵营色，art-bible §3）+ 减伤提示；急救链 = 救援读条立即跳增（环形进度 + 图标，对齐 ⑪§7/art-bible §8）；嘲讽战吼 = 施法者静态嘲讽光环（阵营色）+ 敌人目标线改写提示。
- **阵营色纪律**：技能光效用各自阵营色；GOLD/EMBER/DANGER 为提醒色，总面积 <8%（避免霓虹过载，对齐 ⑦§7）。
- 色盲三重编码：护盾/嘲讽/救援加成须形状 + 文字/图标（不靠色 alone，art-bible §10）。
- **与 ⑧ telegraph 的时序解耦**：协作技不引入新 telegraph，故不触发 D3 不等式（≥0.6s 前摇）约束；但其即时生效意味着「施放即生效」，客户端须保证施放反馈 ≤ 网络往返可读（由 ④ 插值/回正兜底弱网可读，对齐 ④§7）。
- **可访问性**：协作技生效须有文字/图标提示（不靠音/光 alone，accessibility #13）；按键重映射支持（多人分键，art-bible §10）。

## 8. 开放问题与工程接口
- **设计层需求（→程基岩 `ADR-NET-01`）**：
  1. 逐 tick 技能路由时序（`world.step` SKILL 分支与战斗/敌人 AI 同帧顺序，已锁）。
  2. 冷却闸门位置（`world.step` `if (cooldownUntilTick <= tick)` 已锁；无客户端预校验，P5 评估是否补客户端 CD 预估）。
  3. 与 ④ 预测回正对齐（协作技即时落地，客户端 HUD 冷却环同步策略）。
- **纪律 B 落地**：`skills.ts` 仅 `import type` + 数据基座 `types.ts`（`SKILL_PROTOTYPES`/枚举/常量），**不**运行时 import `combat`/`world`/`enemy-ai`/`dungeon-gen`；hp/status 唯一落地点为 `combat.resolveDamage` + `world.step`。静态扫描确认（e8-implementation-note §3）：`sim-core/src` 下 `.hp=`/`.status=` 赋值仅出现在 `combat.ts` 与 `world.ts`。
- **开放问题（O-H9 / O-I9 · P5 平衡初稿，待「好玩吗」门前）**：
  - **O-?1 · 客户端状态同步缺口**：`shieldUntilTick`/`shieldReduction`/`tauntUntilTick`/`activeSkill`/`cooldownUntilTick` 当前**未序列化进 `EntityState`**（保 golden 稳定）；Godot 客户端接入护盾/嘲讽视觉与 HUD 冷却环前，须在 `EntityState` 补可选字段（C7 端口须复刻「条件性附加」以免 `GOLDEN_WORLD_HASH` 漂移，对齐 ⑪ O-H7 先例）。建议排 E12 ⑬ 客户端切片时一并处理。
  - **O-?2 · 职业差异化未做（systems-index ⑨ 愿景 vs E8 MVP 偏差）**：systems-index ⑨ 定位「每职业 1 协作技（坦护盾墙 / 医者救援链 / 控场合围）」，但 E8 实现为 **3 个通用协作技（非按职业分）**。E8 MVP 已闭合「协作技存在 + 差异化（护盾/急救/嘲讽三态）+ 服务器权威落地」的设计缺口（O-A），但**未实现每职业专属协作技**。属 P1 协同玩法深度决策，建议排「好玩吗」门前或后续 epic 裁定：通用 3 技是否即最终形态，还是需替换为/扩展为每职业专属技。
  - **O-?3 · 数值全初稿**：`shieldReduction=0.5` / 各冷却(360/300/420) / 窗口(90/45/120) 均为 E8 第一稿，待接入真实 4 职业后按职业/难度调参（e8-implementation-note §6）。
- **ux-spec 占位回填**：`design/ux/ux-spec.md` §2/§3/§4/§6 多处「待 ⑨ GDD 补完回填」的协作技 UX 入口（技能栏/触发键位/连携信号）现可据本稿回填；属配套 docs-only 改动，建议主理人协调 design-strategist 在 E13 类回填时一并处理（非 E8 阻塞项）。

（文策渊 · design-strategist · ⑨ GDD 反向同步落盘，E8 评审配套）
