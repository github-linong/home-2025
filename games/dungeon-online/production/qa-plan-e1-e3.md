# E1/E3 联机房 + 地牢生成 · QA 计划
路径：production/qa-plan-e1-e3.md ｜ 作者：严守真（quality-lead）｜ 状态：已落盘（Sprint 1）
对齐：test-framework.md 四层 + control-checklist C1/C2/C4/C5/C10；epics E1(S1.1–S1.7) / E3(S3.1–S3.3)
运行环境：Node 22.6+（已用 v22.22.2 验证）｜ 依赖：ws（apps/dungeon-server/node_modules 已装）
约束：本文件仅评审与文档产出，不修改任何 src/test 文件。

## 1. E1/E3 测试策略（四层映射，仅列 E1/E3 相关内容）
E1 = 联机房 + 30Hz run-runtime（S1.1–S1.7）；E3 = 地牢生成接入 RNG（S3.1–S3.3），确定性 golden 已锁。

### 1.1 sim-core 单测（unit）
- rng 确定性（E2 延续，C7）：splitmix64 / xoshiro256+ / Rng 同 seed 同序列；golden 锚点 seed=0 首值（见 qa-plan-e2 §1.1）。状态：随 sim-core 全量跑。
- dungeon-gen 确定性（E3，C7/D9）：同 seed+biome → 同 LayoutSnapshot（见 §1.2）。状态：随 sim-core 全量跑。

### 1.2 确定性 golden（golden，对应 D9 / E3.S3.4）
- 锚点：GOLDEN_LAYOUT_HASH="bf4893ba35b9e85bfd1ec6e8542480e97be8bd87f7bbbebf4a01b4335bf296c4"
  （sha256(JSON LayoutSnapshot)，seed="EMBER-S1" biome=0）。
- **已用独立脚本重算校验通过（非循环自证）**：derived hash == GOLDEN，且两次生成字节级相等。
- 本 Epic 仅锁布局 golden；GOLDEN_WORLD_HASH 仍 "PENDING_E5"（战斗管线未接，属 E5）。
- GDScript 端口须产出相同 GOLDEN_LAYOUT_HASH 以跨语言对齐（C7）。

### 1.3 集成 / 端到端（integration，对应 C1/C4/C5/C10 部分）
- E1 端到端（tests/integration.test.ts，真实 ws + headless 客户端，R2）：鉴权握手 → room.create → room.join → game.start → 收到 30Hz 数据面 WorldSnapshot。状态：1 项绿。
- 重连握手（protocol.test.ts session.reconnect）：合法 token 重入并拉全量快照；非法 token 拒绝（RECONNECT_EXPIRED）。状态：覆盖。
- 连接登记 / 双平面广播（connection-registry.test.ts）：重复连接踢旧、房间广播、定点发送、kick、数据面 Buffer。状态：覆盖。
- 房间服务（room-service.test.ts）：6 位码唯一可解析 / 邀请 token / co-host 迁移 / RESIDENT 单例排除 GC / 重连 token / markDisconnected。状态：覆盖。

### 1.4 性能 / 反作弊（perf / security）
- C5 perf（30Hz×4 二进制 diff 预算）：**未做**。R1 风险已落实——数据面为 JSON→Buffer 占位，二进制 delta deferred；p95/bandwidth 未压测。
- C11 反作弊（seq 防重放 / 拒伪造）：InputCmd.seq schema 不变量已在 E2 单测（types.test.ts）；E1 层服务端 seq 校验**不在本 Epic 范围**（属 E5.S5.7）。

## 2. E1/E3 ↔ 验收条件矩阵
| 门禁 | 验收条件 | 覆盖测试 | 状态 |
|---|---|---|---|
| C1 | TICK_RATE 全局唯一=30Hz（S1.7）+ 房间创建/6位码/好友房 | run-runtime.test.ts(TICK_RATE=30,TICK_MS≈33.33) + room-service.test.ts(6位码唯一可解析) + protocol/integration(room.create/join) | ✅ 已覆盖 |
| C1(续) | GDD 三处初值改引用 ADR-NET-01 | run-runtime 引用 TICK_RATE 常量（未裸写 33.3），TICK_MS=1000/30 | ✅ 已覆盖（常量层） |
| C2 | pongTimeoutMs=5000 / pingIntervalMs=1000 显式覆盖（S1.4） | config.ts 已设值；**无测试断言该覆盖**（poker 默认 45s/15s 不适用） | ⚠️ 配置正确，缺回归测试（CONCERN C2） |
| C4 | D11 RESIDENT：单例 + sweep 排除 + 重连保身份 | room-service.test.ts(RESIDENT 单例/排除 sweep) + protocol/connection-registry(重连 token 校验/重复连接踢旧) | ✅ 已覆盖（握手/身份层） |
| C5 | 30Hz 广播（S1.3） | run-runtime.test.ts(真实 30Hz 循环+每 tick 广播) + integration.test.ts(收到 30Hz 数据面帧) + connection-registry.test.ts(Buffer 广播) | ✅ 广播通；⚠️ 带宽/p95 预算未压测（R1） |
| C10 | 重连无跳变（S1.6 握手 + S7.7 深度还原） | protocol.test.ts(session.reconnect 合法/非法 + 拉全量快照)；integration 无重连用例 | ⚠️ 部分：S1.6 握手已覆盖；深度「不跳变含 DOWNED 剩余窗口」(PersonalState 分离还原) 代码注释显式 defer 到 E7（C10 部分），**本 Epic 未测也未实现** |
| D9 | 确定性：同种子同布局（E3.S3.4） | determinism.test.ts(同 seed+biome 同 hash + golden 锚点 + 异 seed/biome 分歧 + SpawnPoint 契约) | ✅ 已覆盖（golden 已独立校验） |
| 系统⑤ S3.2 | SpawnPoint[] 只读实例契约（纪律 A） | determinism.test.ts(SpawnPoint 结构 + 引用合法 enemy 原型) | ✅ 已覆盖 |

## 3. 现有测试所有权矩阵（unit vs integration）
| 测试文件 | 层 | 归属 Epic | 项数 | 状态 |
|---|---|---|---|---|
| packages/sim-core/tests/unit/rng.test.ts | unit | E2(S2.4) | 7 | ✅ 绿 |
| packages/sim-core/tests/unit/types.test.ts | unit | E2(S2.1–S2.3) | 6 | ✅ 绿（C-B 关闭） |
| packages/sim-core/tests/golden/determinism.test.ts | golden | E3(S3.4) | 5 | ✅ 绿（含 golden 锚点） |
| apps/dungeon-server/tests/room-service.test.ts | unit | E1(S1.1/S1.5/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/connection-registry.test.ts | unit | E1(S1.2) | 6 | ✅ 绿 |
| apps/dungeon-server/tests/run-runtime.test.ts | unit | E1(S1.3) | 3 | ✅ 绿 |
| apps/dungeon-server/tests/protocol.test.ts | unit | E1(S1.2/S1.6) | 8 | ✅ 绿 |
| apps/dungeon-server/tests/integration.test.ts | integration | E1(S1.3 端到端) | 1 | ✅ 绿 |
| 合计 | — | — | 44 | ✅ 26(dungeon-server)+18(sim-core) 全绿 |

C-A/C-B 状态栏（沿用 qa-plan-e2 口径）：
- C-A（类型检查门）：dungeon-server 与 sim-core 跨包 import（protocol/run-runtime 引 sim-core/types）仅靠 `--experimental-strip-types` 跑通，**不类型检查**。tsc script 已配（E2），devDep 待装；跑通前类型错误不阻断 CI。状态：⚠️ 仍待装包接门。
- C-B（schema 不变量单测）：E2 已建 types.test.ts 关闭；E3 SpawnPoint 契约在 determinism.test.ts 覆盖。状态：✅ 关闭。

## 4. E1/E3 质量门判定
- 判定：**PASS（带 4 项非阻塞 CONCERNS）**。
- 阻塞项：**无**。E1/E3 实现与测试自洽，26/26 + 18/18 绿（已实跑确认）；E3 golden 锚点独立校验通过。
- CONCERNS（非阻塞，建议本 Sprint 内补）：
  1. **C2 缺回归测试**：pongTimeoutMs/pingIntervalMs 覆盖正确但无断言，易静默回退到 poker 45s/15s。建议补 config.test.ts 断言两值=5000/1000。
  2. **C5 perf 未压测（R1 已落实）**：数据面为 JSON→Buffer 占位，二进制 delta 未做；30Hz×4 带宽/p95 预算未验证。建议 E1.S1.2 内或 perf 层补 state-diff 压测（门槛 p95<2ms@40 实体、带宽<16KB/s）。
  3. **C10 深度「不跳变」未覆盖（设计性 defer 到 E7）**：仅 S1.6 握手有测；PersonalState 分离还原 + DOWNED 剩余窗口属 E7.S7.7，本 Epic 未实现未测（protocol.ts 注释显式 defer）。放行建议：E1/E3 PASS；但「好玩吗」人工验证门前必须 E7 补齐 C10 深度用例。
  4. **C-A 类型门仍待装包**：跨包类型错误不阻断 CI。
- 放行建议：E1/E3 可放行进入 E4/E5/E6/E7；C2 测试与 C5 perf 建议在合 CI / 进「好玩吗」门前补齐。

## 5. 后续 Sprint 衔接 TODO
- E5：补 GOLDEN_WORLD_HASH（同 seed+输入序列→同世界哈希）；接 C11 服务端 seq 校验 / 拒伪造伤害。
- E7：实现 D8 托管（PersonalState 冻结/还原三者同发）+ C10 深度「不跳变含 DOWNED 剩余窗口」集成测试（当前 protocol.ts 注释显式 defer）。
- R1 关闭：数据面二进制 diff 落地 + C5 perf 压测门。
- 全程：GDScript 端口对齐 RNG 锚点 + GOLDEN_LAYOUT_HASH（C7 跨语言）。
