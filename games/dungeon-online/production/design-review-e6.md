# E6 设计评审 + 范围核查（P5-S1-DES-6）

- **路径（建议）**：`games/dungeon-online/production/design-review-e6.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）
- **汇编落盘**：主理人（游承峰）
- **评审对象**：
  - `packages/sim-core/src/enemy-ai.ts`（重写占位：stepEnemyAi 只产意图）
  - `packages/sim-core/src/types.ts`（EDIT：EnemyPrototype 平衡初稿 attackDamage/speed/attackRange/telegraphTicks）
  - `packages/sim-core/src/combat.ts`（EDIT：resolveDamage 裁决 enemyDamage）
  - `packages/sim-core/src/world.ts`（① 编排：敌人意图→位移/前摇/结算）
  - `packages/sim-core/tests/unit/combat.test.ts`（第6例纪律 B 静态契约）
  - `packages/sim-core/tests/golden/world-determinism.test.ts`（GOLDEN_WORLD_HASH 重锁）
- **基线**：`design/ux/ux-spec.md` §0/§3、`art/art-bible.md` §0/§3（DANGER 豁免）、`packages/sim-core/src/types.ts`、`production/epics.md`(E6)、`production/design-review-e5.md`（O-E/O-D/O-M 待闭合项）

---

## 0. 判定摘要

- **判定：PASS**（含 11 条非阻塞观察 / CONCERNS 类，无一项 gate E6 验收；其中 O-C6「范围重校」建议进「好玩吗」验证门前补）
- **阻塞项：无**
- **E6 范围**：⑧ 敌人 AI 意图生成（stepEnemyAi 只产 MOVE/ATTACK 意图，绝不直改实体）✅ / D12 telegraph 前摇分层（杂兵21/精英24/Boss30 ≥18，world 建 telegraph）✅ / 经 resolveDamage 产出伤害（enemyDamage 服务端裁决，纪律 B）✅
- **未覆盖（正确 defer）**：⑪ 救援/OUT（仅触发 DOWNED 位，接管交 E7）✅ / R1 二进制（仍 JSON→Buffer 占位）✅ / 客户端插值（headless）✅ / telegraph 视觉/声音（defer E12/E13）✅ / 寻路(碰撞)/编队（S6.2 部分 defer）✅
- **契约一致性**：E6 常量 vs ux-spec §0/§3、art-bible §3、types.ts、ADR D12、C11 全绿（敌人前摇分层 21/24/30 ≥18 不破下限、DANGER 豁免不触碰 8%、敌我伤害分离 enemyDamage vs PLAYER_ATTACK_DAMAGE）
- **纪律 A/B**：A 无回归（world 仍只读 spawnPoints；enemy-ai 只读 ENEMY_PROTOTYPES 数据基座）；B（⑧ 仅 import type + 数据基座，绝不 import combat/dungeon-gen 运行时，只经 resolveDamage 出口；consumer/world 不改 diff 格式）由 combat.test.ts 第6例静态契约守住 —— enemy-ai.ts 与 world.ts 调用方式合规
- **RNG(D9)**：GOLDEN_WORLD_HASH 重锁（`67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`）后跨运行字节相等；无新增隐藏随机源；敌人寻最近玩家确定性（数组序稳定）
- **可访问性**：E6 敌人 AI/telegraph 为纯服务端状态，不影响 ux-spec §7 断线/RESIDENT；DANGER 豁免无冲突（telegraph 无视觉/配色）
- **设计红线**：无主导策略 / 经济失衡 / 认知过载 / 支柱漂移；P3「读得懂的紧张感」经 D12 前摇分层在服务器端落地 ✅

---

## 1. 范围检查

### 1.1 E6 范围核查（⑧ / D12 / 纪律 B）

| 控制项 | 意图（epics E6） | E6 落点 | 结论 |
|---|---|---|---|
| **⑧ AI 意图生成** | S6.2 攻击选择/编队/寻路 | `enemy-ai.ts` `stepEnemyAi(self,ctx):EnemyIntent`，只产 MOVE（单位方向）/ATTACK（targetId+damage），绝不直改实体 | ✅ 意图生成全覆盖（寻路/编队见 O-A6/O-B6） |
| **D12 telegraph 前摇分层** | S6.5 前摇≥0.6s（18tick），杂兵21/精英24/Boss30 | `world.ts` ATTACK 分支 `a.telegraph={startTick, applyTick:tick+proto.telegraphTicks, targetId, kind:ATTACK}`；telegraphTicks 21/24/30 ≥ `MIN_TELEGRAPH_TICKS=18` | ✅ 分层全覆盖，下限不破 |
| **伤害经 resolveDamage** | S6.4 提交 DamageRequest，application_tick=T0+前摇 | `world` 前摇结算循环对敌人来源传 `enemyDamage=ENEMY_PROTOTYPES[id].attackDamage`，经 `combat.resolveDamage` 落地；C11 服务端裁决 | ✅ 全覆盖，纪律 B |
| **敌我伤害分离** | C11 / types | 敌人 `enemyDamage`（8/12/20，proto 平衡初稿）≠ 玩家 `PLAYER_ATTACK_DAMAGE=18`；`resolveDamage` 裁决 `req.enemyDamage!=null?enemyDamage:18` | ✅ 分离清晰 |
| **刷怪（读 SpawnPoint）** | S6.1 只读 SpawnPoint[] | `world.ts` createWorld 已实例化（E3 产物），E6 不改生成路径，只读消费 | ✅ 纪律 A 无回归 |
| **MIN_TELEGRAPH_TICKS=18 常量** | S6.5 / C8 | `combat.ts` 常量 intact；敌人走 tier 分层值（≥18） | ✅ 一致 |

### 1.2 未覆盖项（正确 defer，非范围失败）

- **⑪ 救援/OUT**：world/E6 仅在 resolveDamage 触发 DOWNED 位；无救援读条/OUT/超时逻辑，接管交 E7（与 E5 一致）。✅ 预期内。
- **R1 二进制通道**：E6 未碰传输层，仍 JSON→Buffer 占位。✅ 预期内。
- **S4.2/S4.4 客户端预测/插值**：headless；telegraph 无客户端渲染。✅ 预期内。
- **telegraph 视觉/声音（S6.3 的 shape+color+sound）**：E6 生成 telegraph 时序状态（start/apply/targetId/kind），但 `AttackWindup` schema 无 shape/color/radius 字段，`world.snapshot` 不序列化 telegraph（O-D 视觉部分仍 defer E12/E13）；声音无关。✅ 预期内（视觉 defer）。
- **寻路（碰撞层读取）/编队（formation steering）**：S6.2 的"寻路/编队"未实现（敌人按单位方向直线逼近，穿墙；无分离转向）。继承 E5 O-B（碰撞）。⚠ 属 S6.2 子项但本次未落地（攻击选择已落地）。
- **仇恨/aggro 切换、技能/走位/kiting**：未实现；基础追击+攻击。⚠ 非 E6 MVP 必需。

### 1.3 超范围检查

- E6 全部为 ⑧ AI 意图 + D12 前摇分层 + 伤害提交，未实现 ⑪ 救援/OUT、R1 二进制、客户端插值、telegraph 视觉、⑨ 协作技、⑬ HUD。✅
- `enemy-ai.ts` 不 import combat/dungeon-gen 运行时；`world.ts`（① 编排层）引 `stepEnemyAi`/`combat` 运行时属 ADR D13 授权。✅
- **结论：E6 未越界，范围与 sprint-1.md / epics.md E6 一致**（含预期内 defer）。

---

## 2. GDD 契约一致性表（E6 实现 vs 上游基线）

| 契约点 | 基线出处 | E6 实现 | 结果 |
|---|---|---|---|
| 敌人前摇分层 21/24/30 ≥18 | ux-spec §0（杂兵21/精英24/Boss30）/ ADR D12（MIN=18）/ types `ENEMY_PROTOTYPES.telegraphTicks` | proto.telegraphTicks: grunt21/elite24/boss30，均≥18；world 用 `tick+proto.telegraphTicks` 建 telegraph | ✅ 不破下限 |
| telegraph 前摇 18tick=0.6s 下限 | ux-spec §0 / ADR D12 | `combat.MIN_TELEGRAPH_TICKS=18` 未改；敌人走 tier≥18 | ✅ 一致 |
| DANGER 豁免（telegraph 不计入 8% 配色预算） | art-bible §3 | E6 telegraph 为纯服务端状态，`world.snapshot` 不序列化 telegraph/color，不触碰 8% 预算 | ✅ 无冲突 |
| 敌我伤害分离 | C11 / types（enemyDamage vs PLAYER_ATTACK_DAMAGE） | world 结算传 `enemyDamage=ENEMY_PROTOTYPES[id].attackDamage`；`resolveDamage` 裁决 `req.enemyDamage!=null?enemyDamage:18` | ✅ 分离清晰 |
| C11 服务端裁决（拒伪造） | C11 / ADR D13 | 敌人伤害由 world 自 ENEMY_PROTOTYPES 服务端派生（不信任 intent.damage），经 resolveDamage 落地；客户端不可注入 | ✅ 一致（防御纵深） |
| CombatKind↔InputAction 值对齐 | types InputAction / CombatKind | world ATTACK 分支 `kind: CombatKind.ATTACK (=1)`，与 InputAction.ATTACK 一致 | ✅ 一致 |
| 敌人移动速率 speed/30 | 平衡初稿（E6 新增） | world `ms=ENEMY_PROTOTYPES[id].speed/30`（110/95/80 → 3.67/3.17/2.67 px/tick） | ✅ 锁定初稿（待 P5 调优） |
| 攻击范围 attackRange | 平衡初稿（E6 新增） | enemy-ai `dist<=proto.attackRange` 即 ATTACK（40/48/64） | ✅ 锁定初稿（待 P5 调优） |
| 纪律 B 运行时隔离 | C6 / combat.test.ts 第6例 | enemy-ai.ts 仅 `import {ENEMY_PROTOTYPES}` + `import type {Vec2}`；无 combat/dungeon-gen 运行时 import；无 `hp=`/`status=` 源码模式 | ✅ 一致 |
| 寻找最近玩家确定性 | 基线未约束但 D9 要求 | 遍历 ctx.players（alive 过滤），首个最小 dSq（严格 `<`，数组序稳定） | ✅ 确定（D9 友好） |
| seq 防重放 / lastProcessedSeq 对账 | ux-spec §0/§3（E4 已锁） | E6 未改 input.ts / snapshot 格式 | ✅ 无回归 |
| diff 格式守约 | 纪律 B（consumer 不改 diff 格式） | world.snapshot 形状未增删；telegraph 不序列化；EntityState.telegraph? 可选未填 | ✅ 无回归（消费者 ⑬ 无格式破坏） |

---

## 3. 纪律 A / B 检查

**纪律 A（⑤ 只产 SpawnPoint[] / ⑧ 只读；consumer 只读语义）**
- `world.ts`：E6 未改 createWorld 的生成路径，仍只读 `layout.spawnPoints` 实例化；敌人 E6 分支只消费 actor 坐标与 ENEMY_PROTOTYPES（数据基座）。✅
- `enemy-ai.ts`：只读 `ENEMY_PROTOTYPES`（types.ts 数据基座，非运行时），只读 self/ctx（world 投影的只读视图）；不反向写任何实体。✅
- `combat.ts`：未因 E6 增改运行时依赖。✅
- A 无回归。✅

**纪律 B（⑧ 仅 import type + 数据基座，绝不 import combat/dungeon-gen 运行时；只经 resolveDamage 出口；consumer/world 不改 diff 格式）**
- `enemy-ai.ts`：`import { ENEMY_PROTOTYPES } from "./types.ts"`（数据基座，非 combat/dungeon-gen 运行时）+ `import type { Vec2 }`（类型）；**无 combat/dungeon-gen 运行时 import**，无 `hp=`/`status=` 直改源码模式。✅
- **静态契约守门（combat.test.ts 第6例）**：读 enemy-ai.ts 源码正则断言 ① 无 combat/dungeon-gen 运行时 import、② 用 `import type`、③ 无 `hp=`/`status=` 源码模式 → 全部通过（sim-core `# fail 0` 含此例）。✅
- `world.ts`（① 编排层）调用方式合规：world 引 `stepEnemyAi`（运行时，ADR D13 授权）+ `resolveDamage`（combat 运行时，ADR D13 授权）；`stepEnemyAi` 仅返回 EnemyIntent（纯对象），world 翻译执行位移/建 telegraph/结算 —— **enemy-ai 全程不触实体**，调用边界合规。✅
- **C11 出口单点**：敌人伤害唯一出口是 world 经 `combat.resolveDamage` 提交（enemyDamage 由 world 自 proto 派生）；enemy-ai 不持有 resolveDamage 也不直改 hp。✅
- **diff 格式守约**：world.snapshot 未因 E6 增删必填字段；telegraph 为内部状态未序列化为 EntityState。消费者无格式破坏。✅

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| `GOLDEN_WORLD_HASH` 重锁 + 跨运行字节相等 | `world-determinism.test.ts` 重锁为 `67b358c78a374601bbc0be7d6cf5fdfd5f1ed4680f983ac36f570b2e1a0b89b8`；断言同 seed(EMBER-S1)+固定输入（含一次 ATTACK）→ 字节级稳定（跨运行 6 次相等） | ✅ E6 重锁有效（敌人移速改 speed/30 致哈希变，确定性 intact） |
| `GOLDEN_LAYOUT_HASH` 不受影响 | `determinism.test.ts` 仍 `bf4893...`（E3 布局未改）；world-determinism 注释明示 layout 不受影响 | ✅ 未破坏 E3 golden |
| enemy-ai.ts 无隐藏随机源 | 仅依赖 self/ctx/原型数据；无 Math.random/Date；寻最近玩家用确定性遍历（数组序稳定） | ✅ |
| world.ts E6 路径无隐藏随机源 | grep 确认 world.ts 无 Math.random/Date；E6 仅算术位移（speed/30）+ 建 telegraph（tick 算术） | ✅ |
| createWorld 种子派生未变 | `erng=hashString64(\`${seed}:${biomeId}:enemies\`)` 与 E1/E3 一致 | ✅ |
| 确定性跨端对齐 | sim-core 纯逻辑；golden 双锚点（layout/world）锁定，便于 GDScript 端口复刻（C7） | ✅ |

> E6 接入敌人 AI（speed/30 确定性位移）后 GOLDEN_WORLD_HASH 实测重锁并跨运行字节相等，D9 契约零回归。

---

## 5. 可访问性

**E6 敌人 AI/telegraph 纯服务端状态 vs ux-spec §7 断线 / RESIDENT**
- E6 全部逻辑在权威 world 内结算（意图→位移/前摇/伤害），不触及 PersonalState 抓拍 / 重连还原 / 断线托管路径；snapshot 格式未变 → ux-spec §7 流程不受影响。✅
- RESIDENT：公共房敌人同样由固定算法驱动，无差异。✅
- **缺口（继承 E5 O-K/O-C）**：重连 seq 连续性契约仍待显式约定（O-K6）；范围/权威位置命中校验（O-C6）未做（敌人 windup 完成后对 targetId 直结算，不重校距离）。均非阻塞。
- **DANGER 豁免**：E6 telegraph 为纯服务端状态，无视觉/配色序列化，完全不触碰 art-bible §3「全局 8% 强提醒色预算」；telegraph 视觉/豁免在 E12(HUD)+⑬ 层生效，E6 无交集。✅
- §8 可访问性维度（色盲三重 / 按键重映射 / 减弱动效保留静态预警）均不依赖 E6 服务端状态；telegraph 第 1 帧静态可读（P3 硬约束）由 D12 前摇时序在服务端保证（可视化待 E12）。✅

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E6 把「⑧ 敌人 AI 意图生成 + D12 前摇分层(21/24/30) + 经 resolveDamage 产出敌人伤害（敌我分离、C11 服务端裁决）」一次闭环：stepEnemyAi 只产意图绝不直改实体，纪律 B 由 combat.test.ts 第6例静态契约守住；前摇分层 21/24/30 稳守 D12 下限 18；GOLDEN_WORLD_HASH 重锁后跨运行字节相等（D9 零回归）；可访问性/DANGER 豁免无冲突。可放行进入 E7/E8/E9/E10/E11/E12/E13 后续切片。**建议「好玩吗」验证门前补 carried-forward O-C6（范围重校）与平衡初稿复核（P5）。**

### 6.2 E5 待闭合项 reconcile（O-E / O-D / O-M）

- **O-E（敌人伤害未接线）→ RESOLVED（E6 闭合）**：enemy-ai 现经 world 向 resolveDamage 提交 enemyDamage（ENEMY_PROTOTYPES 平衡初稿），敌人 0 伤害时代结束。✅
- **O-D（telegraph 仅服务端状态无视觉）→ PARTIALLY PROGRESSED（仍 OPEN 视觉部分）**：E6 已生成 telegraph 时序状态（start/apply/targetId/kind），但 AttackWindup schema 缺 shape/color/radius、snapshot 不序列化、无 HUD 渲染；可视化与"第 1 帧静态可读形状"仍归 E12/E13。O-D 视觉项保持 OPEN。⚠
- **O-M（闪避后玩家冻结）→ RESOLVED（已应用）**：当前 world.ts 已含 IFRAME 过期清除 + 位运算输入门控（`(status&ALIVE)&&!(status&DOWNED)`），world-dodge.test.ts 验证多 tick 后仍可移动/攻击。E6 未回归此修复。✅

### 6.3 非阻塞观察（CONCERNS 类，不 gate E6，供下游 epic 跟踪）

- **O-A6 · 敌人 AI 仅为基础追击+攻击（S6.2 部分）**：stepEnemyAi 实现"寻最近存活玩家→在 attackRange 内 ATTACK 否则 MOVE 逼近"，无寻路（穿墙直线）、无编队/分离转向、无仇恨切换（每 tick 重选最近）、无技能/走位/kiting。epics S6.2"寻路/编队"未覆盖。建议下游 epic（敌人行为增强）补寻路（依赖 O-B6 碰撞）与编队行为。非阻塞（E6 MVP 目标=可威胁的敌人 AI 闭环）。
- **O-B6 · 碰撞未做（继承 E5 O-B）**：敌人位移 `dir.x*ms`（speed/30）无地形/实体碰撞层读取，穿墙逼近；玩家同。S5.2/S6.2 碰撞约束未落地。建议独立碰撞 epic。非阻塞。
- **O-C6 · 范围/权威位置命中校验未做（继承 E5 O-C）**：resolveDamage/world 结算仅校验存活/IFRAME，不重校攻击者-目标距离/几何；敌人 windup 完成即对 targetId 直结算，玩家若在 21–30 tick 内 kite 出范围仍被命中（telegraph 锁目标于提交时刻）。S6.4"application_tick 服务器裁定"+S5.4/S5.6 位置维度未实现。建议「好玩吗」门前补范围重校（或 telegraph 形状随 commit 锁定可视化），否则 kiting 无效。非阻塞（时序正确）。
- **O-D6 · telegraph 形状/颜色未传播到状态（STRUCT，继承 O-D）**：`AttackWindup` 接口（combat.ts）仅 start/apply/targetId/kind，无 shape/color/radius；`proto.shape`（RING/AOE_FILL/CONE）未带入 telegraph 状态，snapshot 不序列化。E12 渲染时需自 enemyTypeId 反查形状（或扩展 schema）。非阻塞，但建议 E12 前定 schema（扩展 AttackWindup 或 ⑬ 反查 proto）。
- **O-E6 · 平衡初稿定值（待 P5 调优）**：`ENEMY_PROTOTYPES.attackDamage(8/12/20)/speed(110/95/80)/attackRange(40/48/64)/telegraphTicks` 全为初稿定值，无衰减/随层数缩放；敌人 AI 无难度曲线。注释明示待 P5 调优。非阻塞。
- **O-F6 · R1 二进制仍占位（JSON→Buffer）**：E6 未改传输层。非阻塞（同 E1 O2/E4 O4）。
- **O-G6 · DOWNED 触发后无计时/OUT/救援（⑪ E7）**：同 E5 O-G，E6 不改；超时→OUT/救援/免疫补刀由 E7 接管。非阻塞。
- **O-H6 · E13 GDD 回填待做（C9/C1）**：E6 新增常量（ENEMY_PROTOTYPES 四项平衡初稿 + D12 tier 分层 21/24/30）已锁代码但 GDD⑧ §4 未回填。建议 E13 以代码为权威源反向同步（同 E5 O-I）。非阻塞。
- **O-I6 · intent.damage 冗余（微，正向）**：`EnemyIntent.ATTACK` 携带 `damage`（proto.attackDamage），但 world 忽略并自 ENEMY_PROTOTYPES 重派生 enemyDamage —— 冗余字段，但**正向**（防御纵深：不信任 AI 提供伤害，服务端重裁决，强化 C11）。建议保留冗余并在注释标明"intent 伤害仅供参考，以 world 派生为准"，或后续清理。非阻塞。
- **O-J6 · golden 测试仍标注 E5（命名 nit）**：`world-determinism.test.ts` 描述/测试名仍写 "E5 world determinism"，但已含 E6 重锁注释与重锁哈希。功能正确，仅命名滞后。非阻塞（建议 E13 顺手改标签）。
- **O-K6 · 重连 seq 连续性契约待显式约定（继承 E5 O-K）**：E6 未改 input.ts，守卫 intact；跨断线 seq 不重置客户端契约仍未写明，待 E7/客户端闭环。非阻塞（headless 不触发）。

### 6.4 阻塞项：**无**

---

## 7. Handoff
- 本稿随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-e6.md`。
- E6 验收建议放行；O-A6–O-K6 记入下游 epic 待办，不阻断 Sprint 1 推进；**O-C6（范围重校）建议作为「好玩吗」验证门前补**；O-E（E5）已闭合、O-D 部分推进、O-M 已修复。
- 下一步（按 sprint-1 顺序）：E2✅ E1✅ E3✅ E4✅ E5✅ O-M✅ → **E6✅** → E7（⑪ 闭合 O-G6/O-K6/D8）+ E8（⑨ 闭合 O-A 协作技）+ E9（⑥）+ E10（⑩）+ E11（⑫）+ E12（⑬ 闭合 O-D 视觉 + O-D6 schema）+ E13（C9/C1 回填，闭合 O-H6/O-I6）。
- 跨队友提示：
  - **O-C6（范围重校）/O-B6（碰撞）**建议主理人排入战斗/碰撞 epic；**O-A6（敌人行为）**建议排入敌人增强 epic。
  - **O-D6 schema 扩展**建议主理人协调 design-strategist（⑧ GDD）+ engineering-lead 在 E12 前定 telegraph 状态形状字段。
  - art-bible §3 DANGER 豁免与 E6 无交集（telegraph 无视觉），无需改动 art-director 文档；可访问性维度（§5/§8）无改动。
  - **quality-lead-4**：E6 测试面（dungeon-server 27/27、harness 7/7 已由主理人独立核实 #fail 0）建议 QA 计划补「敌人 AI 攻击命中 / 前摇分层 21/24/30 / 敌我伤害分离」用例并回归；O-C6 范围重校用例建议进「好玩吗」门前。

（文策渊 · design-strategist · E6 设计评审，主理人汇编落盘）
