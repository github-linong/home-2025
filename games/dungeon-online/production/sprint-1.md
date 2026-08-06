# Sprint 1 冲刺计划 · 核心循环垂直切片

> 状态：已批准（用户确认落盘）｜ Phase 4 汇编产物 ｜ 路径 `games/dungeon-online/production/sprint-1.md`
> 上游：Phase 3 PASS（架构 13/13 + 用户拍板 4 项 + 一致性闭环）｜ 三份预制作草稿：`design/ux/ux-spec.md`、`art/asset-spec.md`、`production/epics.md`、`production/test-framework.md`

## 0. 目标与非目标
- **目标**：用「核心循环垂直切片」端到端跑通 **探→战→拾→商→下→Boss→结算** 的最小可玩闭环，验证四大支柱（P1 协同 / P2 新谜题 / P3 可读紧张 / P4 断线即重连）在真实联机下是否成立、是否"好玩"。
- **非目标（本 Sprint 不做）**：⑨ 协作技完整实现、② 完整职业技能树与表现、⑥ 资源完整经济、⑩ 信号全集、⑫ 进度存档正式化（含 RESIDENT 进度边界）、⑬ 完整 HUD 与可访问性 Comprehensive、多楼层完整 E11。后续 Sprint 补齐。

## 1. 范围（引用 epics.md 核心切片）
| Epic | Story | 内容 | 门禁 |
|---|---|---|---|
| E2 数据基座 | S2.1–S2.4 | 统一状态/属性模型 + 敌人/资源原型表 + 确定性 RNG(splitmix64) | C6(纪律A 数据边界) |
| E1 联机房+run-runtime | S1.1–S1.7 | 房间服务(复用 poker lobby)/双平面传输网关/30Hz tick 主循环/心跳5s·1s/RESIDENT/重连握手/TICK_RATE 锁 | C1/C2/C4/C5/C6/C10 |
| E4 输入预测 | S4.1–S4.5 | InputCmd/本地预测/reconciliation/100ms 插值/延迟指示 | C6(纪律B) |
| E3 地牢生成 | S3.1–S3.3 | 确定性种子生成/SpawnPoint 契约(只读)/布局序列化 | C7 |
| E5 战斗 | S5.1–S5.6(+S5.7/S5.8) | 统一结算/碰撞/普攻闪避/伤害请求校验/倒地触发/命中权威/反作弊基线/telegraph 调度 | C8/C11 |
| E6 敌人AI | S6.1–S6.5 | 刷怪(读 SpawnPoint)/AI/telegraph/伤害请求/MIN_TELEGRAPH_TICKS=18 | C8 |
| E7 救援倒地 | S7.1–S7.7 | 倒地/自救/呼救/免疫补刀/超时OUT/D8 托管/重连无跳变还原 | C3/C10 |

## 2. 实现顺序（依赖驱动）
**E2 → E1 → E4 → E3 → E5 → E6 → E7**（切片闭环）。E13(C9/C1 文档回填：④⑦⑧ 三处 TICK_RATE/不等式引用) 与 E1/E4/E5/E6 并行前置。

## 3. 验收标准（DoD）
- 2–4 人可进好友房/公共房(RESIDENT)，确定性生成地牢，移动+输入预测回正（RTT 250ms 下无明显撕裂），战斗逐 tick 结算，倒地与救援（含超时 OUT 观战），**断线重连无跳变**（含 DOWNED 剩余窗口，不误判 OUT）。
- 测试全绿：golden-test（同 seed 同布局+世界哈希）；重连无跳变集成（含 DOWNED 剩余窗口）；30Hz×4 perf（diff p95<2ms/tick@40 实体，带宽<16KB/s）；反作弊（seq 防重放+拒伪造伤害请求）。
- 纪律 A/B 静态检查：enemy-ai 不 import combat/dungeon-gen 运行时；consumer 不改 diff 格式。
- telegraph 前摇 ≥ 0.6s（18 tick），第1帧静态可读。

## 4. 测试策略（引用 test-framework.md）
本 Sprint 落地：sim-core 单测 + C7 golden + C10 重连集成 + C5 perf + C11 安全 的最小可用集；脚手架 `packages/sim-core/` + `apps/dungeon-server/` + `tests/` 在 Sprint 初建立。

## 5. 资产依赖
本 Sprint 用**占位/程序化美术**（色块 + 简易 sprite）跑通机制与循环；林绘澄 P0 资产清单（`art/asset-spec.md`）作为后续 Sprint 投产依据，不在本 Sprint 阻塞机制验证。

## 6. 风险与缓解
- **R1** 双平面二进制通道(C5)实现复杂度 → 先用 JSON 跑通闭环，二进制 delta 作为优化项在 E1.S1.2 内可延后。
- **R2** Godot 客户端未启动（D1 决策：headless 推迟）→ 本 Sprint 用 headless 测试客户端/合成输入验证服务器闭环，Godot 客户端接入留升级路径。
- **R3** 30Hz 插值手感未知 → 切片内用 100ms 缓冲 + 预测回正，试玩验证。

## 7. 已知事项
- `art-bible.md` §7 line92 残留「待 tick 率定」字面 → 落盘时一并改为「已锁 ADR-NET-01 D3:18tick@30Hz」（design-strategist 负责）。
- ⑨ 协作技 GDD 未写 → UX/资产中协作技入口保持占位，待 GDD 补完回填。
- RESIDENT 公共房进度边界(W2)不在本 Sprint，E11 正式进度留 Sprint 2。

## 8. 验证门（Phase 5 前）
切片建成后设 **「好玩吗」人工验证门**：内部试玩确认四大支柱最小闭环有趣，再承诺完整 Phase 5 制作。（用户已批准设此门。）
