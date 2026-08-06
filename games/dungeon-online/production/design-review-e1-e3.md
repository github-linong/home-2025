# E1/E3 设计评审 + 范围核查（P5-S1-DES-2）

- **路径**：`production/design-review-e1-e3.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审 + 范围核查（只读不改码）
- **汇编落盘**：主理人（游承峰）　**状态**：已落盘（Sprint 1）
- **评审对象**：
  - E1：`apps/dungeon-server/src/{room-service,run-runtime,gateway,protocol,auth,world,config,run-manager}.ts`
  - E3：`packages/sim-core/src/dungeon-gen.ts` + `rng.ts`（确定性）
  - 验证锚：`packages/sim-core/tests/golden/determinism.test.ts`
- **基线**：`design/ux/ux-spec.md` §0、`art/art-bible.md` §0/§3、`packages/sim-core/src/types.ts`、`production/design-review-e2.md`（格式参照）

---

## 0. 判定摘要

- **判定：PASS**（含 5 条非阻塞观察 / CONCERNS 类，无一项 gate E1/E3 验收）
- **阻塞项：无**
- **E1 范围**：C1（TICK_RATE 引用）✅ / C2（心跳 5s/1s）✅ / C4（RESIDENT 单进程单例）✅ / C5（双平面结构就位，紧凑二进制 diff 占位 R1 TODO）⚠结构性达标 / C10（重连握手+全量快照✅，D8 无跳变还原 defer E7）
- **E3 范围**：系统⑤（只产 SpawnPoint[] 数据，不写敌人逻辑）✅ / D9（确定性 golden 已锁）✅
- **契约一致性**：E1/E3 已实现常量 vs ux-spec §0 / art-bible §0/§3 / types.ts 全绿（含 30Hz、TICK_MS、5s/1s、1–4人、RESIDENT、阵营色、telegraph≥18tick、DANGER 豁免）
- **纪律 A/B**：A 满足（⑤ 只产数据/引 ③ ID）；B 因 ⑧ 未实现，标注 E6 复核（无回归）
- **RNG(D9)**：dungeon-gen 与 world 均消费确定性 Rng（独立派生流），无 Math.random/Date；golden 锚点已锁定且有回归测试
- **可访问性**：E1 断线/RESIDENT 流程对齐 ux-spec §7（P4 D8 流水线就位，计时还原 defer E7）；E3 产出为纯布局，不触碰 DANGER 8% 预算，豁免无冲突

---

## 1. 范围检查

### 1.1 E1 范围核查（C1/C2/C4/C5/C10 意图对照）

| 控制项 | 意图 | E1 落点 | 结论 |
|---|---|---|---|
| **C1** TICK_RATE 引用（禁裸 33.3） | 全工程单源 30Hz，禁止散落初值 | `run-runtime.ts`：`TICK_RATE=30`、`TICK_MS=1000/TICK_RATE`；全部 tick 数学派生 | ✅ 全覆盖 |
| **C2** 心跳 5s/1s | 实时战斗不掉线误判（poker 45s/15s 不适用） | `config.ts`：`pongTimeoutMs=5000`/`pingIntervalMs=1000`；`gateway.ts` 消费 | ✅ 全覆盖 |
| **C4** RESIDENT 常驻单例 | 进程级公共房，无码任意加入，sweep 排除 | `room-service.ts` `RESIDENT_ROOM_ID` + `ensureResidentRoom` 单例 + sweep 排除 resident | ✅ 单进程达标（多实例 sticky TODO，见 O5） |
| **C5** 双平面 / 二进制 diff | 控制面 JSON + 数据面紧凑二进制 delta | 双平面结构已就位（`binary:boolean` 标志 + `connection-registry`）；`gateway.ts` 注：真正 state-diff 二进制 delta 为 R1 TODO（当前 JSON→Buffer 占位） | ⚠ 结构达标，紧凑 diff defer（O2） |
| **C10** 重连无跳变（D8） | 重连还原至掉线瞬间原状态（含 DOWNED 剩余窗口/救援冻结） | `protocol.ts` `session.reconnect`：validateReconnect token + 全量 WorldSnapshot 数据面拉取（S1.6 就位）；**D8 PersonalState 抓拍 + 计时暂停 defer E7**（注释明示） | ⚠ 握手+快照✅，无跳变还原 defer E7（O3） |

> 补充发现（见 O1）：`room-service.transferOwner` 仅手工触发（room.transferOwner 消息），`markDisconnected` 未自动迁移房主——**co-host 自动迁移（P4 契约）尚未接线**，建议 E7 补齐。

### 1.2 E3 范围核查（系统⑤ + D9）

| Epic 子项 | 预期交付 | 实际落点 | 结论 |
|---|---|---|---|
| 系统⑤（地牢生成） | 只定义 SpawnPoint[]，不写敌人逻辑（纪律 A 第一条） | `dungeon-gen.ts`：产出 `LayoutSnapshot{seed,biomeId,spawnPoints,resourceNodes,floorSequence}`；**无敌人实体生成 / 无 AI**；仅 `import`（③ 数据原型）+ `import`（Rng） | ✅ 全覆盖 |
| D9（确定性） | 同 seed+biome → 同布局；无隐藏随机源 | `generateLayout` 用 `new Rng(hashString64(\`${seed}:${biomeId}\`))`；无 Date/Math.random/全局态；`determinism.test.ts` 锁 GOLDEN_LAYOUT_HASH 并回归 | ✅ 全覆盖 |

### 1.3 超范围检查
- E1 全部为联机/房间/传输/循环编排逻辑，无战斗/AI/资源结算运行时（战斗在 ⑦，AI 在 ⑧，E5/E6/E7 接入）。`world.ts` 明确标注"S1.3 骨架：确定性占位移动验证 30Hz 循环"，真实 AI/战斗 defer。✅
- E3 仅为确定性数据生成，无运行时副作用。✅
- **结论：E1/E3 均未越界实现下游系统运行时，无超范围。**

---

## 2. GDD 契约一致性表（E1/E3 实现常量 vs 上游基线）

| 常量 / 契约 | 基线出处 | E1/E3 实现 | 结果 |
|---|---|---|---|
| `TICK_RATE` = 30Hz（33.3ms/tick） | ux-spec §0 / ADR D2 | `run-runtime.ts` `TICK_RATE=30`、`TICK_MS=1000/30` | ✅ 一致 |
| RTT上限250 / K100 / 0.6s=18tick / 插值100ms | ux-spec §0 / ADR D3 | E1/E3 **未重定义**（属 ④⑦⑧ GDD，E13 回填）；run-runtime 无 RTT/INTERP 常量（正确归属 ④） | ✅ 无冲突（E13 待回填，见 O4） |
| 断线心跳超时 `PONG_TIMEOUT=5s`、PING `1s` | ux-spec §0 / ADR D1.6 | `config.ts` `pongTimeoutMs=5000`/`pingIntervalMs=1000` | ✅ 一致 |
| 房间人数 最小1（solo）/最大4 | ux-spec §0 / ①§4/§5 | `config.ts` `minPlayers=1`/`maxSeats=4`；`room.create` 自动 confirm seat0 | ✅ 一致 |
| 公共体验房 RESIDENT 进程级常驻 | ux-spec §0/§7 / ADR D11 | `room-service.ts` 单例 + sweep 排除 | ✅ 一致（单进程；多实例 sticky TODO） |
| 倒地数值（DOWNED15–20s/救援3s/自救5s） | ux-spec §0 / ⑪§4 | E1/E3 **未实现**（属 ⑪，E7 落地）；无重定义 | ✅ 无冲突（E7 待实现） |
| 阵营色 P1–P4（色盲安全） | art-bible §3 / types.ts | E1/E3 **未重定义**；`world.ts` 仅赋 `ownerId=seatId`，颜色映射归 ⑬ HUD | ✅ 无冲突（消费 types.ts 单一源） |
| telegraph 下限 18tick（杂兵21/精英24/Boss30） | ux-spec §0 / ADR D12 / types.ts | E3 输出 `enemyTypeId` 引用 ③ 原型表（telegraphTicks≥18 在 types.ts）；**未覆盖** | ✅ 一致（下限经原型表继承） |
| DANGER 豁免（telegraph 不计入 8% 配色预算） | art-bible §3 | E3 产出为纯布局（无 telegraph 色/形数据）；telegraph 由 ⑧ 运行时以 `DANGER_COLOR=0` 生成 → 豁免机制在 ⑧/HUD 层 | ✅ 无冲突（E3 不触碰 8% 预算） |

---

## 3. 纪律 A / B 检查

**纪律 A（⑤ 只产 SpawnPoint[] / 引 ③ ID；⑧ 只读不调生成函数）**
- `dungeon-gen.ts` 仅 `import { ENEMY_PROTOTYPES, RESOURCE_PROTOTYPES }`（③ 数据）与 `Rng/hashString64`；**不 import enemy-ai 运行时**，不生成敌人实体/AI。✅
- `spawnPoints[].enemyTypeId` 为字符串，引用 ③ 原型表 ID（非运行时实例）——与 types.ts `SpawnPoint.enemyTypeId` 注释一致。✅
- `determinism.test.ts` 结构校验：每个 SpawnPoint 的 `enemyTypeId` 必须 `in ENEMY_PROTOTYPES`（纪律 A 自动化守卫）。✅
- `world.ts`（① 编排层）消费 `generateLayout` 输出 read-only 迭代，不反向修改布局——符合"消费者只读"语义。✅

**纪律 B（⑧ 仅 import type，绝不 import combat/dungeon-gen 运行时）**
- ⑧（enemy-ai.ts）**尚未实现**（E6 阶段）。自 E2 评审至今，enemy-ai.ts 仍为 `import type { SpawnPoint }` 占位，无运行时耦合回归。✅
- **标注**：B 类纪律（⑧ 运行时只读 SpawnPoint[]、伤害经 ⑦）将在 E6 实现 ⑧ 时复核；本稿确认 E3 侧已为 ⑧ 预留干净的只读消费接口（SpawnPoint[] + ③ ID），无前置障碍。

---

## 4. RNG(D9) 核查

| 检查点 | 实现 | 结论 |
|---|---|---|
| 确定性种子派生 | `dungeon-gen.ts`：`new Rng(hashString64(\`${seed}:${biomeId}\`))`；biomeId 进入派生，保证 (seed,biome) 二元组决定整条流 | ✅ |
| 多流隔离（防耦合） | `world.ts` 敌人抖动用独立流 `hashString64(\`${seed}:${biomeId}:enemies\`)`；布局流与实体抖动流分离，互不影响 golden | ✅ |
| 无隐藏随机源 | `dungeon-gen.ts` / `world.ts createWorld` 均无 `Math.random`/`Date.now`/全局可变状态 | ✅ |
| seed 字符串接入 | `rng.ts` 新增 `hashString64`（FNV-1a 64），确定性、跨语言可复刻 | ✅ |
| golden 锚点锁定 + 回归 | `determinism.test.ts` 锁 `GOLDEN_LAYOUT_HASH`，断言恒定；同 seed+biome→同布局；异 seed/biome→异布局 | ✅ |
| 跨语言（GDScript）对齐 | test 头注 + `test-framework.md`：GDScript 端口须产出相同 GOLDEN_LAYOUT_HASH（C7 golden 门，QA 负责验证） | ✅（验证门归 QA/C7） |

> golden 已实测锁定（`bf4893ba35b9e85bfd1ec6e8542480e97be8bd87f7bbbebf4a01b4335bf296c4`），任何破坏确定性的改动都会令断言失败 → 强制 golden 对齐。**WORLD_HASH 仍 `PENDING_E5`**（world 占位 AI 未 golden 锁，符合 E5 计划）。

---

## 5. 可访问性

**E1 断线 / RESIDENT 流程 vs ux-spec §7（P4 D8 降级体验）**
- 心跳 5s 判线（`config.pongTimeoutMs=5000`）→ `markDisconnected` 置托管/冻结、保留 slot + 权威状态，与 ux-spec §7"进入托管/冻结（保留 slot + 权威状态）"一致。✅
- 断线宽限 `disconnectGraceMs=30000`（30s）提供重连窗口，与"托管期间角色状态由 ① 保留"一致。✅
- 重连握手：`validateReconnect`（token 校验）+ `getSnapshot` 全量 WorldSnapshot 数据面拉取，与"凭 room_id + 身份 token 重连 → 从权威快照恢复"一致。✅
- **缺口（O3）**：D8"重连还原至掉线瞬间原状态（含 DOWNED 剩余窗口/救援进度冻结）、不误判超时→OUT"的完整计时暂停逻辑 defer E7。E1 提供流水线，E7 必须闭环此契约，否则断线玩家会被误判 OUT。
- **缺口（O1）**：co-host 自动迁移（房主断线→管理权自动迁移）未接线，仅手动 `transferOwner`。
- RESIDENT：进程内单例 + keepalive（单进程达标）；多实例 sticky 路由 LB 侧 TODO（O5）。

**DANGER 豁免在 E3 产出里的落实**
- E3 产出 `LayoutSnapshot` 为纯几何/数据（spawnPoints/resourceNodes/floorSequence），**不含任何 telegraph 色块/形状数据**；telegraph 由 ⑧ 运行时依据 `DANGER_COLOR=0`（types.ts）生成。
- 因此 E3 完全不触碰 art-bible §3 的"全局 8% 强提醒色预算"——DANGER 豁免机制在 ⑧/HUD 层生效，E3 与之无冲突。✅

---

## 6. 判定与遗留

### 6.1 判定：**PASS**
E1 联机房 + 30Hz 权威循环、E3 确定性地牢生成，范围完整、与上游 GDD/ux-spec/art-bible/types.ts 契约零冲突、纪律 A 正确、D9 golden 已锁。可放行进入 E4/E5/E6/E7 后续切片，无需返工。

### 6.2 非阻塞观察（CONCERNS 类，不 gate E1/E3，供下游 epic 跟踪）
- **O1 · co-host 自动迁移未接线（P4 契约缺口）**：`room-service.transferOwner` 仅手工触发；`markDisconnected` 未自动迁移房主。ux-spec §1/§7 要求"房主掉线→管理权自动迁移至 co-host/顺位队员，房间不关"。当前房主断线房间不销毁（30s 宽限保留），但管理权需手动转移。建议 E7 或后续 epic 在 `markDisconnected`（owner 掉线时）自动调用 `transferOwner` 至下一顺位 seated 玩家。非阻塞（手动转移可用）。
- **O2 · C5 紧凑二进制 diff 为占位（R1 TODO）**：双平面结构（控制 JSON / 数据 Buffer）已就位，但数据面当前 JSON→Buffer 占位，真正 state-diff 二进制 delta 推迟。Sprint 1 垂直切片（26/26 测试通过）可接受；生产前须替换以避免带宽/延迟放大。建议 E1 后续或 E5 接入前完成 R1。
- **O3 · C10 / D8 无跳变还原延至 E7**：E1 完成重连握手 + 全量 WorldSnapshot 拉取（S1.6），但 D8 PersonalState 抓拍 + DOWNED/救援计时暂停逻辑在 E7。ux-spec §7 完整保底契约依赖 E7。非阻塞（E1 流水线正确），但 E7 必须闭环，否则断线玩家误判 OUT。
- **O4 · E13（C9/C1）GDD 回填待做 → E1/E3 已实现常量需对齐**：④⑦⑧ 的 TICK_RATE / P3 不等式（RTT250/K100/0.6s=18tick）/ RESIDENT 等已在代码锁定，但 GDD 文档侧回填（E13/C9/C1）尚未完成。建议 E13 以代码为权威源反向同步 GDD（① §4 / ④§4 / ⑦§4 / ⑧§4 引用 ADR-NET-01，与 E2 评审结论一致）。
- **O5 · 多实例 RESIDENT sticky 路由为 TODO（C4 单进程达标）**：`ensureResidentRoom` 为进程内单例（sweep 排除），单进程 Sprint 1 满足 RESIDENT 常驻。多实例部署下 sticky 路由由前置 LB 负责，代码侧未实现。单实例验证（26/26）不受影响；多实例上线前须补 LB sticky + 可能的跨实例状态同步。

### 6.3 阻塞项：**无**

---

## 7. Handoff
- 本稿随 quality-lead 的 QA 计划一并汇编落盘为 `production/design-review-e1-e3.md`。
- E1/E3 验收建议放行；O1–O5 记入下游 epic（E5/E6/E7 + E13）待办，不阻断 Sprint 1 推进。
- 下一步（按 sprint-1 顺序）：E2✅ E1✅ E3✅ → E4 → E5 → E6（⑧ 实现时复核纪律 B）→ E7（闭环 C10/D8/O1/O3）→ E13（C9/C1 回填，对齐 O4）。
- 可访问性维度（§5）与 art-director 的 art-bible §3 DANGER 豁免结论一致，无需改动其文档。

（文策渊 · design-strategist · E1/E3 设计评审，主理人汇编落盘）
