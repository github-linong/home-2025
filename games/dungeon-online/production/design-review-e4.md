# E4 设计评审 + 范围核查（P5-S1-DES-3）

- **路径**：`production/design-review-e4.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）
- **汇编落盘**：主理人（游承峰）　**状态**：已落盘（Sprint 1）
- **评审对象**：
  - E4：`packages/sim-core/src/{input,world}.ts`（NEW/MIGRATED）、`packages/sim-core/src/types.ts`（EDIT：+lastProcessedSeq）、`apps/dungeon-server/src/{gateway,run-manager}.ts`（EDIT：routeInput/enqueueInput）
  - 已删：`apps/dungeon-server/src/world.ts`（迁移至 sim-core，Glob 确认无残留）
- **基线**：`design/ux/ux-spec.md` §0/§3、`production/design-review-e1-e3.md`（格式参照）、`production/sprint-1.md`、`production/epics.md`(E4)、`packages/sim-core/src/types.ts`

---

## 0. 判定摘要

- **判定：PASS**（含 5 条非阻塞观察 / CONCERNS 类，无一项 gate E4 验收）
- **阻塞项：无**
- **E4 范围**：C6（每玩家输入路由隔离 / consumer 不改 diff 格式）✅ / C11 基线（seq 严格单调服务端 ingest）✅ / S4.3（lastProcessedSeq 对账钩子）✅ / S4.5（延迟指示数据暴露）✅
- **未覆盖（正确 defer）**：S4.2 本地预测、S4.4 100ms 插值渲染（Godot 客户端 headless）、R1 二进制通道（JSON→Buffer 占位）、C11 完整（E5.S5.7 拒伪造伤害请求）
- **契约一致性**：E4 实现 vs ux-spec §0/§3、types.ts 全绿（输入映射动作语义 / lastProcessedSeq↔100ms 对账数据 / seq 单调↔C11 / world 迁移 sim-core 不破 D9）
- **纪律 A/B**：A 消费者只读 SpawnPoint[] 保持；B（input/world 仅 import type 下游运行时，无 ⑦⑧ 耦合）满足
- **RNG(D9)**：world 迁移 sim-core 后 `generateLayout` 调用未变 → GOLDEN_LAYOUT_HASH 仍有效；world.step 同输入序列→同世界状态（sim-core 25/25 佐证）；无新增隐藏随机源
- **可访问性**：per-player 路由不影响 ux-spec §7 断线/RESIDENT（稳定 playerId 键 + world 宽限保活，重连 seq 连续性机制已就位）；DANGER 豁免不涉及 E4

---

## 1. 范围检查

### 1.1 E4 范围核查（C6 / C11 基线 / S4.3 / S4.5）

| 控制项 | 意图 | E4 落点 | 结论 |
|---|---|---|---|
| **C6** 每玩家输入路由隔离 / 纪律B | 输入按 playerId 隔离；consumer 不改 diff 格式 | `input.ts` PerPlayerInputQueue 按 playerId(=seatId=ownerId) 索引；`gateway.routeInput` connId→room→seatIndex→enqueueInput；`world.step` 按 ownerId 路由应用；WorldSnapshot diff 格式未变（仅追加 lastProcessedSeq 可选字段） | ✅ 全覆盖 |
| **C11 基线** seq 防重放服务端 ingest | 服务端强制 seq 严格单调，拒重放/回放/倒序 | `input.ts`：`if (cmd.seq <= st.lastSeq) return false`；`gateway.routeInput` 先校验 `typeof cmd.seq === "number"` | ✅ 基线达标（完整 E5） |
| **S4.3** reconciliation 回正钩子 | 客户端保留未确认指令，收 diff 后重演 | `types.ts` WorldSnapshot.lastProcessedSeq（各 playerId 已消费最大 seq）；`snapshot()` 下发 `inputs.lastProcessedSeq()` | ✅ 数据钩子就位 |
| **S4.5** 延迟指示数据暴露 | ping/重连状态/对账数据给 HUD | lastProcessedSeq + WorldSnapshot.tick 随数据面广播；HUD 可据此算预测缓冲/延迟 | ✅ 数据暴露就位（渲染属 Godot 客户端） |

### 1.2 未覆盖项（正确 defer，非范围失败）
- **S4.2 本地预测**：自身移动/普攻跟手表现（不等待服务器）——纯 Godot 客户端逻辑，本 Sprint headless（R2），服务端仅提供权威对账数据，不做客户端预测。✅ 预期内。
- **S4.4 100ms 插值渲染**：远程玩家/敌人插值缓冲（≈3 快照）——Godot 客户端渲染层；服务端已给 lastProcessedSeq + 30Hz 广播作为插值依据。✅ 预期内。
- **R1 二进制 state-diff**：入站数据面 input.cmd 仍为 JSON，快照广播 JSON→Buffer 占位。真正二进制 delta 推迟（与 e1-e3 O2 同源）。✅ 预期内。
- **C11 完整**：E5.S5.7「拒伪造伤害请求」属战斗权威校验（⑦），不在 E4；E4 仅交付 seq 单调 ingest 基线。✅ 预期内。

### 1.3 超范围检查
- E4 全部为输入摄取/路由/队列/对账钩子逻辑，无战斗结算（⑦）、无 AI（⑧）、无资源经济（⑥）。world.step 仅应用 MOVE 占位移动，真实移动/碰撞/战斗 defer E5/E6。✅
- world.ts 自 dungeon-server 迁移至 sim-core，**未引入任何下游运行时耦合**（见 §3）。✅
- **结论：E4 未越界，范围与 sprint-1.md / epics.md E4 一致。**

---

## 2. GDD 契约一致性表（E4 实现 vs ux-spec §0/§3、types.ts）

| 契约点 | 基线出处 | E4 实现 | 结果 |
|---|---|---|---|
| 输入映射动作语义 | ux-spec §3：`InputCmd{seq,tick,action,dir,target?,param?}`，action∈{MOVE/ATTACK/DODGE/SKILL/SIGNAL}，每 tick 上报 | `types.ts` InputCmd 形状完全匹配；`InputAction{MOVE/ATTACK/DODGE/SKILL/SIGNAL}`；`world.step` 应用 MOVE（其余动作 defer E5/E6/E10） | ✅ 一致 |
| lastProcessedSeq ↔ §0 100ms 插值所需对账数据 | ux-spec §0：插值 100ms（≈3 快照）+ 预测缓冲 ~6 条；§3：预测缓冲 `ceil(RTT/2/TICK_MS)+2`(RTT250→~6) | `WorldSnapshot.lastProcessedSeq[seatId]` 告知客户端已消费 seq → 客户端保留未确认指令并重演；tick 同步 | ✅ 一致（渲染 defer Godot） |
| seq 单调 ↔ C11 反作弊基线 | C11：InputCmd seq 防重放；types.ts `seq` 注释"防重放（C11）" | `input.ts` `seq <= lastSeq → 拒绝`（严格单调）；gateway 预校验 seq 为 number | ✅ 一致 |
| world 迁移 sim-core 是否破坏 D9 确定性 | D9 / GOLDEN_LAYOUT_HASH 已锁 | world.ts 仍调 `generateLayout(opts.seed, opts.biomeId)`（同 E1，未改种子派生）；敌人抖动 Rng 派生 `${seed}:${biomeId}:enemies` 不变；无 Math.random/Date | ✅ 不破坏（golden 有效） |
| 输入每 tick 上报 ↔ §3 | ux-spec §3：渲染帧采集、每 tick(30Hz) 上报 | 服务端 `world.step` 每 tick `drainForTick` 收集各玩家最新有效输入（同 tick 多包只留最新） | ✅ 一致（客户端上报节奏属 Godot） |
| 房间人数 1–4（solo/min=1） | ux-spec §0 / config minPlayers=1,maxSeats=4 | routeInput 按 seat 解析 playerId；createWorld 按 opts.players 注册队列（solo=1 队列） | ✅ 无冲突 |

---

## 3. 纪律 A / B 检查

**纪律 A（⑤ 只产 SpawnPoint[] / ⑧ 只读；consumer 只读语义）**
- `world.ts`：仍调用 `generateLayout`（⑤）并**只读** `layout.spawnPoints` 实例化敌人；不反向修改布局、不调用 ⑤ 运行时生成函数（除一次性编排调用 generateLayout，属 ① 职责）。✅
- 敌人 jitter 用独立确定性 Rng（seed:biome:enemies），与布局流隔离，不动 ⑤ 输出。✅

**纪律 B（⑧ 仅 import type，绝不 import combat/dungeon-gen 运行时；consumer 不改 diff 格式）**
- `input.ts`：`import type { InputCmd } from "./types.ts"` — **仅类型引用**，无 combat(⑦)/enemy-ai(⑧)/dungeon-gen 运行时 import。✅
- `world.ts`：imports 仅 `types` / `dungeon-gen(generateLayout+LayoutSnapshot类型)` / `rng` / `input`。**无 ⑦ combat / ⑧ enemy-ai 运行时 import**；world.step 仅应用 MOVE（占位），无战斗结算。✅
- `gateway.ts` / `run-manager.ts`：input 摄取路径仅穿 `InputCmd` 类型与 `world.enqueueInput`，未引入 ⑦⑧ 耦合。✅
- **diff 格式守约**：WorldSnapshot 既有字段（tick/runId/roomPhase/entities）未改，仅追加 `lastProcessedSeq?` 可选字段（向后兼容，不破坏消费者）——符合"consumer 不改 diff 格式"。✅

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| world 迁移 sim-core 后 golden 仍有效 | world.ts 调用 `generateLayout(opts.seed, opts.biomeId)` 与 E1 完全一致；generateLayout 内部种子派生未变 → 同 seed+biome 必产同 LayoutSnapshot | ✅ GOLDEN_LAYOUT_HASH 不受影响 |
| world.step 同输入序列→同世界状态 | `PerPlayerInputQueue` 按 seq 确定性拒/收；`world.step` 给定接受后的每玩家输入序列 + 敌人占位 AI（朝最近存活玩家，确定性）→ 状态确定演化；无网络时序依赖 | ✅（sim-core 25/25 佐证） |
| 无新增隐藏随机源 | input.ts / world.ts 均无 `Math.random`/`Date.now`/全局可变随机态；敌人 jitter Rng 实例局部、seed 派生 | ✅ |
| 确定性跨端对齐 | input/world 归 sim-core（与 rng/dungeon-gen 同仓），纯逻辑无运行时依赖，便于 GDScript 端口复刻 | ✅ |

> world 迁移至 sim-core 未触碰 generateLayout 或任何 RNG 种子派生，D9 契约零回归。

---

## 5. 可访问性

**per-player 路由 vs ux-spec §7 断线 / RESIDENT 流程**
- 路由键稳定：PerPlayerInputQueue 以 `playerId(=seatId=实体 ownerId)` 为键；断线宽限（disconnectGraceMs=30s）内 world 不销毁 → 同一 playerId 队列（含 lastSeq）跨断线持久。重连经 `validateReconnect` 保 seatIndex 不变 → 新连接路由回同一队列。✅
- 重连对账数据：getSnapshot 返回的 WorldSnapshot 含 `lastProcessedSeq[seatId]`，客户端据此校准已消费 seq，支撑"重连还原无跳变"（与 e1-e3 O3 / E7 D8 衔接）。✅
- RESIDENT：公共房玩家同样有 seatIndex(playerId)，每玩家队列机制无差异；RESIDENT 仅房间类型差异，不干扰输入路由。✅
- **缺口（O1）**：seq 跨重连连续性依赖客户端**延续**断线前 seq（不得归零），否则 `seq <= lastSeq` 会拒所有输入直至爬回。服务端机制已支持（稳定键 + 宽限保活），但**缺客户端契约显式约定**，Godot 客户端接入前须写明"seq 跨重连不重置"。
- DANGER 豁免：E4 不触碰 telegraph/配色，豁免不涉及。✅

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E4 每玩家输入路由隔离（C6）、seq 防重放服务端基线（C11）、reconciliation 对账钩子（S4.3）+ 延迟指示数据（S4.5）均就位；world 迁移 sim-core 不破 D9；纪律 A/B 守约。可放行进入 E5/E6/E7 后续切片，无需返工。

### 6.2 非阻塞观察（CONCERNS 类，不 gate E4，供下游 epic 跟踪）
- **O1 · 重连后 seq 连续性契约需显式约定（C11 跨断线）**：PerPlayerInputQueue.lastSeq 以 playerId 为键且在 30s 宽限内持久，重连后 client 须**延续**断线前 seq（不得归零），否则被 `seq <= lastSeq` 全拒。服务端机制已正确，但缺客户端契约约定；getSnapshot 已带回 lastProcessedSeq 可辅助校准。建议 E4/E7 协作在协议/UX 层写明"seq 跨重连不重置"，Godot 客户端接入前闭环，避免重连输入软锁。非阻塞（headless 不触发重连输入路径）。
- **O2 · 占位移动速率与 CLASS_BASE.moveSpeed 脱节（E5 接管）**：world.ts `MOVE_SPEED_PX=2` 为占位（全职业同速），未用 `CLASS_BASE[p.classId].moveSpeed`（140/185/165/170）。注释已声明"真实数值在 E5 由 CLASS_BASE.moveSpeed 驱动"。Sprint 1 占位可接受（验证 30Hz 循环+路由）；E5 接入移动/碰撞须替换为 CLASS_BASE 驱动并按 `moveSpeed/30` 归一化到 tick。非阻塞。
- **O3 · S4.2/S4.4 客户端预测/插值未做（headless 预期）**：本地预测与 100ms 插值均属 Godot 客户端，本 Sprint headless 未实现（R2）。服务端已提供对账数据钩子（lastProcessedSeq + tick + 30Hz 广播），客户端接入时据此实现预测回正 + 插值。ux-spec §0/§3「跟手/无瞬移」体验依赖此层。非阻塞（R2 已知延后），但"好玩吗"验证门前须补完。
- **O4 · R1 二进制通道仍未替换（数据面 JSON→Buffer 占位）**：gateway 入站 input.cmd 为 JSON，world 快照广播 JSON→Buffer 占位。真正 state-diff 二进制 delta 推迟（R1，与 e1-e3 O2 同源）。Sprint 1（sim-core 25/25 / dungeon-server 27/27）可接受；生产前须替换以满足 sprint-1 DoD 的 30Hz×4 perf（带宽<16KB/s）。非阻塞。
- **O5 · E13（C9/C1）GDD 回填待做 → E4 已实现常量需对齐**：④ 的 TICK_RATE / InputCmd schema / 预测缓冲公式、⑦⑧ 不等式等已在代码锁定（run-runtime TICK_RATE=30、types.ts InputCmd seq 防重放、world.ts 30Hz step 驱动），但 GDD 文档侧回填（E13/C9/C1）尚未完成。建议 E13 以代码为权威源反向同步 GDD（④ §3/§4/§6/§7 引用 ADR-NET-01 与 InputCmd schema；D6 输入上报节奏对齐），与 E2/E1-E3 评审结论一致。非阻塞。

### 6.3 阻塞项：**无**

---

## 7. Handoff
- 本稿可随 quality-lead 的 QA 计划一并汇编落盘为 `production/design-review-e4.md`。
- E4 验收建议放行；O1–O5 记入下游 epic（E5/E6/E7 + E13 + Godot 客户端接入）待办，不阻断 Sprint 1 推进。
- 下一步（按 sprint-1 顺序）：E2✅ E1✅ E3✅ E4✅ → E5（闭环 C11 完整 + O2 移动接管）→ E6（⑧ 实现时复核纪律 B）→ E7（闭环 C10/D8 + O1 重连 seq 契约）→ E13（C9/C1 回填，对齐 O5）。
- 跨队友提示：O1（重连 seq 契约）涉及 E1 重连握手 + E4 输入队列 + E7 D8 + Godot 客户端，建议主理人协调 engineering-lead（客户端）与本人（GDD 回填）对齐；O4（R1 二进制）归 engineering-lead；可访问性维度（§5）与 art-bible §3 DANGER 豁免无交集，无需改动 art-director 文档。

（文策渊 · design-strategist · E4 设计评审，主理人汇编落盘）
