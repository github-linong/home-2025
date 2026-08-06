# E2 数据基座 · 设计评审 + 范围检查
路径：production/design-review-e2.md ｜ 作者：design-strategist（文策渊）｜ 状态：已落盘（Sprint 1）
评审对象：`packages/sim-core/src/types.ts`、`rng.ts`、`enemy-ai.ts`（只读不改码）

## 0. 判定摘要
- **判定：PASS**（含 5 条非阻塞观察 / CONCERNS 类，无一项 gate E2 验收）
- **阻塞项：无**
- **范围**：S2.1–S2.4 全覆盖；无超范围；无 schema 漏项（敌人/资源原型为 MVP 初值，schema 用 `Record<string,…>` 可扩展）
- **契约一致性**：`types.ts` vs ① ④ ⑦ ⑧ ⑪ + `art-bible §3` 全绿
- **纪律 A / B**：满足
- **RNG（D9）**：splitmix64 + Xoshiro256+ 齐备，BigInt 掩码保证跨语言位一致；C7 golden 为 QA 验证门
- **可访问性**：`FACTION_COLORS` 与 `art-bible §3` 完全一致；冗余识别机制（形/号/字）归属 ⑬ HUD，sim-core 仅承载颜色通道，无设计阻塞

## 1. 范围检查
### 1.1 覆盖确认（对照 epics.md E2 = S2.1–S2.4，C6 纪律 A）
| Epic 子项 | 预期交付 | 实际文件 | 结论 |
|---|---|---|---|
| S2.1 统一状态/属性模型 | EntityState / PersonalState / EntityStatus / EntityKind / RoomPhase / Vec2 / StatusEffect | `types.ts` L85–151 | ✅ 全覆盖 |
| S2.2 敌人原型表（仅数据，③） | EnemyPrototype / ENEMY_PROTOTYPES / EnemyTier / TelegraphShape / DANGER_COLOR | `types.ts` L153–218 | ✅ 全覆盖 |
| S2.3 资源原型表（仅数据） | ResourcePrototype / RESOURCE_PROTOTYPES / ResourceCategory | `types.ts` L220–240 | ✅ 全覆盖 |
| S2.4 确定性 RNG（D9） | splitmix64 / Xoshiro256+ / seed→state 展开 / Rng 便捷封装 | `rng.ts` 全篇 | ✅ 全覆盖 |
| C6 纪律 A 数据边界 | ⑤ 仅引 ③ ID；⑧ 只读 SpawnPoint[] | `types.ts` L246–252 + `enemy-ai.ts` L13 | ✅ 满足 |

### 1.2 超范围检查
- `types.ts` 注释"只含类型别名/接口/const 数据，无运行时逻辑"，写入逻辑声明在 E5/E6/E7。✅
- `rng.ts` 注释"无任何 I/O、无全局可变状态、无第三方依赖；仅纯函数+类型"。✅
- `enemy-ai.ts` 为占位骨架，`stepEnemyAi()` 直接 `throw`，无 AI 运行时。✅
- 结论：E2 未越界实现任何战斗/网络/AI 运行时逻辑，无超范围。

### 1.3 漏项检查
- 三文件 schema 与数据初值齐备，全部以 `Record<string,…>` / 枚举 `as const` 表达，可扩展。
- 敌人/资源原型各 3 条为 MVP 初值，⑥⑧ GDD 若列更多条目将在 E6/E7 补齐，不构成 E2 缺口。

## 2. 设计契约一致性（`types.ts` vs 上游 GDD）
| 字段 / 常量 | GDD 来源 | `types.ts` 实现 | 结果 |
|---|---|---|---|
| CLASS_BASE（hp/moveSpeed/attackCooldownMs） | GDD⑦ §4 | tank 140/140/400、ranger 80/185/400、mage 90/165/400、healer 100/170/400 | ✅ 一致 |
| FACTION_COLORS | `art-bible §3` | P1 #4CB5F5 / P2 #9B7BE8 / P3 #E86FB0 / P4 #6FD68A | ✅ 一致 |
| EntityStatus 含 DOWNED / OUT | GDD⑪ 状态机 | DOWNED(1<<1) / OUT(1<<2) | ✅ 一致 |
| PersonalState（D8 重连还原） | ADR-NET-01 D8 | seatId/status/hp/downedRemainingTicks/rescueProgressTicks | ✅ 一致 |
| TelegraphState.applyTick 由 ⑦ 裁定 | D13 / 纪律 B | `applyTick` 注释"由 ⑦ 在服务器裁定" | ✅ 一致 |
| ENEMY_PROTOTYPES.telegraphTicks | ADR-NET-01 D12（MIN=18） | grunt 21 / elite 24 / boss 30 | ✅ 全部 ≥ 18 |
| SpawnPoint schema | GDD⑤ §3 | pos/enemyTypeId/wave/count | ✅ 一致 |
| InputCmd.seq（防重放） | C11 | `seq` 字段 | ✅ 一致 |
| RoomPhase.RESIDENT | ADR-NET-01 D11 | RESIDENT=4 | ✅ 一致 |
| EntityKind.TELEGRAPH/PROJECTILE | GDD⑦/⑧ | TELEGRAPH=5 / PROJECTILE=4 | ✅ 一致 |
| DANGER_COLOR | `art-bible §3` DANGER 豁免 | DANGER_COLOR=0 | ✅ 一致 |

## 3. 纪律 A / B 检查
- 纪律 A：`SpawnPoint.enemyTypeId: string` 注释"引用 ③ 敌人原型表 ID（非运行时实例）"；`enemy-ai.ts` 对 SpawnPoint 仅 `import type`，无运行时读取/生成调用。✅
- 纪律 B：`enemy-ai.ts` 全文仅 `import type { SpawnPoint } from "./types.js"`，无任何对 `combat.ts` / `dungeon-gen.ts` 运行时 import；伤害结算明确"一律以 DamageRequest 提交给 ⑦"。✅

## 4. 确定性 RNG（S2.4 / D9）
- splitmix64 标准常数（Vigna）：增量 `0x9e3779b97f4a7c15`、混合 `0xbf58476d1ce4e5b9`/`0x94d049bb133111eb`。✅
- Xoshiro256+ 标准结构：`result=s0+s3`、`t=s1<<17`、`rotl 45`。✅
- 跨语言位一致：全 BigInt + `& 0xFFFFFFFFFFFFFFFFn` 掩码；`ushr` 无符号右移规避符号扩展。✅
- 无全局可变状态：`splitmix64Next`/`xoshiro256Next` 返回 `{value, state}` 纯函数；`Rng` 封装为实例内可变态（非全局）。✅
- 单一 seed→state 规范路径：`xoshiro256Seed(seed)` 经 splitmix64Next ×4 展开，golden 可锁定唯一初值。✅

## 5. 可访问性
- `FACTION_COLORS` 四色 hex 与 `art-bible §3` 完全一致（重读确认）。art-bible 已标"色盲安全"，与 accessibility.md 开放项 #1【已决】对齐。✅
- 仅凭 4 色区分阵营对色盲不足，须以形状/图标/座位号冗余识别——机制位于 ⑬ HUD 渲染层（accessibility.md #1 已决），sim-core 仅提供颜色通道，未越权。✅ 无设计阻塞。
- `DANGER_COLOR=0` 对应 `art-bible §3` DANGER 红区豁免，与可访问性策略一致。✅

## 6. 判定与遗留
### 6.1 判定：PASS
E2 脚手架 + 数据基座范围完整、与上游 GDD 契约零冲突、纪律 A/B 正确、确定性 RNG 满足 D9。可进入 E1 后续切片，无需返工。

### 6.2 非阻塞观察（供下游 epic 跟踪，不 gate E2）
- **O1 · ⑪ OUT vs DEAD 语义**：`EntityStatus` 同时保留 `OUT(1<<2)` 与 `DEAD(1<<3)`。GDD⑪ 当前仅定义 DOWNED→OUT（超时本局观战）。E7 实现状态机时明确两位映射，避免同时置位歧义。
- **O2 · BUFF 双重表示**：`BUFF(1<<7)` bitmask 与 `StatusEffect.type=2` 数组可同时表达增益。确认预期为"bitmask=快速查询位、statusEffects=明细"，避免重复结算。
- **O3 · nextFloat 跨语言浮点**：`Number(value>>11n)/2^53` 须由 GDScript 端口精确复刻 IEEE754 结果。建议 C7 golden-test 至少含一例 float 抽样。
- **O4 · 原型条目为 MVP 初值**：敌人/资源各 3 条。若 ⑥⑧ GDD 列更多条目，将在 E6/E7 按各自系统补齐；schema `Record<string,…>` 可扩展。
- **O5 · CLASS_BASE 调优跟踪**：注释"GDD⑦ §4 初稿，待 P5 调优"。若 P5 重调 ⑦，types.ts 为唯一权威源，建议加 cross-ref 防漂移。

### 6.3 阻塞项：无

## 7. Handoff
- E2 验收放行；O1–O5 记入下游 epic（E6/E7/⑬）待办，不阻断 Sprint 1 推进。
- 下一步（按 sprint-1 顺序）：E2 完成 → E1 → E4 → E3 → E5 → E6 → E7，E13（C9/C1 文档回填）并行前置。
