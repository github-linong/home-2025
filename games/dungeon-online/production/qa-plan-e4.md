# E4 输入与客户端预测（服务端）· QA 计划
路径：production/qa-plan-e4.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Sprint 1）
对齐：test-framework.md 四层 + control-checklist C6/C11；epics E4(S4.1/S4.3/S4.5)；系统①（WorldSnapshot）
运行环境：Node 22.6+（已用 v22.22.2 验证）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）
约束：本文件仅评审与文档产出，不修改任何 src/test 文件。

## 1. E4 测试策略（四层映射，仅列 E4 相关内容）
E4 本 Sprint 服务端范围 = S4.1（InputCmd 每 tick 上报 + 每玩家路由）/ S4.3（reconciliation 钩子 lastProcessedSeq）/ S4.5（服务端延迟数据路径）。S4.2 本地预测、S4.4 100ms 插值属 Godot 客户端，本 Sprint headless 校验（defer）。

### 1.1 sim-core 单测（unit）
- 每玩家输入队列（input.ts / C6 纪律B / C11）：PerPlayerInputQueue 按 playerId 索引；enqueue 入队即校验 seq 严格单调（重复/回放/倒序拒、前向跳变允许）；drainForTick 取各玩家最新有效输入、清空 pending 防跨 tick 重复生效。状态：input.test.ts 6 项绿。
- world 路由（world.ts / 系统①）：world.step 先 drainForTick 收集各玩家输入 → 仅 MOVE 按 ownerId 路由应用到对应实体；A 输入不移动 B；C11 回放在 world 层被拒（lastProcessedSeq 不前进）。状态：input.test.ts 含 world 用例，随 sim-core 全量跑。
- schema 不变量（types.test.ts）：WorldSnapshot 携带可选 lastProcessedSeq（S4.3/S4.5）。状态：types.test.ts 7 项绿（E4 +1 新增）。

### 1.2 确定性 golden（golden，对应 D9）
- 布局 golden（GOLDEN_LAYOUT_HASH）不受影响：dungeon-gen 未改，determinism.test.ts 绿。
- **world.ts 迁移未破 D9（已独立校验）**：createWorld 同 seed+biome+players + 同输入序列 → 两次运行 WorldSnapshot.entities 字节级相等（确定性占位移动/敌人逼近均确定）。
- GOLDEN_WORLD_HASH 仍 "PENDING_E5"（战斗管线未接，属 E5）。

### 1.3 集成 / 端到端（integration，对应 C6/C11/S4.3）
- E4 端到端（tests/input-routing.test.ts，真实 ws + headless 客户端）：客户端发 InputCmd(seq) → 服务端 world 按 playerId 应用移动 → 快照含位置变化 + lastProcessedSeq 回显；seq 回放/倒序包被 C11 拒（lastProcessedSeq 维持不前进）。状态：1 项绿。
- 既有 E1 端到端（integration.test.ts）仍绿，确认 world.ts 迁移未破坏 30Hz 广播闭环。

### 1.4 性能 / 反作弊（perf / security）
- C5 广播：world.step → snapshot → 数据面 Buffer 广播，沿用 E1 通路（JSON→Buffer 占位，R1）。
- C11 完整反作弊（命中权威校验 / 拒伪造伤害请求）：**不在本 Epic**（属 E5.S5.7）。本 Sprint C11 仅落「服务端 ingest 层 seq 防重放」。
- R1 二进制 state-diff：**defer**，数据面仍为 JSON→Buffer 占位。

## 2. E4 ↔ 验收条件矩阵
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| C6 | 每玩家输入路由隔离（consumer 不改 diff 格式，纪律B） | input.test.ts(world per-player routes: A 不移动 B) + input-routing.test.ts(B 不被 A 输入移动) | ✅ 已覆盖 |
| C11 基线 | seq 防重放（服务端 ingest 层强制严格单调） | input.test.ts(C11 seq monotonic: 重复/回放/倒序拒、前向跳变允许) + input-routing.test.ts(seq=3 倒序被拒, lastProcessedSeq 维持 5) | ✅ 已覆盖（部分：完整命中权威校验 defer E5） |
| D9 | 确定性 golden 不受影响（world.ts 迁移） | determinism.test.ts(布局 golden) + 独立 D9 校验(world 同 seed+inputs→同态) | ✅ 已覆盖（已独立校验） |
| 系统① | WorldSnapshot +lastProcessedSeq 对账钩子 | types.test.ts(字段) + input.test.ts/world(回显) + input-routing.test.ts(回显) | ✅ 已覆盖 |
| S4.3 | 服务端 reconciliation 钩子（lastProcessedSeq 随快照下发） | 同上（lastProcessedSeq 随 snapshot 下发，供客户端回正） | ✅ 已覆盖 |
| S4.5 | 延迟指示数据落地 | gateway.ts(session.ping/pong + pongTimeout 5s/1s + 断线 markDisconnected) | ⚠️ 部分：服务端延迟/断线数据路径在；HUD 渲染属 Godot 客户端（defer） |
| —— | **明确 defer（越界，非缺陷）** | —— | —— |
| C11 完整 | 命中权威校验 / 拒伪造伤害请求 | 属 E5.S5.7 | ⏸ defer E5 |
| R1 | 二进制 state-diff 通道 | 仍为 JSON→Buffer 占位 | ⏸ defer |
| S4.2 / S4.4 | 本地预测 / 100ms 插值渲染 | 属 Godot 客户端，本 Sprint headless 校验 | ⏸ defer Godot |

## 3. 现有测试所有权矩阵（unit vs integration）
| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| packages/sim-core/tests/unit/rng.test.ts | unit | E2(S2.4) | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/types.test.ts | unit | E2(S2.1–S2.3)/S4.3 | 7 | ✅ 绿（E4 +1） |
| packages/sim-core/tests/unit/input.test.ts | unit | E4(S4.1/S4.3)/C6/C11 | 6 | ✅ 绿（E4 新增） |
| packages/sim-core/tests/golden/determinism.test.ts | golden | E3(S3.4)/D9 | 5 | ✅ 绿 |
| apps/dungeon-server/tests/room-service.test.ts | unit | E1(S1.1/S1.5/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/connection-registry.test.ts | unit | E1(S1.2) | 6 | ✅ 绿 |
| apps/dungeon-server/tests/run-runtime.test.ts | unit | E1(S1.3) | 3 | ✅ 绿 |
| apps/dungeon-server/tests/protocol.test.ts | unit | E1(S1.2/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/integration.test.ts | integration | E1(S1.3 端到端) | 1 | ✅ 绿 |
| apps/dungeon-server/tests/input-routing.test.ts | integration | E4(S4.1/S4.3)/C11 | 1 | ✅ 绿（E4 新增） |
| 合计 | — | — | 52 | ✅ 25(sim-core)+27(dungeon-server) 全绿 |

C-A/C-B 状态栏（沿用 qa-plan-e2/e1-e3 口径）：
- C-A（类型检查门）：sim-core 与 dungeon-server 跨包 import（gateway/run-manager/run-runtime 引 sim-core）仅靠 `--experimental-strip-types` 跑通，不类型检查。tsc script 已配（E2），devDep 待装；跑通前类型错误不阻断 CI。状态：⚠️ 仍待装包接门。
- C-B（schema 不变量单测）：WorldSnapshot.lastProcessedSeq 不变量在 types.test.ts 覆盖（E4）。状态：✅ 关闭。

## 4. E4 质量门判定
- 判定：**PASS（带 5 项非阻塞 CONCERNS，其中 3 项属设计性 defer）**。
- 阻塞项：**无**。E4 服务端实现与测试自洽，25/25 + 27/27 绿（已实跑确认）；D9 确定性经 world.ts 迁移后独立校验通过。
- CONCERNS（非阻塞）：
  1. **C11 完整反作弊 defer E5（设计性）**：本 Sprint C11 仅落服务端 ingest 层 seq 防重放；命中权威校验 / 拒伪造伤害请求属 E5.S5.7。进「好玩吗」门前 E5 必须补齐，否则客户端仍可为「真相源」风险。
  2. **R1 二进制 state-diff defer（设计性，E1 遗留）**：数据面仍为 JSON→Buffer 占位，30Hz×4 带宽/p95 预算未验证。
  3. **S4.2/S4.4 客户端预测/插值 defer Godot（设计性）**：服务端 reconciliation 钩子（lastProcessedSeq）已就绪，但客户端本地预测回正 + 100ms 插值未在本 Sprint 校验（headless）。
  4. **S4.5 HUD 延迟渲染 defer Godot（部分）**：服务端 ping/断线数据路径在；HUD 呈现属 Godot 客户端。
  5. **C-A 类型门仍待装包**：跨包类型错误不阻断 CI（E2 遗留）。
- 放行建议：E4 服务端可放行进入 E5/E6/E7；C11 完整需在 E5 落地，R1/S4.2/S4.4/S4.5-HUD 需在 Godot 客户端接入阶段补齐。

## 5. 后续 Sprint 衔接 TODO
- E5：补 C11 完整（命中权威校验 + 拒伪造伤害请求，S5.7）+ GOLDEN_WORLD_HASH（同 seed+输入序列→同世界哈希）。
- E6：敌人 AI 真实 telegraph/伤害请求（纪律B，经 ⑦ 提交）。
- E7：D8 托管 + C10 深度「不跳变含 DOWNED 剩余窗口」（protocol.ts 已 defer）。
- Godot 客户端接入：R1 二进制 diff + S4.2/S4.4 预测插值 + S4.5 HUD 延迟指示。
- 全程：GDScript 端口对齐 RNG 锚点 + GOLDEN_LAYOUT_HASH + world 确定性（C7/D9 跨语言）。
