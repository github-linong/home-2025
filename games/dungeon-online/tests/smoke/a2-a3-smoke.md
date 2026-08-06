# A2/A3 烟雾测试清单（最小可跑 · 需真实 Godot 环境）

**路径**：`tests/smoke/a2-a3-smoke.md` ｜ **作者**：严守真（quality-lead）
**前置**：Godot 4.x（editor 或浏览器导出）；一个可达的 `dungeon-server`（`DEV_SKIP_AUTH=true`，见其 package.json / README）；`apps/client/` 已导入项目。
**约束**：本沙箱无 Godot 二进制，下列步骤**不可在此自动跑**——由 dev 在真实 Godot 环境执行并回填结果。本文件仅文档产出，不修改代码。
**关联**：`production/qa-plan-a2-a3.md` §3（Godot 运行清单）；`a2-a3-client-note.md` §5/§6。

> 说明：A2/A3 的"唯一自动门"是 Node 协议一致性测试（它只验服务端契约，不验 GDScript）。本 smoke 是**人工 Godot 运行**清单，用于合入前的渲染/手感证据。

## 步骤 0 — 起服务端（DEV_SKIP_AUTH）
```bash
cd apps/dungeon-server
DEV_SKIP_AUTH=true npm start        # 或按 README 起 src/server.ts，监听某端口
# 记下 ws 网关地址，例如 ws://127.0.0.1:<port>/ws/dungeon
```

## 步骤 1 — 【关键】客户端连服 + 实体渲染/滑步（验证 C2 路由修复）
- 在 Godot 打开客户端，连步骤 0 的网关（devUserId 任意）。
- 进房 → `game.start` → 观察。
- **PASS**：世界视图渲染出本地 + 若干远端实体，并随 30Hz 快照平滑移动（非全黑/不渲染）。
- **FAIL 含义**：C2 形状路由失效 → 100% 丢快照，报告并回退。

## 步骤 2 — 预警可读性（grow + intensify + 贴攻击者）
- 操控本地玩家靠近敌人前摇（杂兵/精英/Boss 各试一次）。
- **PASS**：危险区随时间**放大（0.35→1.0）+ 变亮（alpha ramp）**，且**贴在攻击者中心**；hit（applyTick）前可读。
- **检查**：Boss 的 CONE / LINE 指示是否朝攻击者实际朝向（当前实现恒指 +x，见 qa-plan §6）。

## 步骤 3 — 协作技可视化 + 无残留叠加层
- 释放 `SHIELD_ALLY` → 受护玩家出现青色 ring + 软填充。
- 释放 `TAUNT` → 施法者头顶黄色三角标记。
- 释放任意协作技 → 出现短暂 cast bar（约 600ms）。
- **【重点】强制等待窗口过期**，逐项确认 shield ring / taunt marker / cast bar **消失、无残影**；REVIVE_BOOST 只闪 cast bar、无持久叠加层。
- **PASS**：出现/消失严格对齐快照窗口，零 stale overlay。

## 步骤 4 — 本地移动响应式 + 平滑纠正
- 加模拟延迟（或跨机/跨网络）驱动本地玩家。
- **PASS**：移动即时响应（预测）；服务器纠正数帧内指数收敛，**无 snap / 橡皮筋跳变**。

## 步骤 5 — 远端滑步（100ms 缓冲）
- 观察其他玩家移动。
- **PASS**：30Hz 快照间以 `INTERP_DELAY_MS=100` 顺滑插值，无抖动。

## 步骤 6 — 重连还原（O-E7）+ C5 专项
- 游戏中强制断线（关网/杀进程）→ 自动重连同座。
- **PASS**：从冻结态无跳变恢复。
- **C5 专项**：若重连落到**不同 seat**，确认本地速度**不是旧座残留**；确认重连瞬间**无虚假预测跳变**（见 qa-plan §5 补充）。

## 烟雾 PASS 判据
- 步骤 1 通过（否则整组 FAIL，回退 C2）。
- 步骤 2–6 全部 PASS，且步骤 3 的"无残留叠加层"与步骤 6 的"无跳变/C5"明确确认。
- 全部满足 → **A2/A3 smoke PASS**，可放行合入；C2/C1/C5 仍作非阻塞 CONCERN 跟踪（见 qa-plan §7）。

## 结果回填区（dev 执行后记录）
- 执行人 / 日期 / Godot 版本 / 服务端端口：
- 步骤 1–6 结果（✅/❌ + 备注）：
- 是否发现残留叠加层 / 预测跳变 / CONE-LINE 朝向问题：
