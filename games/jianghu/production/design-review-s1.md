# 江湖（jianghu）· Sprint 1 收口设计侧双评审报告（design-review-s1）

> 评审者：design-strategist（文策渊）　|　日期：2026-08-07　|　范围：E1–E5 + 垂直切片 playtest
> 方式：**只读**——对照 `design/gdd/{combat,spawning,loot,movement,dungeon,systems-index}.md`、`design/ux-spec.md`、`design/concept.md` 与 `apps/jianghu/sim-core/src/{constants,world,combat,spawning,loot,parry,dungeonGen,movement,types}.ts`、`production/playtest-core-loop-report.md`；数值以代码为准反向核对 GDD。**未改动任何代码/设计文档，未 commit**（仅落盘本报告）。

---

## 0. 总判定：**CONCERNS**

核心循环**机械实现与设计高度一致**（TICK_RATE/BASE_SPEED/格挡服务端时间窗/技能 CD/掉装/随机副本 seed 全部落地且 playtest 实测吻合），**非 FAIL**；但存在 **4 处数值漂移（BOSS 阶段、格挡窗口 200→250ms、格挡有效覆盖 333ms off-by-one、精英概率 5%→15%）、P3「格挡反击/telegraph 预警」只实现一半、客户端渲染缺 6 类字段**，须在下一里程碑（浏览器客户端）之前解决，故不判 PASS。

---

## 1. 数值一致性抽查

### ① GDD 有、代码没有（设计承诺未落地）—— 8 项

| # | 项 | GDD 出处 | 代码现状 | 判定 |
|---|----|----------|----------|------|
| D1 | BOSS **三阶段**（阈值 66%/33%）+ 特殊技（CD 8–12s） | combat§⑥ L56 / §⑦ L66 验收「三阶段可完整触发」 | 仅单阈值 `BOSS_PHASE_THRESHOLD=0.5` → 二阶段（constants.ts:191、world.ts:587-596）；无第 3 阶段、无特殊技 | **must-fix** |
| D2 | telegraph 预警实体（P3 可读下界 `MIN_TELEGRAPH_TICKS=8`） | combat§②、constants.ts:62 | 仅常量 + `TelegraphState` schema（types.ts:81）；world.step **从不生成** telegraph 实体、snapshot 不携带 | **must-fix**（P3） |
| D3 | 格挡硬直 300ms + 反伤 | combat§②·§⑥「减伤 + 硬直/反伤」 | `resolveDamage` 仅减伤 0.6；`EntityStatus.STUN` 从未置位、无反伤 → P3「格挡反击」只做了一半 | must-fix（P3） |
| D4 | 仇恨表 / 锁定最高威胁 + 安全区不可被锁定 | combat§②、spawning§②·§⑤、movement§② | 敌人按「最近存活玩家」接触攻击（world.ts:450-461），无 threat 表；SpawnZone 无 zone 字段、`inSafeZone` 从未计算 | 观察（P1 co-op 缺口） |
| D5 | 掉率保底（连续 50 次无金 → 金权重 ×3） | loot§⑥ L55 | `rollLoot` 纯单掷，无 pity 计数（护 P5 承诺缺失） | 观察 |
| D6 | 连招 +20% | combat§⑥「雏形」 | 未实现（combat§⑧ 已标注 Phase-2 定深度，可接受） | 观察 |
| D7 | 精英概率掷骰（≈5%） | spawning§⑥·§⑦ L53/L60 | `SpawnZone.tier` 由调用方直接指定、无掷骰；dungeonGen 固定 15%（见 N3） | 观察 |
| D8 | 点目标格移动 / 寻路插值（左键点目标格） | ux-spec§2「左键点目标格」 | `InputCmd.targetTile` 已声明（types.ts:172）但 world.step MOVE 仅用 `cmd.dir`，未接线 | 观察 |

（另：技能前摇禁止/减速移动 combat§⑤ —— SKILL 为瞬时、无移动约束，归 D8 同档，MVP 可延后。）

### ② 代码有、GDD/UX 没写（实现超纲 / 未文档化）—— 5 项

| # | 项 | 代码位置 | 说明 |
|---|----|----------|------|
| I1 | `InputAction.SIGNAL=6` | types.ts:159 | ux-spec 输入表未列；world.step 忽略（保留字，无行为）→ 需在 ux-spec 登记或移除 |
| I2 | 普通怪基础值 `ENEMY_BASE_HP=30` / `ENEMY_BASE_ATK=8` / `PLAYER_MAX_HP=100` | constants.ts:156-162 | GDD 只给倍率（×3/×10）未给基数，代码定为 30/8/100（playtest bossHp=300 即 30×10） |
| I3 | 地面掉落 TTL 数值 = 1800 tick（150s） | constants.ts:149 | GDD 只说「TTL 自动消失」未给数值 |
| I4 | 8 向移动 + 斜向 √2/2 归一化 | movement.ts:16-25 | GDD/ux 仅说「网格步进」，未定义 8 向与斜向速度 |
| I5 | 副本内精英率 15% | dungeonGen.ts:112 | GDD 无此数值，且与 spawning 5% 冲突（见 N3） |

### ③ 数值不一致（同一实体 GDD vs 代码）—— 4 项主 + 2 项低危

| # | 项 | GDD | 代码 | 性质 |
|---|----|-----|------|------|
| N1 | BOSS 阶段阈值 / 阶段数 | 66% / 33%（三阶段，combat§⑥） | 0.5（二阶段，constants.ts:191） | **must-fix**：阶段数+阈值双漂移；playtest 实证 phase 首现 hp=120<150（bossHp=300） |
| N2 | 格挡窗口 | combat§⑥ / systems-index§3 写 **200ms** | `PARRY_TICKS=3`=250ms（constants.ts:49，R2a 已裁决并注释） | 文档滞后：ADR/sprint-plan 已更新，GDD 未回填 |
| N3 | 精英概率 | spawning§⑥ **5%**（concept§7.3 同源 5%） | dungeonGen **15%** | 需裁定：副本内有意加密则回填 GDD，否则改回 5% |
| N4 | 格挡**有效**覆盖时长 | 声称 250ms（3 tick） | 实际 **333ms**：`openParryWindow` 置 `windowEndTick=tick+PARRY_TICKS`（parry.ts:38），`judgeParry` 判 `applicationTick<=windowEndTick`（parry.ts:32）→ 覆盖 t..t+3 共 4 tick；且 world.step 同 tick 先处理 PARRY 再结算敌人攻击（world.ts:373→447） | **must-fix off-by-one**：250ms→333ms，逼近 combat§⑧ 红线「格挡无敌帧过长」；建议 `windowEndTick=tick+PARRY_TICKS-1` 或按 333ms 正式文档化 |
| N5 | 刷怪复活间隔 | spawning§⑥ `30–60s`（区间） | `DEFAULT_RESPAWN_TICKS=30*TICK_RATE`（固定 30s 下限，constants.ts:197） | 低危：量级一致、语义收窄 |
| N6 | 刷怪点容量 | spawning§⑥ `capacity=6–10` | 无 capacity 字段；仅 zone 全清才复活（world.ts:524），有效容量=count（副本 2–4） | 低危：语义近似、数值不同 |

### ✅ 一致项（抽查全部通过）

TICK_RATE=12 / BASE_SPEED=4→CELLS_PER_TICK=0.333 格/tick（playtest 实测 16px/tick=15.99）✅ ｜ PARRY_REDUCTION=0.6 ✅ ｜ MIN_TELEGRAPH_TICKS=8=666ms ✅ ｜ HP_MULT 1/3/10（playtest bossHp=300）✅ ｜ DROP_RATE 0.3/1.0/1.0 ✅ ｜ 稀有度权重 normal 60/30/9/1、elite 0/40/45/15、boss 0/0/55/45 ✅ ｜ AFFIX_COUNTS 白0-1/蓝2/金3-4/暗金[5,5]=4+1 ✅ ｜ SKILL_CD 槽位 36/56/76/96 tick，3~8s 范围 ✅ ｜ SKILL_RANGE=72px=1.5tile ✅ ｜ LOOT_GROUND_TTL=1800 ✅ ｜ INVENTORY_CAP=60 ✅ ｜ 入口冷却 10s / 实例寿命 30min ✅ ｜ 副本 rooms 5-12 / maxDepth=3 / 密度×1.5 / BOSS 置最深层 ✅ ｜ INTERP_DELAY_MS=100 ✅ ｜ seed=hash(serverTick+entranceId+partyTag)（fnv1a64，快照不含 seed）✅ ｜ 死亡复活 RESPAWN_POS=(768,720) ✅ ｜ 4 项 RESOLVED（R2 无回滚、游客不合并、背包溢出 TTL、last-wins）均已落地 ✅

---

## 2. 玩法意图核对（结合 playtest 实测）

| 设计意图 | 实现核对 | 结论 |
|----------|----------|------|
| 网格步进手感 0.333 格/tick + 100ms 插值 | px 连续积分 + `INTERP_DELAY_MS=100` 常量；playtest ② 实测 16px/tick、3 tick/格 | ✅ 常量与服务端移动一致；**100ms 插值手感无客户端验证**（playtest §4#1，留给浏览器里程碑） |
| 格挡 250ms 服务端时间窗校验（无回滚） | parry.ts 纯函数 + world 按 tick 校验，符合 R2 裁决（无全量回滚）；**但实际有效覆盖 333ms**（N4）且缺硬直/反伤（D3） | ⚠️ 骨架对、数值 off-by-one、反击未落地 |
| 3–4 技能 CD（3–8s） | 4 槽独立 CD 36–96 tick + 服务端 CD 闸门（C11） | ✅ |
| BOSS 阶段 | 二阶段（50% 阈值 + 攻击提速 12→6 tick），非设计三阶段（66%/33%） | ⚠️ N1 |
| 词缀掉装 | 掉率/权重/词缀数全对齐；playtest 金(rarity=2, affixes×3)/暗金(rarity=3, affixes×5)/ttl=1800 实测吻合；缺保底（D5）、词缀仅有 id 无定义表（见 §3） | ✅ 主体一致 |
| 随机副本（seed 服务端权威/成员锁定/BOSS 置最深层/出本归位） | instanceSeed 服务端派生、members 锁定（C-Dgn-2）、100 次 BOSS 置深 0 异常、出本回 (768,720) 实测 | ✅ 全落地 |

---

## 3. UX 流核对 + 客户端缺字段清单

**输入映射（ux-spec§2 → 服务端动作）**：MOVE(dir) ✅ ｜ PARRY ✅（250/333ms 窗口）｜ SKILL1-4 + skillSlot ✅ ｜ SIGNAL ⚠️（ux 未定义、服务端忽略）｜ 左键点目标格 ❌（targetTile 未接线）。

**HUD 所需字段在 `EntityState`/快照的覆盖**：

| UX 元素（ux-spec§1） | 所需字段 | 快照现状 | 结论 |
|----------------------|----------|----------|------|
| 血条 HP | hp / maxHp | ✅ 全量下发 | OK |
| 体条 VIT / 属性面板 | attrs(str/dex/vit) | ❌ **schema 声明但 world 从不填充**（world.ts actor 无 attrs，snapshot 不含） | **缺字段** |
| 技能栏 CD | skillCd[4] | ✅ 下发并递减 | OK |
| 格挡状态 | parryState + status(PARRY_ACTIVE) | ✅ | OK |
| 小地图分区色块 | zone / inSafeZone / MapZone | ❌ 快照无分区字段，客户端无法渲染暖色安全区 / DANGER 8% | **缺字段** |
| co-op 名牌 | 显示名（userId/name） | ⚠️ 只有 ownerId(seatId)，名字需另接口（join/room 元数据） | 缺接口 |
| 掉装飘字 / tooltip 词缀 | 词缀名称/数值 | ❌ 快照只有 affix id（1..64），**无词缀定义表**（id→key/数值区间），tooltip 无法渲染 | **缺数据表** |
| BOSS 阶段 | bossPhase | ❌ world 内部有（world.ts:110），**快照与协议均未下发** | **缺字段** |
| 入口（裂隙） | entrance(cooldown/lastUsedTick) | ✅ | OK |
| 预警（P3） | telegraph | ❌ schema+编码支持，但 world 不生成、快照不携带 | **缺数据源** |
| 稀有度配色 | rarity 索引 0-3 | ✅ 有索引；需 RARITY_NAMES+色板映射（可 codegen） | 需接口 |
| 死亡复活 | hp 重置 + pos 变化 | ✅ 快照 diff 可推 | OK |

**缺字段清单（直接影响下一步浏览器客户端渲染）**：
1. **attrs**（STR/DEX/VIT 体条、属性面板）——数据面无；需 world 回填或走 join 控制面 CharacterSnapshot。
2. **地图分区/安全区数据**（小地图暖色/DANGER 8%、inSafeZone）——快照无 zone 字段。
3. **词缀定义表**（affix id → 名称/数值/类型）——sim-core 只有 id 池，无表。
4. **bossPhase**——未序列化。
5. **telegraph**——有 schema 无数据源，P3 预警渲染无米下锅。
6. **co-op 名牌名字**——需 seatId→显示名映射接口。

---

## 4. OBS 观察项（分级）

- **O1 must-fix（文档一致性）**：N1（66%/33% vs 50%）、N2（200ms vs 250ms）、N3（5% vs 15%）三处 GDD/代码漂移回填或正式裁定——尤其 N1 涉及阶段数，需与工程确认「按 GDD 补三阶段」还是「改 GDD 为二阶段」。
- **O2 must-fix（P3 支柱）**：telegraph 数据源缺失（D2）——浏览器客户端里程碑前，world 需生成 telegraph 实体并随快照下发（二进制编码已就绪，只欠数据）。
- **O3 must-fix（手感/平衡红线）**：格挡 off-by-one（N4）使有效窗口 250→333ms，逼近 combat§⑧「格挡无敌帧过长废技能」红线；需改 `windowEndTick=tick+PARRY_TICKS-1` 或正式按 333ms 文档化，并在真浏览器试玩验证。
- **O4 建议**：attrs 回填快照或明确「体条走 join 控制面」二选一，避免客户端双通道猜谜。
- **O5 建议**：词缀定义表（id→key/数值区间/是否专属）落 sim-core 或共享 JSON（constants 同份/codegen 约定已具备），供 tooltip 与绿升红降对比。
- **O6 观察**：格挡反伤/硬直（D3）、仇恨（D4）、保底（D5）、连招（D6）、点目标格（D8）、技能前摇移动约束 均为设计承诺未落地——MVP 可放 Phase-2，但需在对应 GDD §⑧ 显式标注「Sprint 1 不实现」，避免验收误判。
- **O7 观察**：`SIGNAL` 保留字需在 ux-spec 输入表登记；`SKILL_CD_BY_SLOT` 注释 5.6s/7.6s 与实际 56/76 tick=4.67s/6.33s 不符（代码注释笔误，范围 3–8s 不破）。
- **O8 nit（验证报告精度）**：playtest 报告④列「affixes∈[0,5]」与实现实际 affix id∈[1,64]（loot.ts:61、AFFIX_ID_MAX=64）表述不符——应为词缀数校验，建议修正报告注释避免误导。

---

## 5. 下一里程碑（浏览器客户端）设计侧输入（按 ux-spec 走查）

1. **共享常量消费**：按 E2 约定「同份/codegen」出 `RARITY_NAMES / AFFIX_COUNTS / SKILL_DAMAGE / SKILL_CD_BY_SLOT / 稀有度权重 / 词缀定义表` 为客户端静态 JSON——这是 HUD、tooltip、飘字的唯一数据源。
2. **数据面补字段**（§3 清单 1/2/4/5）：attrs、zone、bossPhase、telegraph 四项——协议二进制编码已支持 attrs/telegraph（protocol-binary.ts），需 world.snapshot 补填；zone/bossPhase 需新增编码。
3. **控制面补接口**：co-op 名牌名字映射（seatId→displayName）走 join/room.snapshot；死亡提示可复用快照 hp/pos diff。
4. **输入**：先落地 MOVE(dir)/PARRY/SKILL1-4（服务端已就绪）；SIGNAL 与点目标格待 ux-spec 定稿后接线。
5. **手感验证**：100ms 插值 + 格挡窗口（当前实际 333ms，N4/O3）需真浏览器+真人试玩——若格挡过宽废技能（combat§⑧ 红线），缩 `windowEndTick` 或加后摇。
6. **可访问性**：稀有度「颜色+星标」双编码（ux-spec§5）依赖词缀/稀有度元数据（O5），美术色板对齐 art-bible。

---

## 附：证据引用
- 阶段阈值/三阶段：`design/gdd/combat.md` L56/L66；`sim-core/src/constants.ts` L190-194；`sim-core/src/world.ts` L587-596；`production/playtest-core-loop-report.md` L41（hp=120<150）。
- 格挡窗口：`design/gdd/combat.md` L56、`design/gdd/systems-index.md` L46（200ms）；`sim-core/src/constants.ts` L48-49（PARRY_TICKS=3）、`sim-core/src/parry.ts` L30-38（含起始 tick 的 333ms 覆盖）。
- 精英概率：`design/gdd/spawning.md` L53/L60、`design/concept.md` L192（5%）；`sim-core/src/dungeonGen.ts` L112（15%）。
- 缺字段：`sim-core/src/world.ts` L601-650（snapshot 无 attrs/bossPhase/telegraph/zone）；`sim-core/src/types.ts` L96-134（schema 已声明）。
- 数值一致：playtest ②④⑥⑦⑦c⑧ 实测 16px/tick、rarity/ttl、bossHp=300、出本 (768,720)。

---

## 6. 收口（2026-08-07 · 主理人拍板后文档回填，docs-only）

> 本收口为双评审（design-review-s1 + qa-review-s1）后的**文档回填记录**：以代码为权威源反向同步设计/架构文档。**未改任何代码、未 commit**。详细回填清单与逐项落点见 `production/s1-review-backfill.md`。

### ① O3 格挡 off-by-one —— 工程侧已修（本报告原 N4/O3）
- **工程侧（O3 已修）**：`sim-core/src/parry.ts` `openParryWindow` 现返回 `windowEndTick = tick + PARRY_TICKS - 1`（parry.ts:41），`judgeParry` 判 `applicationTick <= windowEndTick`（parry.ts:35）→ 窗口为闭区间恰 **3 tick = 250ms**，不再 333ms。
- **文档侧回填**：`ADR-JH-ENG-01.md` §1/L§4 与 `jianghu-architecture.md` §3（L82）的旧公式 `tick+PARRY_TICKS` 已改为 `tick+PARRY_TICKS-1`；`combat.md` §⑥ 与 `systems-index.md` §3 共享常量表同步。

### ② N1 / N3 精英率 / N2 格挡时长 —— 已决回填
- **N1 BOSS 阶段（已决·主理人推荐）**：MVP 保持 **2 阶段 @50% hp**（`BOSS_PHASE_THRESHOLD=0.5`；playtest 实证 phase 首现 hp=120<150=50% 阈值）。3 阶段（阈值 66%/33%）+ 特殊技归 Phase-2（D1）。回填：`combat.md` §②§⑥§⑦、`dungeon.md` §⑥、`systems-index.md` §3 已决项。
- **N3 精英率（已决）**：保持实现 **15%**（掉装向 MVP 更合适）。回填：`spawning.md` §②§⑥§⑦；concept §7.3 的 5% 为早期草图、以 GDD 为准（遗留待后续 concept 刷新）。
- **N2 格挡时长（已决）**：200ms 设计意图 → 服务端 `PARRY_TICKS=3` = 250ms（ADR-JH-ENG-01 §2 R2a）。回填：`combat.md` §②§⑥、`systems-index.md` §3 共享常量表。

### ③ 「GDD 有代码没有」8 项 —— Phase-2 backlog 已标注（原文保留，仅加标注）
| # | 项 | 落点（对应 GDD 已标「Phase-2 待办」） |
|---|----|--------------------------------------|
| D1 | BOSS 特殊技 / 三阶段 | combat.md §②§⑥§⑦§⑧、dungeon.md §⑥ |
| D2 | telegraph 预警实体 | combat.md §⑧（缺 world 生成 + 快照下发） |
| D3 | 格挡硬直 300ms + 反伤 | combat.md §②§⑥§⑧ |
| D4 | 仇恨表 + 安全区不可锁定 | combat.md §②、spawning.md §②§⑧、movement.md §② |
| D5 | 掉率保底（50 次×3） | loot.md §②§⑥ |
| D6 | 连招 +20% | combat.md §⑥§⑧ |
| D7 | 精英掷骰 | spawning.md §②§⑥§⑧（MVP 固定 15% 直配） |
| D8 | 点目标格移动 | movement.md §②、ux-spec.md §2 |

### ④ UX 缺字段 6 项 —— 标注为 C1 浏览器客户端的设计侧输入（已决）
MVP 用现有快照字段 `hp / maxHp / pos / skillCd / parryState / loot / entrance / phase` 渲染；缺字段 **Phase-2 补**：`attrs`（数据面）／`zone`·`inSafeZone`／词缀定义表／`bossPhase` 序列化／`telegraph` 数据源／co-op 名牌（seatId→displayName 接口）。`ux-spec.md` §7 已加占位说明，`design-review-s1` §3 缺字段清单即 C1 输入依据。

### ⑤ 遗留待主理人再裁定 / 后续跟进
- **concept.md §7.3 仍保留早期草图 `eliteChance ≈ 5%`**（本次未改，按拍板以 GDD 15% 为准）——建议后续 concept 刷新时同步，避免再被双源误判。
- **I1 `SIGNAL` 保留字**：ux-spec 输入表尚未登记，与 O7 建议一并待 ux-spec 定稿处理（不在本轮回填范围）。
- **C1 缺字段清单编号**：本报告 §3 清单 1–6 即 §5「下一里程碑设计侧输入」第 2 项的明细，浏览器客户端里程碑开工时直接引用。
