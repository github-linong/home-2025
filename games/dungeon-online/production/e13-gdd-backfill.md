# E13 · GDD 回填（reverse-sync 代码→文档）· Reconcile Note

> 阶段：Phase 5（生产）｜ Epic：E13 — GDD backfill（关闭设计缺口 **O-H** / **O-I**）
> 角色：design-strategist（文策渊）｜ 原则：**代码为权威真相源（code is the source of truth）**
> 范围：docs-only。仅改 `design/gdd/*.md` + 配套 `design/ux/ux-spec.md`，**未触碰任何 `src/` / `tests/`**。
> 配套交付：`design/gdd/01-network-room.md`、`04-input-prediction.md`、`05-dungeon-gen.md`、`07-combat.md`、`08-enemy-ai.md`、`11-rescue-down.md`（后两者 + ① 为本次实际改动文件）。

---

## 0. 结论（Verdict）

- **O-I RESOLVED** — GDD ⑦ §4 战斗常量已回填为代码锁定值（普攻伤害 18、闪避 iframe 0.4s/12 tick、无独立闪避 CD 闸门）。
- **O-H RESOLVED** — 覆盖三处：
  - **O-H6**（e6:144）：GDD ⑧ §4 敌人常量回填（应用伤害 8/12/20、tier telegraph 21/24/30、移速/攻击范围、编队 2–6）。
  - **O-H7 / O-A7**（e7）：GDD ⑪ §4 救援阈值回填（solo 10s、救援 3s、DOWNED 20s、RESCUE_RADIUS=48、REVIVAL 0.3/30）。
  - **D8 接线保真**（design-review-d8）：GDD ① §8 / ⑪ §6 补「三者同发」与 gateway/protocol 代码行号接线。
- **C1（TICK_RATE 30Hz）已对齐**：GDD ① §4 / ④ §4 / ⑦ §4 均已引用 `ADR-NET-01` 锁 30Hz，无散落初值，无需改动。
- **C9（D3 不等式 250/100/0.6s=18tick）已对齐**：GDD ④ §7 / ⑦ §7 / ⑧ §4 已含「18 tick @30Hz / 0.6s 硬下限主导」，无需改动；O-H6 仅补 tier 具体 tick 数（21/24/30）增强可读性。

> 注：本任务聚焦 **O-H/O-I（C9/C1 关联段）** 的代码↔GDD 漂移修正。其余发现的 GDD 漂移（地牢生成楼层数等）为**报告项，未改**，见 §4。

---

## 1. 权威代码基线（本次反向同步采用的真值）

| 常量 / 行为 | 代码位置（真值） |
|---|---|
| `TICK_RATE = 30`（TICK_MS = 1000/30 ≈ 33.33ms） | `apps/dungeon-server/src/run-runtime.ts:19-21` |
| `MIN_TELEGRAPH_TICKS = 18`（0.6s @30Hz，D12 下限） | `packages/sim-core/src/combat.ts:31` |
| 敌人 telegraph tier：`grunt 21` / `elite 24` / `boss 30` tick | `packages/sim-core/src/types.ts:216,229,242` |
| `DODGE_IFRAME_TICKS = 12`（0.4s @30Hz） | `packages/sim-core/src/combat.ts:37` |
| `PLAYER_ATTACK_DAMAGE = 18`（全职业统一，服务端裁决） | `packages/sim-core/src/combat.ts:34` |
| 敌人应用伤害（单一值）：grunt 8 / elite 12 / boss 20 | `packages/sim-core/src/types.ts:213,226,239`（`ENEMY_PROTOTYPES.attackDamage`） |
| 敌人移速 / 攻击范围：110/95/80 px·s⁻¹；40/48/64 px | `packages/sim-core/src/types.ts:214-215,227-228,240-241` |
| `RESCUE_RADIUS = 48`、`RESCUE_TICKS = 90`、`SOLO_SELF_RESCUE_TICKS = 300`、`DOWNED_TIMEOUT_TICKS = 600`、`REVIVAL_HP_RATIO = 0.3`、`REVIVAL_HP_MIN = 30` | `packages/sim-core/src/rescue.ts:24-39` |
| EntityStatus 位：`ALIVE=1<<0`、`DOWNED=1<<1`、`OUT=1<<2`、`DEAD=1<<3`、`IFRAME=1<<4`、`STUN=1<<5`、`SLOW=1<<6`、`BUFF=1<<7` | `packages/sim-core/src/types.ts:52-64` |
| D8 接线：`gateway.ts` ping-timeout(L139)/ws-close(L167) → `markDisconnected`；`protocol.ts` session.reconnect(L199) → `validateReconnect` → `world.setDisconnected`；**三者同发**（跳过 tick + 暂停 DOWNED/救援计时 + 单次抓拍 `PersonalState`） | `apps/dungeon-server/src/gateway.ts:139,167`、`protocol.ts:199`、`room-service.ts:271-292`、`packages/sim-core/src/world.ts:368-383` |
| 断线宽限 `disconnectGraceMs=30_000`；重连 token TTL `reconnectTokenTtlMs=1_800_000` | `apps/dungeon-server/src/config.ts:33,36` |
| 单局楼层数 `rng.nextInt(3,5)` = 3–5（**非 5–7**）；资源点 `rng.nextInt(2,5)` = 2–5（总）；刷怪 `count` `rng.nextInt(2,6)` | `packages/sim-core/src/dungeon-gen.ts:55,69-77,81-90` |

---

## 2. 本次改动清单（逐条 · 映射到 O-H/O-I）

### 2.1 GDD ⑦ 战斗 — 关闭 **O-I**（`design/gdd/07-combat.md`）
| 段 | 原 GDD（漂移） | 改后（代码真值） | 映射 |
|---|---|---|---|
| §4 普攻伤害 | `伤害 10–15（按职业）` | `伤害 18（全职业统一，服务端 resolveDamage 裁决、忽略客户端 amount；职业差异在 ②/⑨/E8）` | **O-I**（e5:135：代码锁 `PLAYER_ATTACK_DAMAGE=18`） |
| §4 普攻 CD | `CD 0.4s` | `CD 0.4s（CLASS_BASE.attackCooldownMs=400；world 暂未强制 CD 闸门，P5 评估，见 E5 O-L）` | **O-I**（保留数据定义，标注未强制，避免与 O-L 冲突） |
| §4 闪避 iframe | `i-frame 0.3s` | `i-frame 0.4s（12 tick @30Hz，DODGE_IFRAME_TICKS=12）` | **O-I**（e5:135：代码锁 `DODGE_IFRAME_TICKS=12=0.4s`） |
| §4 闪避 CD | `CD 0.8s` | `无独立冷却闸门（DODGE 直接授予 iframe 窗口，过期后可再闪避；0.8s CD 为设计意图，P5 评估是否落地）` | **O-I**（代码未实现闪避 CD，GDD 原称实现 → 纠正为设计意图） |
| §5 状态机 | 无 EntityStatus 位定义 | 新增「实体状态位（types.EntityStatus，代码权威）」：ALIVE=1<<0 … BUFF=1<<7；DOWNED/OUT 互斥、IFRAME 过期清除、OUT 仅超时触发 | **O-I 关联**（EntityStatus 位保真，brief 列明为漂移源） |

### 2.2 GDD ⑧ 敌人 AI — 关闭 **O-H6**（`design/gdd/08-enemy-ai.md`）
| 段 | 原 GDD（漂移） | 改后（代码真值） | 映射 |
|---|---|---|---|
| §4 攻击伤害 | `杂兵 8–12、精英 15–20、Boss 20–35` | `杂兵 8 / 精英 12 / Boss 20`（服务端自 `ENEMY_PROTOTYPES.attackDamage` 单一值裁决；`attackDamageMin/Max` 仅原型数据、未参与结算） | **O-H6**（e6:144：E6 锁 `ENEMY_PROTOTYPES` 四项平衡初稿；GDD 原列范围值 ≠ 实际应用单一值） |
| §4 攻击前摇 | `杂兵 ≥0.7s、精英 ≥0.8s、Boss ≥1.0s` | 同前 + 显式 tick：`杂兵 ≥0.7s(21 tick)、精英 ≥0.8s(24 tick)、Boss ≥1.0s(30 tick)`；标注 `MIN_TELEGRAPH_TICKS=18` | **O-H6 / C9**（tier 21/24/30 绑定 D12，增强可读性） |
| §4 移速/攻击范围 | （未列） | 新增 `移动速率 110/95/80 px·s⁻¹；攻击触发范围 40/48/64 px（平衡初稿，E6 O-E6）` | **O-H6**（反向同步代码真值，保真） |
| §4 编队规模 | `杂兵 3–6 一群` | `杂兵 2–6 一群（刷怪点 count rng.nextInt(2,6)；每战斗房 1–3 波/层）` | **O-H6**（代码 `count` 为 2–6） |

### 2.3 GDD ⑪ 救援与倒地 — 关闭 **O-H7 / O-A7**（`design/gdd/11-rescue-down.md`）
| 段 | 原 GDD（漂移） | 改后（代码真值） | 映射 |
|---|---|---|---|
| §4 DOWNED 窗口 | `建议 15–20s` | `20s（DOWNED_TIMEOUT_TICKS=600 @30Hz）；命中 e7 契约上界` | **O-H7**（e7:155：阈值全 P5 初稿；代码钉 20s） |
| §4 救援读条 | `3s（靠近读条）` | `3s（RESCUE_TICKS=90 @30Hz，靠近读条）` | **O-H7**（补常量名，值本就一致） |
| §4 自救读条 | `5s（solo，比被救慢）` | `10s（SOLO_SELF_RESCUE_TICKS=300 @30Hz，复活为 1hp 降级态）` | **O-A7**（e7:70/148：ux-spec 5s vs 代码 10s 双源偏差，已统一为代码值） |
| §4 救援半径 | （未列） | 新增 `RESCUE_RADIUS=48（约 1.5 tile，欧氏距离平方判定）` | **O-H7**（代码真值回填） |
| §4 复活回血 | （未列） | 新增 `hp = max(REVIVAL_HP_MIN=30, round(maxHp*REVIVAL_HP_RATIO=0.3))`；solo 1hp；标注 O-I7 | **O-H7 / O-I7**（e7:74/156：低 maxHp 职业命中 30 下限） |
| §4 阈值总注 | — | 新增「以上阈值全为 P5 平衡初稿（O-H7），待『好玩吗』门前复核」 | **O-H7** |
| §5 状态机 | 无 EntityStatus 位定义 | 新增「实体状态位：ALIVE=1<<0、DOWNED=1<<1、OUT=1<<2（与 DOWNED 紧邻）、DEAD=1<<3；OUT 仅超时触发、绝不经由伤害结算」 | **O-H 关联**（OUT 位保真） |
| §6 P4 契约 | 「计时暂停 + 归位还原」语义描述 | 同前 + 显式「托管三者同发（world.setDisconnected，D8 端到端 1/1）：① 跳过该玩家 tick ② 暂停 DOWNED/救援计时 ③ 单次抓拍 PersonalState（冻结态，重连前不被覆盖）；重连 protocol.session.reconnect L199 → validateReconnect → setDisconnected(false) 从全量 WorldSnapshot 还原 + 续算」 | **D8 保真**（design-review-d8：gateway L139/L167、protocol L199 接线） |

### 2.4 GDD ① 联机与房间 — D8 接线保真（`design/gdd/01-network-room.md`）
| 段 | 原 GDD（漂移） | 改后（代码真值） | 映射 |
|---|---|---|---|
| §4 重连窗口 | `无硬性上限（…状态保留至房间结束）` | `重连 token TTL 30min（reconnectTokenTtlMs=1_800_000）；断线宽限 30s（disconnectGraceMs）——宽限内可重连，超时 clearSeat` | **O-H 关联**（config.ts 真值回填，原「无上限」与 30s 宽限冲突） |
| §8 P4 契约 | 「托管期间计时暂停 + 归位还原」语义描述 | 同前 + 显式**接线**：`gateway` 心跳超时(L139)/ws close(L167) → `room-service.markDisconnected`（置 seat=disconnected + 30s timer）；重连 `protocol.session.reconnect`(L199) → `validateReconnect` → `world.setDisconnected(false)` + 全量 `WorldSnapshot`(binary)；**三者同发**（① 跳过 tick ② 暂停计时 ③ 抓拍 PersonalState） | **D8 保真**（gateway/protocol 代码行号） |

### 2.5 配套 `design/ux/ux-spec.md`（解决 O-A7 双源不一致，trivially-safe）
| 段 | 原（漂移） | 改后 | 映射 |
|---|---|---|---|
| §0 常量表「倒地数值」 | `自救 5 s` | `自救 10 s`（代码钉 `SOLO_SELF_RESCUE_TICKS=300`；O-A7 双源已统一） | **O-A7** |
| §0 常量表「DOWNED 窗口」 | `15–20 s` | `20 s` | **O-A7 / O-H7** |
| §5 救援/自救读条 | `solo 自救读条 5 s` | `solo 自救读条 10 s` | **O-A7** |
| §5 超时→OUT | `DOWNED 窗口 15–20 s` | `DOWNED 窗口 20 s（DOWNED_TIMEOUT_TICKS=600）` | **O-A7 / O-H7** |

> 说明：ux-spec 非 `design/gdd/*.md`，但 e7 O-A7 明确要求「⑪ GDD 钉值后同步回 ux-spec §0」以消除双源不一致；改动仅为数值对齐，trivially-safe，故一并处理并显式上报。

---

## 3. O-H / O-I 闭合判定

### O-I — RESOLVED
- 定义（e5:135）：代码已锁战斗常量（`MIN_TELEGRAPH_TICKS=18`、`PLAYER_ATTACK_DAMAGE=18`、`DODGE_IFRAME_TICKS=12`、`CLASS_BASE.moveSpeed/30`）但 GDD ⑦ §4/§7 未回填。
- 处置：⑦ §4 普攻伤害（10–15→18）、闪避 iframe（0.3s→0.4s/12tick）、闪避 CD（0.8s 实现→标注未实现+设计意图）、EntityStatus 位保真，全部回填。
- 无遗留子项（GDD 层面）。

### O-H — RESOLVED
- 定义：① **O-H6**（e6:144）E6 锁 `ENEMY_PROTOTYPES` 四项平衡初稿 + D12 tier 21/24/30，GDD ⑧ §4 未回填；② **O-H7 / O-A7**（e7）救援阈值全 P5 初稿 + solo 5s vs 10s 双源；③ D8 接线保真（gateway/protocol/三者同发）。
- 处置：⑧ §4 敌人伤害（范围→单一值 8/12/20）、tier tick 显式、移速/范围/编队回填；⑪ §4 救援全套阈值回填 + EntityStatus OUT 位；① §8 / ⑪ §6 D8 接线与三者同发保真；ux-spec §0/§5 同步 10s 解决 O-A7。
- 无遗留子项（GDD 层面）。

### C1 / C9（关联控制项，已对齐，无需改）
- **C1**（`epics` S13.2）：TICK_RATE 30Hz 在 GDD ① §4 / ④ §4 / ⑦ §4 均已引用 `ADR-NET-01`，无裸写 33.3。✅ 已对齐。
- **C9**（`epics` S13.1）：D3 不等式（RTT250/K100/0.6s=18tick）在 GDD ④ §7 / ⑦ §7 / ⑧ §4 已含「18 tick @30Hz / 0.6s 硬下限主导」。本次仅于 ⑧ §4 补 tier tick 数（21/24/30）增强可读性。✅ 已对齐。

---

## 4. 本次发现的其他 GDD 漂移（报告项 · 未改 · 待设计决策）

以下漂移**不在 O-H/O-I（C9/C1）聚焦范围**，且部分触及**设计目标/节奏决策**（非纯数值锁值），按 brief「fix only if trivially safe」原则**仅报告、未改**。

| # | 文件 / 段 | GDD 现状 | 代码真值 | 性质 | 建议 |
|---|---|---|---|---|---|
| D1 | ⑤ §4 单局楼层数 | `5–7 层（目标单局 8–15min）` | `rng.nextInt(3,5)` = **3–5 层** | 设计目标 vs 实现下限 | 属节奏/支柱 P2 决策，非纯数值锁值 → **建议 design-strategist + team-lead 裁定**：是代码未追上设计（应放宽 rng 上界），还是设计目标过高（应下调 5–7→3–5 并复核 8–15min）。**勿静默改。** |
| D2 | ⑤ §4 资源点 | `每房 0–2 个` | `resCount = rng.nextInt(2,5)` = **全图 2–5 个**（非每房） | 口径不一致（每房 vs 全图总数） | 报告；若改需先定「每房密度」还是「全图总数」语义。 |
| D3 | ⑤ §4 刷怪点密度 | `每战斗房 3–8 个` | `count = rng.nextInt(2,6)` 且 `1–3 波/层` | 口径不一致（每层波内 count vs 每房总数） | 报告；同 D2 语义澄清。 |

> 以上三项均源于 `dungeon-gen.ts` 与 ⑤ §4 的偏差，且 ⑤ §4 用「目标/建议」措辞、代码用 `rng` 初稿区间，属**设计意图 vs 初稿实现**的张力，应走设计评审而非单纯 reverse-sync。本任务未触碰 ⑤。

### 已知工程缺口（非 GDD 漂移，不在本任务范围，仅记录不阻断）
- **O-C6**（范围/权威位置命中重校未做）、**O-B6**（碰撞未做）、**O-E7**（客户端重连插值未纳入 headless 切片）、**O-L**（普攻 CD 未强制）——均为代码侧缺口，GDD 已据实标注，无需文档改动。

---

## 5. 代码改动确认（Read-only 声明）

- 本次任务为 **docs-only**。我**仅读取**了 `packages/sim-core/src/*` 与 `apps/dungeon-server/src/*` 作为权威真相源。
- **未修改任何 `src/` 或 `tests/` 文件**，未运行任何会改源码/测试的命令。
- 实际改动文件清单：
  - `design/gdd/07-combat.md`（§4、§5）
  - `design/gdd/08-enemy-ai.md`（§4）
  - `design/gdd/11-rescue-down.md`（§4、§5、§6）
  - `design/gdd/01-network-room.md`（§4、§8）
  - `design/ux/ux-spec.md`（§0、§5）— 配套 O-A7 同步

---

## 6. 下一步建议
1. **D1–D3（地牢生成）**：请 team-lead 协调 design-strategist 裁定「设计目标 5–7 层 vs 代码 3–5 层」是否需 E 后续 epic 拉齐，或下调 GDD 目标值（若判定代码为最终意图，可反向改 ⑤ §4 闭环 D1–D3）。
2. **O-H7 / O-I7（平衡初稿）**：`RESCUE_*` / `REVIVAL_HP_MIN=30` / 敌人 `attackDamage` 全为 P5 初稿，建议排入「好玩吗」验证门前做端到端手感调参（e7 §6 已登记）。
3. **C1/C9 已对齐**，无需 further action；O-I6（intent.damage 冗余，正向防御纵深）保留代码现状、不进 GDD 改动。
