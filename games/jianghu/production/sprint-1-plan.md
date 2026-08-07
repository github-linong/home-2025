# 江湖 (jianghu) · Phase 3/4 汇编 + Sprint 1 计划

**路径**：`games/jianghu/production/sprint-1-plan.md`
**主理人**：游承峰　|　**日期**：2026-08-06　|　**状态**：Phase 3 质量门 PASS，进入 Phase 4 汇编与 Sprint 1 实现

---

## 0. Phase 3 质量门判定（强制）

> **判定：PASS（可行）** —— R2 唯一真阻塞项已闭合为「可行」，无 FAIL。遗留 2 项非阻塞 CONCERN（已登记控制清单，不阻塞进 Sprint 1）。

| 检查项 | 结果 |
|---|---|
| 跨 GDD 一致性（16 共享常量） | PASS |
| 架构评审（architecture-review.md） | PASS（R2 三项全可行，1 处量化微调非阻塞） |
| R2 裁决（格挡手感 / 预测回滚 / 随机副本 seed） | 可行 ✅ |
| 控制清单（control-checklist.md） | 已建 13 项门禁，作 Sprint 1 实现前 gate |
| 美术/UX 就绪 | accessibility=Standard 基线、asset-specs、ux-spec 均落盘 |

**R2 量化微调（已锁 ADR-JH-ENG-01）**：`PARRY_WINDOW=200ms`@12Hz=2.4 tick → `PARRY_TICKS=3`（250ms）；`MIN_TELEGRAPH_TICKS=8`（666ms≥0.6s 可读下界）。

**2 项非阻塞 CONCERN（Phase-2 处理）**：
- **C-A** 主世界单房间全量广播并发上限 → MVP 单图 <32 人可接受，超阈值再加 interest-management / 分片。
- **C-B** 副本「集合缓冲」取先到者邻近判定 → 入口加短等待窗口聚合，联调敲定。

---

## 1. 阶段资产汇编清单（全部已落盘）

| 阶段 | 文档 | 路径 |
|---|---|---|
| P1 概念 | 概念文档（5 支柱 / MDA / 主+3 子循环） | `design/concept.md` |
| P1 美术 | 美术圣经（视觉身份九节 + 调色板 + BOSS 视觉） | `art/art-bible.md` |
| P2 设计 | 7 系统八节 GDD + systems-index（一致性 PASS） | `design/gdd/*.md` |
| P3 工程 | 主架构 + 4 ADR + 评审 + 控制清单 | `docs/architecture/*`（含 `adr/`） |
| P3 美术 | 可访问性三档（MVP=Standard） | `art/accessibility.md` |
| P4 美术 | 资产规格（48px 水墨像素全清单） | `art/asset-specs.md` |
| P4 设计 | UX 规格（HUD / 输入 / 流程 / 词缀 / 可访问性） | `design/ux-spec.md` |

---

## 2. 锁定共享常量（单一来源，客户端经同份/codegen 消费）

| 常量 | 值 | 来源 |
|---|---|---|
| TILE | 48px | movement§③ |
| TICK_RATE | 12（83.33ms/tick） | ADR-JH-ENG-01 |
| BASE_SPEED | 4 格/s（0.333 格/tick） | movement§⑥ |
| PARRY_TICKS | 3（250ms，≥200ms 意图） | ADR-JH-ENG-01（R2a） |
| MIN_TELEGRAPH_TICKS | 8（666ms） | ADR-JH-ENG-01（R2a） |
| PARRY_REDUCTION | 0.6 | combat§⑥ |
| RTT 容差 | 150ms（>150ms 平滑降准） | combat§⑦ |
| 属性 | STR / DEX / VIT（三系，去内力） | 决策⑦ |
| XP_req | 50·Level^1.5 | 双线养成 |
| 掉落率 | 普通 0.30 / 精英·BOSS 1.0 | loot§③ |
| 词缀数 | 白 0–1 / 蓝 2 / 金 3–4 / 暗金 4+1 | loot§③ |
| HP 倍率 | 精英 ×3 / BOSS ×10 | spawning§③ |
| 技能 CD | 3–8s（3–4 槽） | combat§⑥ |
| 背包上限 | 60（满→地面溢出 TTL） | loot§⑤ |
| 副本 seed | hash(serverTick + entranceId + partyTag) 服务端权威 | dungeon§⑧ |
| 副本寿命 / 入口冷却 | 30min / 10s | ADR-JH-ENG-03 |

---

## 3. Sprint 1 范围与依赖顺序（systems-index DAG）

依赖序：**auth(SYS-07) → persistence(SYS-06) → movement(SYS-01) → {combat(SYS-02)+spawning(SYS-03)+loot(SYS-04) 联调} → dungeon(SYS-05)**

### E1 · 工程脚手架（Sprint 1 第一刀，已完成 ✅）
- 新建 `games/jianghu/apps/jianghu/`（Node + ws 网关），复用 Claw infra（wander 网格步进+房间广播 / chat Better Auth+广播域 / api2 登录）。sim-core 在 `games/jianghu/apps/jianghu/sim-core/`。
- **布局约定**：整个 jianghu 项目自包含于 `games/jianghu/`（design/ + art/ + docs/ + production/ + 代码 apps/），与 dungeon-online 的 `games/dungeon-online/` 约定一致；故服务端代码置于 `games/jianghu/apps/jianghu/`，非根 `apps/`。
- 共享常量模块（§2 全部常量，单一来源）。
- 传输双平面：控制面 JSON（复用 framing，显式 `"type"`）+ 数据面二进制 delta（`ws.send(Buffer)`，12Hz 热路径）。
- `room-service`：主世界 RESIDENT 常驻 + N 个副本 instance 独立广播域；`run-runtime` 主循环 TICK_RATE=12。
- `sim-core` 纯 TS 确定性层骨架（rng/movement/combat/spawning/loot/dungeonGen/parry），复用 dungeon-online 纪律 A/B。
- **入口门**：control-checklist C1–C5。
- **不 commit**（待用户授权）。

### E2 · 登录 + 持久化（双模式，已完成 ✅）
- Better Auth `verifyWithApi2` 登录落库（Character + Inventory≤60）；server 28→48 测试（+20 E2 断言）全绿，typecheck 0 error，未 commit。
- 游客 `guestId`（UUID v4，零持久写）；游客→登录**不合并**（丢弃）；单角色多端 **last-wins**。
- 背包满 → 地面溢出 `loot.ttlTicks`（无邮件）。
- **入口门**：C-Per-1..4。

### E3 · 移动（网格步进 + 预测）— 已完成 ✅
- sim-core `movement.ts` 真实现（`stepMovement` 纯函数 px 积分 + 沿自由轴滑动碰撞，仅 import types/constants，C6/C7）；`world.ts` 真 `addPlayer` + seatId-keyed `enqueueInput`（C11 seq 单调）+ `step()` 消费输入驱动玩家位移；`run-manager.addPlayerToRoom` + `gateway.room.join` 接线；`package.json` test 脚本修复；新增 `sim-core/tests/unit/movement.test.ts`。
- **独立复验**：server+sim-core 测试 48→67 全绿，typecheck 0 error，world 集成 + 确定性断言通过，C7 勾选。
- **入口门**：C7 ✅、C9（PARRY_TICKS/MIN_TELEGRAPH_TICKS 早已在 constants.ts）✅。
- 已知缺口：InputAction 无 STOP（按住持续移动，E4 补 STOP/技能意图）；副本 instance 暂未 spawn owner（E5）。

### E4 · 战斗 + 刷怪 + 掉装 联调 — 已完成 ✅
- sim-core `parry.ts`（`judgeParry`/`openParryWindow` 服务端时间窗）+ `combat.ts`（`resolveDamage` 忽略客户端 amount 经 `judgeParry` 减伤 0.6、纯函数不改 hp；`resolveSkill`/`getSkillDef` 用 SKILL_DAMAGE/SKILL_RANGE/SKILL_CD_BY_SLOT）+ `spawning.ts`（`spawnWave` HP_MULT 三档+散布+复活，TIER_KEYS 修 NaN bug，仅 type loot）+ `loot.ts`（`rollLoot` DROP_RATE+权重稀有度+AFFIX_COUNTS 词缀数+暗金5、`dropToGround` ttlTicks）+ `world.ts`（刷怪区/输入分发 PARRY+SKILL/skillCd 闸门/敌人→玩家伤害/死亡掉 LOOT_GROUND/TTL/拾取钩子/BOSS 阶段）。
- 服务端 `run-manager.ts`：`onPickup` 钩子 + `applyPickupToInventory`（背包入库；溢出→`toGroundLoot`→`world.spawnGroundLoot` 落回地面，C-Per-3 闭环）。
- 新增测试 combat/parry/spawning/loot/world-combat（共 +34 用例）。
- **独立复验**：101/101 全绿，typecheck 0 error，golden 未变，C9/C11/C-Per-3 勾选。
- **入口门**：C9 ✅、C-Per-3 ✅、C11 ✅、C12（EntityState 条件序列化已就位）✅。

### E5 · 随机副本 — 已完成 ✅
- `dungeonGen.ts` 落地 `generateLayout`+`buildDungeonSpec`（确定性 layoutRng：rooms5-12/maxDepth=3/BOSS 置最深层 C-Dgn-3/密度×1.5/出生角安全）；仅 `import type` SpawnZone（C6 纪律 A）。
- `run-manager.ts` `enterInstance`（RESIDENT tick→computeInstanceSeed(serverTick+entranceId+partyTag)→建独立 world+12Hz run+锁 members+切域）/ `exitInstance`（停 run、成员回 RESIDENT RESPAWN_POS+setRoom 主世界、销毁）/ `checkInstanceExpiry`（expireAt=30min 到点自动解散，C-Dgn-4）；`world.ts` 加 `removePlayer`+`tryEnterEntrance`(冷却闸门 C-Dgn-4)，未动 step→golden 稳。
- `room-service.ts` `createInstanceRoom`(创建即锁 members C-Dgn-2)+`getInstanceRoom/isMember/getInstanceMembers`+`joinInstance`(锁后拒非成员)。
- `protocol.ts` `dungeon.enter`(NOT_IN_RESIDENT 域边界)/`dungeon.exit`(NOT_IN_INSTANCE)/`session.reconnect`(fellBackToResident，C-Net-3/C10)；`gateway.ts` 注入 seatId/roomId + setRoom 原子切域(C-Net-2)。
- 新增测试 dungeonGen(8)+instance-lifecycle(9)+room-service(+1)+integration E2E C10 真 ws(+1)；**120/120 全绿，typecheck 0 error，golden 未变**。
- **入口门**：C-Net-1..4 ✅、C-Dgn-1..4 ✅、C10 ✅。
- 已知缺口（Phase-2）：服务端入口坐标强校验未做（位置重叠判定在客户端）；多人「集合缓冲取先到者」未实现（MVP 单人进本）；副本为刷怪区抽象无实体迷宫墙。

### 垂直切片验证（E1–E5 后）— 已完成 ✅（「好玩吗」门 PASS）
- `scripts/playtest-core-loop.mjs`（486 行，headless 驱动真实 protocol.dispatch + run-manager.enterInstance/exitInstance + world.step，fake Conn 替代 ws）跑通 8 步核心循环：加入主世界→移动(16px/tick)→SKILL 击杀→掉装(rarity=2, ttl=1800)→拾取→进副本(seed 服务端派生/成员锁定/原子切域, bossHp=300)→BOSS 击杀含 phase 推进(hp=120<150)→暗金必掉(rarity=3)→出本回安全区(768,720)。
- **12/12 PASS，EXIT 0**；GOLDEN_PLAYTEST_HASH=`fb383df88bd8cb85deaabc9c6c3fd6bb8b1138ab4f65a10302ef1419ce5a12f4`（两次运行字节级相等）；回归 120/120 绿 + golden `32ed5135…` 未变。
- 报告：`production/playtest-core-loop-report.md`（§4 诚实未覆盖 10 项：无浏览器渲染/无真人手感/无多人同本/无真 ws 抖动/telegraph 视觉未接/敌人无 AI 追击等）。
- **结论**：服务端权威机械闭环（能进、能打、能掉、能拾取、能出本、能复现）形式化证明成立；「好不好玩」需客户端接入后人工评估。

---

## 4. 已知风险与缓解

| 风险 | 等级 | 缓解 |
|---|---|---|
| C-A 主世界单房广播并发 | 中（非阻塞） | MVP <32 人；超阈值加 interest-management / 分片（Phase-2） |
| C-B 副本集合缓冲邻近判定 | 低（非阻塞） | 入口短等待窗口聚合，联调敲定 |
| 移动预测 100ms 手感实测 | 中 | R2 已验证模型；偏严可调 TICK_RATE=15 / PARRY_TICKS=4 |
| 触屏竖屏 HUD 密度 | 低（待 Phase-2） | ux-spec 已标记需真机走查，可折叠技能栏 |
| 新手引导（PvE 纯合作认知） | 低（待 Phase-2） | 靠色块+飘字；首杀教学待验证，护 P5 勿过重 |
| 工程派生：快照字段补全污染哈希 | 已吸收（C12） | EntityState 一次性声明 + 条件序列化，golden-test 守护 |

---

## 5. 下一步（自主推进中）
- **E1 已完成** ✅（engineering-lead，server 28/28 + sim-core 10/10 测试全绿，双 typecheck 0 error，未 commit）：`games/jianghu/apps/jianghu/`。
- **E2 已完成** ✅（engineering-lead，server 48/48 测试全绿，typecheck 0 error，未 commit）：双模式 auth + 持久化 + last-wins + 背包溢出 TTL，C-Per-1..4 落实。
- **E3 已完成** ✅（engineering-lead，测试 48→67 全绿，typecheck 0 error，未 commit）：服务端权威网格步进移动 + seatId 输入路由 + C11 seq 单调 + C7 勾选。
- **E4 已完成** ✅（engineering-lead，测试 67→101 全绿，typecheck 0 error，未 commit）：服务端权威战斗/刷怪/掉装联调 + 背包溢出地面 TTL 闭环，C9/C11/C-Per-3 落实。
- **E5 已完成** ✅（engineering-lead，测试 101→120 全绿，typecheck 0 error，golden 未变，未 commit）：随机副本实例系统（seed 生成/成员锁定/独立域/出本归位/30min 寿命/入口冷却/重连恢复），C-Net-1..4/C-Dgn-1..4/C10 落实。
- **Sprint 1 全部 epic（E1–E5）+ 垂直切片 playtest + 双评审收口 + C1 浏览器客户端已完成并独立验证**。
- **双评审**（quality-lead + design-strategist）：总判定 CONCERNS→已全部处理——F1 拾取→背包接线（`bootResidentRun`/`enterInstance` 传 `onPickup→handlePickup`，`tests/pickup-inventory.test.ts`）、O3 格挡 off-by-one（`windowEndTick=tick+PARRY_TICKS-1` 恰好 250ms）；文档回填 `production/s1-review-backfill.md`（BOSS 2 阶段 @50% / 精英率 15% / 格挡公式，均已决·主理人推荐）。
- **C1 浏览器客户端**：`apps/web-client/index.html`（自包含 Canvas+WS，零构建）+ README + Puppeteer E2E 真连服务端 12/12；**P0 惯性滑行已修**（`InputAction.STOP=7`，松键即停，`tests/movement` +3 例）。
- **当前状态**：127/127 测试绿、typecheck 0、playtest 12/12（GOLDEN_PLAYTEST_HASH=`fb383df8…` 未变）；**服务端已起**（`DEV_SKIP_AUTH=true` :3011）+ 静态客户端 :8080 → **可玩** `http://localhost:8080/index.html`。
- 剩余：① commit（需用户授权，`games/jianghu/` 未 git 跟踪）② Phase-2（多人同本集合缓冲/敌人 AI 追击/客户端预测回正/telegraph 视觉/服务端入口坐标校验/断线清 lastMove 等）。
