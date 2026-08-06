# E5 设计评审 + 范围核查（P5-S1-DES-4）

- **路径**：`games/dungeon-online/production/design-review-e5.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）
- **汇编落盘**：主理人（游承峰）
- **评审对象**：
  - `packages/sim-core/src/combat.ts`（NEW，系统⑦ resolveDamage 纯函数）
  - `packages/sim-core/src/types.ts`（EDIT：+DamageRequest / DamageEvent / CombatIntent）
  - `packages/sim-core/src/world.ts`（EDIT：O2 移动接管 + C11 完整 + D12 前摇路由）
  - `packages/sim-core/tests/unit/combat.test.ts`（6 例，含纪律 B 静态契约）
  - `packages/sim-core/tests/golden/world-determinism.test.ts`（锁 GOLDEN_WORLD_HASH，替换 PENDING_E5）
- **基线**：`design/ux/ux-spec.md` §0/§3、`art/art-bible.md` §0/§3（DANGER 豁免）、`docs/architecture/ADR-NET-01.md`（D12/D13）、`packages/sim-core/src/types.ts`、`production/epics.md`(E5)、`production/design-review-e1-e4.md`

---

## 0. 判定摘要

- **判定：PASS**（含 12 条非阻塞观察 / CONCERNS 类，无一项 gate E5 验收；其中 O-M「闪避后玩家冻结」为需高优修复的潜在功能缺陷，建议进 playtest 门前补）
- **阻塞项：无**
- **E5 范围**：⑦ 统一结算权威 `resolveDamage`（纯函数）✅ / O2 移动接管（`CLASS_BASE[classId].moveSpeed/30`，移除占位 `MOVE_SPEED_PX`）✅ / C11 完整（S5.7 拒伪造伤害，`req.amount` 被完全忽略，服务端 `PLAYER_ATTACK_DAMAGE=18` 裁决）✅ / D12 前摇（`MIN_TELEGRAPH_TICKS=18`，`applyTick = tick+18`）✅
- **未覆盖（正确 defer）**：⑧ AI（enemy-ai.ts 仍为占位骨架，E6）、⑪ 救援/OUT（仅触发 DOWNED 位，接管交 E7）、R1 二进制通道（仍 JSON→Buffer 占位）、S4.2/S4.4 客户端预测/插值（headless）、S5.2 碰撞层、S5.4/S5.6 范围命中校验（部分 defer）
- **契约一致性**：E5 常量 vs ux-spec §0/§3、art-bible §3、types.ts、ADR D12 全绿（telegraph 前摇 18tick=0.6s、DANGER 豁免不触碰、C11 意图语义、CombatKind↔InputAction 值对齐）
- **纪律 A/B**：A 无回归（world 仍只读 `spawnPoints`；combat 不触 dungeon-gen）；B（⑧ 仅 import type，绝不 import combat/dungeon-gen 运行时，只经 resolveDamage 出口）由 combat.test.ts 静态契约守住，combat.ts 自身仅 `import type` 引 DamageRequest/DamageEvent
- **RNG(D9)**：`GOLDEN_WORLD_HASH` 锁定（跨运行字节相等）；createWorld 种子派生未变；combat 纯函数无 RNG；world.step 无 `Math.random`/`Date`；无新增隐藏随机源
- **可访问性**：E5 战斗/前摇/IFRAME 均为纯服务端状态，不影响 ux-spec §7 断线/RESIDENT；DANGER 豁免无冲突（telegraph 在 E5 无视觉/配色）
- **设计红线**：无主导策略 / 经济失衡 / 认知过载 / 支柱漂移；P3「读得懂的紧张感」经 D12 前摇硬下限在服务器端落地 ✅

---

## 1. 范围检查

### 1.1 E5 范围核查（⑦ / O2 / C11 / D12）

| 控制项 | 意图（epics E5） | E5 落点 | 结论 |
|---|---|---|---|
| **⑦ 结算权威** | 伤害/状态逐 tick 裁定，客户端/⑧ 只交意图，绝直改 hp/status | `combat.ts` `resolveDamage(state, req)` 纯函数：改 target.hp/status 并返 `DamageEvent`；调用方（world/⑧）只传 `DamageRequest` | ✅ 全覆盖 |
| **O2 移动接管** | 移除占位 `MOVE_SPEED_PX`，改 `CLASS_BASE.moveSpeed/30` 每 tick | `world.ts` `moveSpeedPerTick(classId)=CLASS_BASE[classId].moveSpeed/30`；`cmd.action===MOVE` 时 `a.x+=dir.x*ms` | ✅ 全覆盖（闭合 E4 O2） |
| **C11 完整**（S5.7） | 服务端权威校验 + 拒伪造伤害请求 | `resolveDamage` 完全忽略 `req.amount`（`const dmg = PLAYER_ATTACK_DAMAGE`），伪造 9999 被拒；意图只携 `targetId`/`kind`，无伤害数值 | ✅ 全覆盖 |
| **D12 前摇**（S5.8） | telegraph 前摇 ≥18tick(0.6s)，`application_tick=T0+18` | `world.ts` ATTACK/SKILL → `a.telegraph={startTick,applyTick:tick+MIN_TELEGRAPH_TICKS,targetId,kind}`；结算循环仅当 `applyTick<=tick` 经 ⑦ 结算；`combat.ts` windup 未完成返 no-op | ✅ 全覆盖 |
| **DODGE i-frame**（S5.3） | 闪避即时授予免伤窗口，落窗命中抵消 | `world.ts` DODGE → `resolveDamage(kind:DODGE)` 授来源自身 `iframeUntilTick=tick+12`+`IFRAME` 位；`resolveDamage` 命中窗口内返 `deltaHp=0` | ⚠ 接线到位但 **IFRAME 过期未清除**（见 O-M） |
| **C11 意图语义**（S5.7） | 意图只带 targetId/skillId | `CombatIntent{type,targetId?,skillId?}` 已定义；world 经 `InputCmd.action+target` 路由，不携伤害 | ✅ 一致 |

### 1.2 未覆盖项（正确 defer，非范围失败）
- **⑧ AI**：enemy-ai.ts 仍为 `stepEnemyAi(): never { throw "not implemented in Sprint 1" }` 占位骨架；world.ts 敌人分支仅「朝最近玩家每 tick 逼近 1px」占位。真实 AI（S6.1–S6.5）归 E6。✅ 预期内。
- **⑪ 救援/OUT**：resolveDamage 在 `hp<=0` 仅置 `DOWNED` 位 + 钳 `hp=0`，注释明示「倒地恢复/OUT 由 ⑪ E7 接管，此处仅触发」。S5.5「HP≤0 → DOWNED 事件（交 E7）」达标。✅ 预期内。
- **R1 二进制通道**：E5 未碰传输层，数据面仍 JSON→Buffer 占位（同 E1 O2 / E4 O4）。✅ 预期内。
- **S4.2/S4.4 客户端预测/插值**：纯 Godot 客户端，headless 未实现（R2）。服务端仅提供对账数据。✅ 预期内。
- **S5.2 碰撞层 / S5.4·S5.6 范围命中校验**：E5 仅接管移速（无地形/实体碰撞），resolveDamage 不校验距离/权威位置（仅校验存活/IFRAME）。部分 defer（见 O-B/O-C）。⚠ 属 E5 子项但本次未完整落地。

### 1.3 超范围检查
- E5 全部为战斗结算 + 移动 + 前摇 + 闪避接线逻辑，**未**实现 ⑧ AI 运行时、⑪ 救援/OUT、R1 二进制、客户端插值、⑨ 协作技差异化、⑬ HUD/telegraph 视觉。✅
- combat.ts 不 import dungeon-gen/enemy-ai 运行时；world.ts（① 编排层）引 combat 运行时属 ADR D13 授权（① 是 ⑦ 唯一编排调用方）。✅
- **结论：E5 未越界，范围与 sprint-1.md / epics.md E5 一致**（含预期内 defer）。

---

## 2. GDD 契约一致性表（E5 实现 vs 上游基线）

| 契约点 | 基线出处 | E5 实现 | 结果 |
|---|---|---|---|
| telegraph 前摇 18tick=0.6s | ux-spec §0 / art-bible §7 / ADR D12（`MIN_TELEGRAPH_TICKS=18`） | `combat.ts` `MIN_TELEGRAPH_TICKS=18`；`world.ts` `applyTick=tick+18`；test 断言 tick<18 no-op、tick==18 生效 | ✅ 一致 |
| 玩家前摇取 18 下限，敌人取分层（杂兵21/精英24/Boss30） | ux-spec §0 / types `ENEMY_PROTOTYPES.telegraphTicks` | 玩家走 `MIN_TELEGRAPH_TICKS=18`（下限）；敌人 tier 值≥18（未接线，E6 用） | ✅ 一致（下限不冲突） |
| DODGE i-frame 语义 | ux-spec §3「闪避(i-frame)」 | `DODGE_IFRAME_TICKS=12`(~0.4s)；命中免伤窗口内 `deltaHp=0` | ✅ 一致（ux-spec 未定具体 tick 值，无反约束） |
| C11 服务端裁决伤害 | C11 / ADR D13 | `resolveDamage` 忽略 `req.amount`，`dmg=PLAYER_ATTACK_DAMAGE=18`；test 伪造 9999→按 18 结算 | ✅ 一致 |
| C11 意图只携 targetId/skillId（无伤害数值） | C11 / types `CombatIntent` 注释 | `DamageRequest{sourceId,targetId,amount(忽略),tick,kind}`；world 只传 `targetId`/`kind` | ✅ 一致 |
| CombatKind 值对齐 InputAction | types `InputAction{MOVE0,ATTACK1,DODGE2,SKILL3}` | `CombatKind{ATTACK1,DODGE2,SKILL3}`；world 用 `cmd.action` 直作 `kind`（ATTACK/SKILL 值相同，DODGE 不建前摇） | ✅ 一致 |
| 命中权威判定点（application_tick 服务器裁定） | ADR D13 / D12 | windup 由 world 在 `applyTick` 经 ⑦ 结算；客户端不裁定伤害 | ⚠ 时序正确，但**距离/范围校验未做**（O-C） |
| DOWNED 触发（hp≤0） | epics S5.5「交 E7」 | `target.hp<=0 → status|=DOWNED` + 钳 0；不接管 OUT/救援 | ✅ 一致（接管 defer E7） |
| 移动移速 `CLASS_BASE.moveSpeed/30` | O2 / types `CLASS_BASE.moveSpeed` | `moveSpeedPerTick=moveSpeed/30`（140/185/165/170 → 4.67/6.17/5.5/5.67 px/tick） | ✅ 一致（闭合 E4 O2） |
| DANGER 豁免（telegraph 不计入 8% 配色预算） | art-bible §3 | E5 telegraph 为纯服务端状态（world.snapshot 未序列化 telegraph/color 字段），不触碰 8% 预算 | ✅ 无冲突 |
| 阵营色纪律 | art-bible §3 / ux-spec §4 | E5 不触碰阵营色/配色（属 ⑬ HUD） | ✅ 无冲突 |
| seq 防重放（C11 基线） | input.ts（E4 已锁） | E5 未改 input.ts；`seq<=lastSeq→拒` 守卫 intact | ✅ 无回归 |
| `lastProcessedSeq` 对账钩子 | ux-spec §0/§3（S4.3） | world.snapshot 仍随 `inputs.lastProcessedSeq()` 下发，格式未变 | ✅ 无回归 |

---

## 3. 纪律 A / B 检查

**纪律 A（⑤ 只产 SpawnPoint[] / ⑧ 只读；consumer 只读语义）**
- `world.ts`：仍 `generateLayout` 后只读 `layout.spawnPoints` 实例化敌人；不反向修改布局、不调 ⑤ 运行时生成函数（一次性编排调用属 ①）。✅
- `combat.ts`：不 import dungeon-gen / enemy-ai 运行时，不读 SpawnPoint；纯结算。✅
- E5 未引入任何对 ⑤ 输出或 ⑧ 数据的反向写，A 无回归。✅

**纪律 B（⑧ 仅 import type，绝不 import combat/dungeon-gen 运行时；只经 resolveDamage 出口；consumer 不改 diff 格式）**
- `combat.ts` 自身：`import type { DamageRequest, DamageEvent }`（类型）+ `import { EntityStatus }`（标志位 const，非 combat/dungeon-gen 运行时）。**无 combat 自引 / dungeon-gen 运行时 import**。✅
- `world.ts`（① 编排层）：运行时引 `resolveDamage`/`MIN_TELEGRAPH_TICKS`/`CombatKind` 等——属 ADR D13「① 是 ⑦ 唯一编排调用方」授权，合规。✅
- `enemy-ai.ts`（⑧ 占位）：仅 `import type { SpawnPoint } from "./types.js"`，`stepEnemyAi():never` 抛错；**无 combat/dungeon-gen 运行时 import**，无直改 hp/status。✅
- **静态契约守门**（combat.test.ts 第 6 例）：读 `enemy-ai.ts` 源码正则断言 ① 无 `combat`/`dungeon-gen` 运行时 import、② 用 `import type`、③ 无 `hp=`/`hp+=`/直改 `status` 源码模式。enemy-ai.ts 全部通过。✅
- **diff 格式守约**：`world.snapshot()` 的 `WorldSnapshot` 形状（tick/runId/roomPhase/entities/lastProcessedSeq）未因 E5 增删必填字段；`EntityState.telegraph?`/`rescue?` 为可选且 world 未强制填充（向下兼容）。消费者（①/⑬）无格式破坏。✅

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| `GOLDEN_WORLD_HASH` 锁定 + 跨运行字节相等 | `world-determinism.test.ts` 锁 `823863c6b4927719b78d28f4e4de1867e4da281141191b58b303d3888017ed27`，断言同 seed(`EMBER-S1`)+固定输入序列（含一次 ATTACK）→ 字节级稳定 | ✅ 替换 PENDING_E5，golden 有效 |
| createWorld 种子派生未变 | `erng = new Rng(hashString64(\`${seed}:${biomeId}:enemies\`))` 与 E1/E3 一致；`generateLayout(seed,biomeId)` 调用未改 | ✅ 不破坏 GOLDEN_LAYOUT_HASH |
| combat 纯函数无 RNG | `resolveDamage` 仅用常量 `PLAYER_ATTACK_DAMAGE`/位运算，无随机源 | ✅ |
| world.step 无隐藏随机源 | `world.ts` 无 `Math.random`/`Date.now`/全局可变态；占位 AI `actors.find` 确定性取最近玩家（数组序稳定） | ✅ |
| 确定性跨端对齐 | sim-core 纯逻辑无运行时依赖，便于 GDScript 端口复刻（C7 门归 QA） | ✅ |

> E5 接入战斗/前摇/移动后，`GOLDEN_WORLD_HASH` 实测锁定并替换 PENDING_E5，D9 契约零回归。

---

## 5. 可访问性

**E5 战斗/前摇/IFRAME 纯服务端状态 vs ux-spec §7 断线 / RESIDENT**
- E5 全部逻辑在权威 world 内结算，不触及 `PersonalState` 抓拍 / 重连还原 / 断线托管路径；`lastProcessedSeq` 对账数据格式未变 → ux-spec §7 流程不受影响。✅
- RESIDENT：公共房玩家同样有 seatId(playerId)，每玩家输入队列与战斗结算无差异。✅
- **缺口（O-K，继承自 E4 O1）**：重连后 seq 连续性契约（client 须延续断线前 seq，不得归零）仍未在客户端层显式约定；E5 未改 input.ts，守卫 intact，但缺口仍在，待 E7/客户端闭环。非阻塞（headless 不触发重连输入路径）。
- **DANGER 豁免**：E5 telegraph 为纯服务端状态，world.snapshot 不序列化 telegraph 色/形字段，完全不触碰 art-bible §3「全局 8% 强提醒色预算」；telegraph 视觉/豁免在 ⑧(telegraph 生成)+⑬(HUD) 层生效，E5 与其无冲突。✅
- §7 可访问性维度（色盲三重 / 按键重映射 / 减弱动效保留静态预警）均不依赖 E5 服务端状态。✅

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E5 把「战斗结算权威（⑦）+ 移动接管(O2) + C11 完整 + D12 前摇」一次性闭环：resolveDamage 纯函数单点裁决、客户端/⑧ 只交意图、拒伪造伤害；D12 前摇硬下限在服务端落地；O2 闭合 E4 遗留。纪律 A/B 守约（B 由 combat.test.ts 静态契约守住）；D9 golden 锁定替换 PENDING_E5；可访问性/DANGER 豁免无冲突。可放行进入 E6/E7/E8/E13 后续切片，**但建议 playtest 门前修 O-M（见下）**。

### 6.2 非阻塞观察（CONCERNS 类，不 gate E5，供下游 epic 跟踪）

- **O-M ·【高优·潜在缺陷】闪避后玩家被永久冻结（DODGE→IFRAME 过期未清除）**：`combat.ts` DODGE 给来源置 `IFRAME` 位 + `iframeUntilTick`，但 **world.ts 无任何清除 IFRAME 位的逻辑**；而 `world.step` 玩家输入门控用严格相等 `a.status === EntityStatus.ALIVE`（非位运算 `&`）。一旦闪避，`status=ALIVE|IFRAME(17) ≠ 1` → 后续 tick 该玩家**整支输入分支被跳过（无法移动/攻击/再次闪避），且 IFRAME 位永不清除 → 永久冻结**。golden/combat 测试均未覆盖此路径（golden 不闪避；combat 测试直调 resolveDamage 不经 world.step），故红灯未现。**修复（已派 engineering-lead）**：① 每 tick 初对 `iframeUntilTick` 过期实体清 `IFRAME` 位；② 玩家输入门控改为 `(a.status & EntityStatus.ALIVE) && !(a.status & EntityStatus.DOWNED)`。**不 gate E5 落盘（核心契约+测试绿），但强烈建议进「好玩吗」验证门前修复**，否则玩家一闪避即卡死。
- **O-A · SKILL 未差异化（E8 / ⑨）**：SKILL 经 `resolveDamage` 走与 ATTACK 完全相同的 `PLAYER_ATTACK_DAMAGE=18` 路径（kind=3 无专属结算分支），无职业/技能差异/效果。E5 仅铺结算管线（S5.3「技能结算」达标），技能差异化归 E8。非阻塞。
- **O-B · 碰撞未做（S5.2）**：E5 移动为无碰撞直线位移（`dir.x*ms`），无地形/实体碰撞层读取；敌人占位 AI 也穿墙逼近。S5.2「碰撞层只读约束」未落地，建议 E5 后续或独立 epic 接入读取碰撞层。非阻塞。
- **O-C · 范围/权威位置命中校验未做（S5.4 / S5.6 部分 defer）**：`resolveDamage` 仅校验存活/IFRAME，不校验攻击者与目标的距离/朝向/范围（world 按 `targetId` 直取目标，无视几何）。S5.4「校验范围命中（权威位置）」与 S5.6「命中权威判定点」的位置维度未实现。非阻塞（E5 核心时序正确），但「好玩吗」前须补，否则任何 targetId 即命中。
- **O-D · telegraph 仅服务端状态无视觉（E6 + ⑬）**：world.snapshot 未序列化 `telegraph`/`rescue` 字段（EntityState 类型有可选字段但未填充），客户端/HUD 看不到前摇形状；P3「第 1 帧静态可读」依赖 ⑧ telegraph 生成 + ⑬ HUD 渲染，E5 不涉及视觉。非阻塞。
- **O-E · 敌人伤害未接线（⑧ E6）**：占位 AI 只逼近玩家、不提交 `DamageRequest`；当前仅玩家可经 ⑦ 输出伤害，敌人 0 伤害。这是 ⑧ 未实现的预期结果，非 E5 越界；`resolveDamage` 通用（source 可为敌人），E6 接入 ⑧ 提交即生效。非阻塞。
- **O-F · PLAYER_ATTACK_DAMAGE 全职业同值 18（平衡初稿，待 P5 调优）**：tank/游侠/术士/医者普攻皆 18，未体现职业差异（职业差异在 ②/⑨/E8）。注释明示「初稿定值，待 P5 调优」。非阻塞。
- **O-G · DOWNED 触发后无计时/OUT/救援接管（⑪ E7）**：resolveDamage 仅置 `DOWNED` 位 + 钳 `hp=0`，未清 `ALIVE` 位（downed=ALIVE|DOWNED）；`PersonalState.downedRemainingTicks` 在 types 已定义但 world.ts 未推进。超时→OUT、救援读条、免疫补刀由 E7 接管（S5.5「交 E7」）。非阻塞，但 E7 须闭环倒计时结构。
- **O-H · R1 二进制通道仍占位（JSON→Buffer）**：数据面仍 JSON→Buffer 占位，真正 state-diff 二进制 delta 推迟（同 E1 O2 / E4 O4）。非阻塞（Sprint 1 可接受），生产前须替换以满足 30Hz×4 perf 带宽<16KB/s。
- **O-I · E13（C9/C1）GDD 回填待做（同 E1-E4 O4/O5）**：代码已锁常量（`MIN_TELEGRAPH_TICKS=18=0.6s`、`PLAYER_ATTACK_DAMAGE=18`、`DODGE_IFRAME_TICKS=12`、`CLASS_BASE.moveSpeed/30`）但 GDD（⑦§4/§7 等）尚未回填。建议 E13 以代码为权威源反向同步。非阻塞。
- **O-J · CombatIntent 契约类型已定义但未在 E5 数据流消费**：`types.ts` `CombatIntent{type,targetId?,skillId?}` 为高层语义契约类型，但 world.ts 实际消费 `InputCmd.action+target`，`CombatIntent` 当前无运行时引用（仅类型契约）。不影响功能，建议 E13/接口对齐时明确其接线点（经网关→InputCmd 映射）。非阻塞。
- **O-K · 重连 seq 连续性契约待显式约定（C11 跨断线，继承 E4 O1）**：E5 未改 input.ts，守卫 intact，但「seq 跨重连不重置」客户端契约未写明，待 E7/客户端闭环。非阻塞（headless 不触发）。
- **O-L · attackCooldownMs 未强制（平衡初稿）**：`CLASS_BASE.attackCooldownMs=400` 在 E5 未强制；玩家可按前摇窗口（每 18tick）连续发起攻击。`if(!a.telegraph)` 仅防前摇重叠，不施加 CD。非阻塞（平衡初稿，P5 调优）。
- **O2（E4 遗留）已由 E5 移动接管闭合**：`MOVE_SPEED_PX` 占位移除，改 `CLASS_BASE.moveSpeed/30`。标记 resolved，不再阻塞。

### 6.3 阻塞项：**无**

---

## 7. Handoff
- 本稿可随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-e5.md`。
- E5 验收建议放行；O-A–O-L 记入下游 epic 待办，不阻断 Sprint 1 推进；**O-M 建议作为高优 must-fix 在「好玩吗」验证门前闭环**（已派 engineering-lead 修复）。
- 下一步（按 sprint-1 顺序）：E2✅ E1✅ E3✅ E4✅ **E5✅** → 修 O-M → E6（⑧ 接入提交 DamageRequest，闭合 O-E/O-D，复核纪律 B 运行时）+ E7（⑪ 闭合 O-G/O-K/D8）+ E8（⑨ 闭合 O-A）+ E13（C9/C1 回填，闭合 O-I/O-J）。
- 跨队友提示：
  - **O-M（闪避冻结缺陷）已同步 quality-lead-1**，建议加入 E5 测试计划（补「闪避后经多 tick 仍可移动/攻击」用例）并在修复后回归。
  - O-E/O-D 涉及 ⑧(enemy-ai) + ⑬(HUD)，建议主理人协调 engineering-lead 在 E6/E12 接入；O-C/O-B 建议主理人排入 E5 后续或碰撞 epic。
  - art-bible §3 DANGER 豁免与 E5 无交集（telegraph 无视觉），无需改动 art-director 文档；可访问性维度（§5）无改动。

（文策渊 · design-strategist · E5 设计评审，主理人汇编落盘）
