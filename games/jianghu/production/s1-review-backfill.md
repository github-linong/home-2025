# Sprint 1 双评审 · 文档回填清单（s1-review-backfill）

**作者**：design-strategist（文策渊）　|　**日期**：2026-08-07
**性质**：docs-only 回填——以代码为权威源反向同步设计/架构文档。**未改任何代码、未 commit**。
**依据**：`production/design-review-s1.md` + `production/qa-review-s1.md` 双评审、主理人拍板（下述）。

---

## 0. 权威源确认（回填前核对）

| 项 | 权威源（代码） | 结论 |
|---|---|---|
| 格挡窗口公式 | `apps/jianghu/sim-core/src/parry.ts:41` `openParryWindow` 返回 `windowEndTick = tick + PARRY_TICKS - 1`；`:35` `judgeParry` 判 `applicationTick <= windowEndTick` | **O3 工程侧已修**：闭区间恰 3 tick = 250ms（旧 `tick+PARRY_TICKS` = 333ms off-by-one 已不存在） |
| `PARRY_TICKS` | `constants.ts:49` = 3（250ms） | 与 ADR-JH-ENG-01 §2 R2a 一致 |
| `BOSS_PHASE_THRESHOLD` | `constants.ts:191` = 0.5（二阶段）；`world.ts` phase2 攻击提速 | 实现为 2 阶段 @50% |
| 精英率 | `dungeonGen.ts:112` = 15% | 实现 15% |
| playtest 证据 | `playtest-core-loop-report.md:41` phase 首现 hp=120（<150=50%） | BOSS 2 阶段实证 |

---

## 1. 回填清单（文件 / 段 / 改动 / 依据）

### 1.1 拍板项 1：格挡窗口公式 → `tick+PARRY_TICKS-1`（O3 已修同步）

| 文件 | 段 | 改动 | 依据 |
|---|---|---|---|
| `docs/architecture/adr/ADR-JH-ENG-01.md` | §1 决策（L17） | `windowEndTick = tick + PARRY_TICKS` → `tick + PARRY_TICKS - 1`，补「闭区间覆盖起始 tick 起恰 PARRY_TICKS 个 tick = 250ms」 | engineering-lead 附注：ADR-JH-ENG-01.md:17 旧公式；parry.ts:41 |
| 同 | §2 量化（R2a 结论） | 追加「窗口语义（O3 off-by-one 已修）」说明：旧公式 333ms 逼近红线、工程侧已改、本 ADR 已同步 | 同上 |
| 同 | §4 逐 tick 时序（L61） | `windowEndTick=tick+PARRY_TICKS` → `tick+PARRY_TICKS-1`（O3 已修：闭区间恰 3 tick） | engineering-lead 附注：ADR-JH-ENG-01.md:61 旧公式 |
| `docs/architecture/jianghu-architecture.md` | §3 数据流·权威 tick（L82） | `windowEndTick=tick+PARRY_TICKS` → `tick+PARRY_TICKS-1`（闭区间恰 3 tick = 250ms） | engineering-lead 附注：jianghu-architecture.md:82 旧公式 |
| 同 | §4 量化决策（L92） | `PARRY_TICKS=3` 后补闭区间说明（`windowEndTick = tick + PARRY_TICKS - 1`，O3 已修） | 与 ADR §2 语义一致 |
| `design/gdd/combat.md` | §② 格挡窗口 | 标注【已决·主理人推荐】MVP 服务端窗口 = `PARRY_TICKS=3`（250ms）闭区间，指向 ADR-JH-ENG-01 §2；硬直/反伤 Phase-2 | 拍板项 1+4；N2/N4 |
| 同 | §⑥ 平衡初值 | `PARRY_WINDOW=200ms` 标注已决量化 250ms；`windowEndTick=tick+PARRY_TICKS-1` | 拍板项 4；ADR §2 |
| `design/gdd/systems-index.md` | §3 共享常量表（格挡行） | `窗口200ms` → `窗口250ms（PARRY_TICKS=3，闭区间 windowEndTick=tick+PARRY_TICKS-1）`，标注已决、ADR 为权威 | 拍板项 1+4；N2 |

### 1.2 拍板项 2：BOSS 阶段 —— MVP 2 阶段 @50%

| 文件 | 段 | 改动 | 依据 |
|---|---|---|---|
| `design/gdd/combat.md` | §② BOSS 机制 | 标注【已决·主理人推荐】MVP 2 阶段 @50%（`BOSS_PHASE_THRESHOLD=0.5`，playtest 实证）；3 阶段（66%/33%）+ 特殊技归 Phase-2（D1） | 拍板项 2；N1；constants.ts:191；playtest L41 |
| 同 | §⑥ 平衡初值 | 阶段阈值 66%/33% → 已决 MVP 2 阶段 @50%；3 阶段+特殊技 Phase-2 | 同上 |
| 同 | §⑦ 验收 | 「BOSS 三阶段可完整触发」→「MVP：BOSS 二阶段（@50%）可完整触发（三阶段归 Phase-2）」 | 同上 |
| 同 | §⑧ 开放问题 | 新增 Phase-2 待办块（D1 列其中） | 拍板项 5（D1） |
| `design/gdd/dungeon.md` | §⑥ 平衡初值 | 深层 BOSS 行补【已决·主理人推荐】MVP BOSS 2 阶段 @50%，3 阶段+特殊技 Phase-2（指向 combat §⑥） | 拍板项 2 |
| `design/gdd/systems-index.md` | §3 已决项 | 新增第 6 项：BOSS 阶段（MVP）2 阶段 @50% | 拍板项 2 |

### 1.3 拍板项 3：精英率 —— 保持 15%

| 文件 | 段 | 改动 | 依据 |
|---|---|---|---|
| `design/gdd/spawning.md` | §② 精英 | 标注【Phase-2 待办（D7）】MVP 固定 15% 直配（dungeonGen），刷怪点级联掷骰归 Phase-2 | 拍板项 3+5（D7）；dungeonGen.ts:112 |
| 同 | §⑥ 平衡初值 | `eliteChance ≈ 5%` → `eliteChance = 15%`（已决·主理人推荐：保持实现，掉装向 MVP 更合适）；注明 concept §7.3 5% 为早期草图 | 拍板项 3；N3 |
| 同 | §⑦ 验收 | 概率统计 5%（±0.5%）→ 15%（±1%） | 拍板项 3 |
| 同 | §⑧ 开放问题 | 新增 Phase-2 待办块（D4/D7） | 拍板项 5 |
| `design/gdd/systems-index.md` | §3 已决项 | 新增第 7 项：精英率 15%（concept §7.3 早期草图 5% 作废） | 拍板项 3 |

### 1.4 拍板项 4：格挡时长 200ms → 250ms（已决）

- 与拍板项 1 同落点：`combat.md` §②§⑥、`systems-index.md` §3 共享常量表（见 1.1 末两行）。GDD 保留 200ms 设计意图但显式指向 ADR 250ms 量化，避免再次误判为漂移。

### 1.5 拍板项 5：「GDD 有代码没有」8 项 → Phase-2 backlog 标注（原文保留，仅加标注）

| # | 项 | 落点（对应 GDD 段） |
|---|----|--------------------|
| D1 | BOSS 特殊技 / 三阶段 | combat.md §②§⑥§⑦§⑧、dungeon.md §⑥ |
| D2 | telegraph 预警实体 | combat.md §⑧（有 schema + `MIN_TELEGRAPH_TICKS=8`，缺 world 生成 + 快照下发） |
| D3 | 格挡硬直 300ms + 反伤 | combat.md §②§⑥§⑧（MVP 仅减伤 0.6） |
| D4 | 仇恨表 + 安全区不可被锁定 | combat.md §②、spawning.md §②§⑧、movement.md §② |
| D5 | 掉率保底（50 次无金 → 金权重 ×3） | loot.md §②§⑥（MVP 纯单掷、无 pity） |
| D6 | 连招 +20% | combat.md §⑥§⑧（雏形不强制、MVP 不实现） |
| D7 | 精英掷骰 | spawning.md §②§⑥§⑧（MVP 固定 15% 直配） |
| D8 | 点目标格移动 | movement.md §②、ux-spec.md §2（`targetTile` 已声明未接线） |

> 全部**不删原文**，仅在对应段落追加「**【Phase-2 待办（D#）】**」标注；combat/spawning §⑧ 各加一段汇总块便于追溯。

### 1.6 拍板项 6：UX 缺字段 6 项 → C1 浏览器客户端的设计侧输入

| 文件 | 段 | 改动 | 依据 |
|---|---|---|---|
| `design/ux-spec.md` | §7 开放问题 | 新增「浏览器客户端缺字段（C1 设计侧输入，已决）」占位：MVP 用现有快照字段 `hp/maxHp/pos/skillCd/parryState/loot/entrance/phase` 渲染；6 项缺字段（attrs / zone·inSafeZone / 词缀定义表 / bossPhase / telegraph 数据源 / co-op 名牌）Phase-2 补 | 拍板项 6；design-review-s1 §3 |
| `design/ux-spec.md` | §2 输入映射 | 左键点目标格标注 Phase-2 待办（D8） | 拍板项 5（D8） |
| `production/design-review-s1.md` | 末尾新增 §6 收口 | O3 已修（工程侧）、N1/精英率/格挡已决回填、UX 缺字段→C1 输入、遗留待裁定项 | 拍板项 6 + 交付 3 |

---

## 2. 主理人拍板记录（已定，直接落档）

| # | 决策 | 拍板值 | 落档文件 |
|---|------|--------|----------|
| P1 | 格挡窗口公式 | `windowEndTick = tick + PARRY_TICKS - 1`（闭区间恰 3 tick = 250ms） | ADR-JH-ENG-01、jianghu-architecture、combat、systems-index |
| P2 | BOSS 阶段（MVP） | **2 阶段 @50% hp**；3 阶段（66%/33%）+ 特殊技归 Phase-2 | combat、dungeon、systems-index |
| P3 | 精英率 | **保持 15%**（掉装向 MVP 更合适）；concept 5% 为早期草图 | spawning、systems-index |
| P4 | 格挡时长 | 200ms 设计意图 → 服务端 `PARRY_TICKS=3` = **250ms**（指向 ADR） | combat、systems-index |
| P5 | 「GDD 有代码没有」8 项 | 全部标 **Phase-2 backlog**（不删原文） | combat、spawning、loot、movement、dungeon、ux-spec |
| P6 | UX 缺字段 6 项 | 标 **C1 浏览器客户端的设计侧输入**；MVP 用现有快照字段渲染，缺字段 Phase-2 补 | design-review-s1 §6、ux-spec §7 |

---

## 3. Phase-2 backlog 汇总（Sprint 1 明确不实现 / 延后）

| ID | 项 | 现状（MVP） | Phase-2 目标 | 关联 GDD |
|----|----|------------|--------------|----------|
| D1 | BOSS 三阶段 + 特殊技 | 2 阶段 @50%（攻击提速） | 3 阶段（66%/33%）+ 特殊技（CD 8–12s） | combat / dungeon |
| D2 | telegraph 预警实体 | schema + 常量就绪，无数据源 | world 生成 + 快照下发（P3 支柱） | combat |
| D3 | 格挡硬直 300ms + 反伤 | 仅减伤 0.6 | 减伤 + 硬直 + 反伤（P3 格挡反击补全） | combat |
| D4 | 仇恨表 + 安全区不可被锁定 | 最近存活玩家接触攻击；无 threat/inSafeZone | threat 表、锁定最高威胁、安全区豁免（P1 co-op） | combat / spawning / movement |
| D5 | 掉率保底 | 纯单掷、无 pity | 连续 50 次无金 → 金权重 ×3（护 P5） | loot |
| D6 | 连招 +20% | 不实现 | 有序技能触发额外效果（操作深度） | combat |
| D7 | 精英掷骰 | 固定 15% 直配 | 刷怪点级联 eliteChance 掷骰 | spawning |
| D8 | 点目标格移动 | 仅方向步进 | `targetTile` 接线 + 寻路插值 | movement / ux-spec |
| C1-1..6 | UX 缺字段 6 项 | 用现有快照字段渲染 | attrs / zone·inSafeZone / 词缀定义表 / bossPhase / telegraph / 名牌接口 | ux-spec §7 |

---

## 4. 遗留待主理人再裁定 / 后续跟进

1. **concept.md §7.3 的 `eliteChance ≈ 5%`**：本次按拍板未改 concept（以 GDD 15% 为准）；建议后续 concept 刷新时同步，避免双源再漂移。
2. **I1 `SIGNAL` 保留字**（types.ts:159，ux-spec 未登记）：与 O7 建议一并待 ux-spec 输入表定稿处理，不在本轮回填范围。
3. **N5/N6 低危项**（复活间隔 30–60s vs 固定 30s、capacity 6–10 vs 无字段）：本次未回填（语义近似、量级一致），如主理人要求严格一致可再回填。
4. **C1/C2/C3/C4/C5/C6/C12 控制清单补勾**（qa-review-s1 §2 勾选滞后）：工程治理项，建议主理人核对补勾，不属设计回填。
5. **F1 拾取→背包接线**：qa-review-s1 §6 engineering-lead 补记已闭合（含测试 123/123），本回填不涉及。

---

## 5. 交付物

- 修改文档（9 个）：`design/gdd/{combat,spawning,dungeon,loot,movement,ux-spec,systems-index}.md`、`docs/architecture/adr/ADR-JH-ENG-01.md`、`docs/architecture/jianghu-architecture.md`、`production/design-review-s1.md`（追加 §6 收口）。
- 本清单：`production/s1-review-backfill.md`。
- 未改代码、未 commit；可用 `git diff` 复核。
