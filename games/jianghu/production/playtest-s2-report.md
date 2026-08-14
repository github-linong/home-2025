# Sprint 2 综合 Playtest 报告（Phase 6 打磨第一轮）

路径：`production/playtest-s2-report.md`
作者：严守真（quality-lead / QA 主程）｜ 状态：已落盘
范围：E1–E33（核心循环 + 装备/强化/药水/分解/套装 + 3 副本变体 + 3 BOSS + 3 套装 + 新手引导 + 音效 + 美术补强 + 多人同本）
对齐：`design/gdd/dungeon-variants.md`（3 副本 / 3 BOSS / 3 套装的**设计数值**）、`production/playtest-core-loop-report.md`（E1–E5 playtest 报告模式）
约束：**只读 + 跑测试 + 出报告，未改任何运行时代码，未 commit。**

---

## 0. 总判定

> **CONCERNS（非阻塞，可进下一阶段，但 P1 项强烈建议在下一轮打磨前处理）**

- 验收门**全绿**：单元+golden **338/338**、typecheck **0 error**、核心循环 playtest **13/13**（golden `c378602b`）、E2E **46/46**。机械闭环无回归。
- 数值/平衡审计：3 BOSS 数值、3 副本密度/词缀倾向/石牢暗金权重、3 套装加成**与 design 高度一致（0 处数值崩坏）**。
- 存在 **3 处机制缺口**（均为 design 明确"锥形/环形"语义 vs 实现"圆形结算"、以及荒冢精英减速未落地）与 **1 处经济/主题交叉**（setIdForDrop），另含若干平衡隐患。这些属"打磨第一轮"应显式列出的非阻塞项，故判 **CONCERNS** 而非 FAIL。
- 无 FAIL 级阻塞（无数值崩坏 / 无破坏性缺陷 / 无 P0 崩溃）。

---

## 1. 测试证据（自跑验收 · 实测数字）

| 验收项 | 命令 | 实测 | 期望 | 判定 |
|---|---|---|---|---|
| 单元 + golden 全量 | `node --experimental-strip-types --test tests/*.test.ts sim-core/tests/unit/*.test.ts sim-core/tests/golden/*.test.ts` | **338 pass / 0 fail**（2.5s） | 338/338 | ✅ |
| 类型检查 | `npm run typecheck` | **0 error**（exit 0） | 0 error | ✅ |
| 核心循环 headless | `node --experimental-strip-types scripts/playtest-core-loop.mjs` | **13/13**，journal hash `c378602b622de61a0b2a5cdd2d09361bbb890b1f5715835d54a81339a22ccf61` | 13/13，golden `c378602b` | ✅ |
| 浏览器 E2E | `node verify-e2e.mjs --port 3012 --static 8091`（干净端口） | **46 pass / 0 fail** | 46/46 | ✅ |

> 复跑说明：E2E 用干净端口 `3012/8091` 避开 3011 旧状态，46/46 全绿；核心循环 playtest golden 与 Sprint 1 报告锁定的 `c378602b…` 字节级一致，D9 确定性无漂移。

---

## 2. 数值 / 平衡审计表（design vs 实测）

### 2.1 三 BOSS 数值 —— 全部一致 ✅

| 精英 | design 数值 | 实测（`sim-core/src/constants.ts`） | 判定 |
|---|---|---|---|
| 铁骨魁 | HP×1.2 / ATK×1.1；裂地重锤 96px ×1.5 | `ironbone: hpMult 1.2, atkMult 1.1, aoeRadius 96(2×TILE)`，`aoeDamageMult` 缺省 1.5（`constants.ts:671`） | ✅ |
| 幽冢鬼母 | HP×0.9 / ATK×1.2；鬼啸扇形 120px ×1.2 + SLOW；鬼爪 SLOW | `ghostmother: hpMult 0.9, atkMult 1.2, aoeRadius 120, aoeShape 2, aoeDamageMult 1.2, slowOnHit true`（`constants.ts:674-681`） | ✅ |
| 熔岩巨像 | HP×1.3 / ATK×1.3；环形 96px ×1.5；灼烧每秒 atk×0.3 | `magmacolossus: hpMult 1.3, atkMult 1.3, aoeRadius 96, aoeShape 0, aoeDamageMult 1.5, burnAoe{interval 6, telegraph 2, radius 72, mult 0.15}`（`constants.ts:684-697`） | ✅ |

实测推导（`spawning.ts:114-116`：`atk = round(ENEMY_BASE_ATK(8) × HP_MULT.boss(10) × atkMult)`）：
- 巨像 `atk = 8 × 10 × 1.3 = 104`；环形 `= 104 × 1.5 = 156`；灼烧 `= 104 × 0.15 = 16 / 0.5s ≈ 32/s`（design `atk×0.3 = 31/s`，取整一致）；拳击 `= 104`。

### 2.2 三副本 掉落 / 词缀倾向 / 密度

| 副本 | design | 实测 | 判定 |
|---|---|---|---|
| 石牢 密度 1.5 | 密度上调取 1.5（`dungeon-variants §1`） | `STONE_PRISON_SPAWN_DENSITY=1.5`（`constants.ts:611`） | ✅ |
| 石牢 BOSS 暗金↑ | 权重 [0,0,40,60] | `STONE_PRISON_BOSS_WEIGHTS=[0,0,40,60]`（`constants.ts:619`） | ✅ |
| 荒冢 减速词缀倾向 | moveSpeed(51-64)+reduction(23-30)↑ | `BARROW_AFFIX_BOOST_MULT=3` 作用于 id 23-30/51-64（`constants.ts:732,758-764`） | ✅ |
| 熔窟 爆发词缀倾向 | critChance(31-40)+atk(1-12)↑、attackSpeed 微升 | `MOLTEN_AFFIX_BOOST_MULT=3` + `MOLTEN_ATTACK_SPEED_BOOST_MULT=2`（`constants.ts:746-747,765-771`） | ✅ |
| 荒冢 密度 1.2 / 熔窟 密度 1.2 | 中等 | 均回退 `DUNGEON_SPAWN_DENSITY=1.2`（`dungeonGen.ts:100-106`） | ✅ |
| **荒冢 精英接触减速（减速词缀）** | §1 变体 B「精英 aggressive 且**接触攻击附带减速**」 | **未落地**：`BARROW_ENEMY_POOL=["shadow","shadow","savage"]`（`dungeonGen.ts:68`）复用现有原型，`ENEMY_TYPE_VARIANTS`（`constants.ts:669-698`）**无 shadow/savage/brigand 的 slowOnHit 登记** → 荒冢精英/普通敌人不施加 SLOW，仅 BOSS 幽冢鬼母 SLOW | ⚠️ 缺口 |

### 2.3 三套装加成 —— 全部一致 ✅

| 套装 | design | 实测（`affixes.ts:303-325`） | 判定 |
|---|---|---|---|
| 铁骨 | 2件 maxHp+30；3件 reduction+8% + maxHp+60（累计 +90） | 完全一致 | ✅ |
| 鬼影 | 2件 attackSpeed+8%；3件 moveSpeed+12% + attackSpeed+5%（累计 +13%） | 完全一致 | ✅ |
| 烈阳 | 2件 critChance+8%；3件 atk+20 + critChance+5%（累计 critChance+13%） | 完全一致 | ✅ |

### 2.4 setIdForDrop 归属 —— 一处主题交叉 ⚠️

实现（`constants.ts:796-808`）：铁骨=石牢 drop、鬼影=荒冢 drop、烈阳=熔窟 drop **+ 全部主题副本（石牢/荒冢/熔窟）BOSS 宝箱**。

- 铁骨/鬼影/烈阳「主产地」归属与 design §3 定位自洽 ✅。
- **偏差**：design §7 开放问题 3 建议「套装件在**对应主题副本 BOSS** 概率出」（即石牢 BOSS→铁骨、荒冢 BOSS→鬼影、熔窟 BOSS→烈阳）；实现取「全部主题 BOSS 宝箱 → **烈阳**」（`constants.ts:798-801`）。后果：
  1. 铁骨/鬼影**只能**靠各自副本普通/精英掉落获取，BOSS 宝箱不给本主题套装（获取面收窄）；
  2. 烈阳获取渠道最多（3 主题 BOSS 宝箱 + 熔窟掉落），且刷石牢/荒冢 BOSS 会拿到**烈阳**（非本主题），主题刷点闭环语义混乱；
  3. 经济不对称：烈阳 3 件显著比铁骨/鬼影更容易凑齐（BOSS 宝箱 3-5 件必含暗金）。

---

## 3. 机制一致性问题（带文件:行号）

### 3.1 减速（SLOW）语义 —— 与 design 一致，非 Bug ✅

- design §1/§2 明确语义是「**移速 -X%**」（`dungeon-variants.md:38,39`），未提攻速/技能 CD。
- 实现 `SLOW_MOVE_MULT=0.6`（`constants.ts:726`）**仅作用于移动**（`world.ts:938` 的 `slowMult` 仅乘进移动 `speedPerTick`，`world.ts:982/995/1121/1131`）；攻速（attackSpeed）/技能 CD 不受影响。
- SLOW 不叠加、到期 refresh（`world.ts:578-581` applySlow 重设 `slowUntilTick`），3s 短持续（`SLOW_TICKS=3×TICK_RATE`，`constants.ts:720`），符合 §6 红线「不叠加/短持续」。
- **结论**：move-only 是 design 本意，实现正确。若团队希望「减速」同时降攻速/CD，属 design 语义待澄清，非实现缺陷。

### 3.2 灼烧 telegraph（shape=1）与 BOSS 主 AOE 的渲染区分 —— 无硬 Bug，记录可读性 ⚠️

- 熔岩巨像自身两条 telegraph：环形 `shape=0`（`constants.ts:688`）、灼烧 `shape=1`（`constants.ts:695`）——**形状不同、半径不同（96 vs 72）**，客户端 `drawTelegraph`（`index.html:3489-3517`）按 shape 分支渲染（0=圆环描边 / 1=AOE 填充圆），**不混淆**。
- 交叉可读性：灼烧 `shape=1` 与 E15 默认 BOSS 主 AOE（铁骨魁/普通 BOSS 的 `shape=1`）视觉同类（红填充圆），跨 BOSS 仅靠半径区分；但巨像自身两 telegraph 形状已区分，无渲染冲突。
- **附带发现（可读性）**：灼烧 telegraph 前摇 `MAGMA_BURN_TELEGRAPH_TICKS=2`（167ms，`constants.ts:664`）**低于** P3 硬约束可读下界 `MIN_TELEGRAPH_TICKS=8`（666ms，`constants.ts:62`）→ 灼烧本质「踩上去即掉血」、几乎不可躲（见 §4 平衡）。

### 3.3 套装 + 强化（enchant）叠加顺序 —— 正确 ✅

- `computeEquipStats`（`affixes.ts:234-268`）：词缀值 = `round(affixValue(id,rarity) × (1 + 0.15×level))`（先含稀有度倍率，再×强化倍率，`affixes.ts:244-248`），套装加成在词缀汇总**之后**以 flat 叠加（`affixes.ts:259-266`），且**不受 enchant 放大**。
- 与任务期望「词缀×(1+0.15N) 后 + 套装」一致；套装作为独立 flat 加成、不随强化缩放，语义正确。

### 3.4 锥形 / 环形 服务端圆形结算 —— **已知缺口，记入** ⚠️（机制）

- `world.ts:1324`：telegraph 落刀统一 `Math.hypot(p - a) <= a.telegraph.radius` **圆形判定**，无视 shape（0 圆环 / 2 锥形）。
- 作者已在 `constants.ts:688` 自我标注「MVP 服务端仍圆形结算，几何差异由客户端渲染表达」——属**明示降级**，非隐藏 bug。
- 但影响平衡/机制（非纯视觉）：
  1. **环形（shape=0）**：design「内圈安全/外圈伤害，逼玩家贴脸」（`dungeon-variants.md:47`）。圆结算 → **圆心也吃满伤**，「内圈安全」counterplay 缺失；
  2. **锥形（shape=2）**：design「锥内命中」（120° 扇形，`dungeon-variants.md:39`）。圆结算 → 实为 **360° 全圆 120px**，且命中附 SLOW（`world.ts:1335`），失去「侧闪躲避」counterplay，实际难度远高于 design 定位。

---

## 4. 平衡建议（分级 P0/P1/P2）

| 级别 | 问题 | 建议 | 依据 |
|---|---|---|---|
| **P1** | 熔岩巨像环形 156 / 拳击 104 对 L1（100hp）**一击秒杀**，灼烧 32/s 约 3s 烧死，且熔窟（entrance 4）**无等级/进度门槛**，新手可直进被秒 | 给熔窟入口加最低等级/进度门槛（如 L≥N 或完成石牢/荒冢后开放）；或下调巨像 ATK 倍率 | `constants.ts:208` PLAYER_MAX_HP=100 vs 巨像 atk=104（§2.1 推导）；入口无门槛（`run-manager.ts:572-577`） |
| **P1** | 环形「内圈安全」未实现（圆结算）→ 配合灼烧形成**无安全区**（远距吃环形、近距吃灼烧） | 环形结算改为「内圈安全/外圈伤害」（服务端 ring 判定），与灼烧「贴脸惩罚」形成正确博弈 | `world.ts:1324` 圆结算 vs design §1 变体 C「内圈安全/外圈伤害，逼玩家贴脸」 |
| **P1** | 荒冢「减速词缀」（精英接触减速）未落地，减速主题只剩 BOSS 生效 | 为荒冢精英/普通敌人登记 slowOnHit 变体（`ENEMY_TYPE_VARIANTS` 增 shadow/savage 减速项），或明确降级并回填 design | `dungeon-variants.md:38` vs `constants.ts:669-698` 无 shadow 登记 |
| **P2** | setIdForDrop 主题交叉：全部主题 BOSS 宝箱→烈阳，铁骨/鬼影无 BOSS 宝箱来源 | 按 design §7 Q3 回填裁定：石牢 BOSS→铁骨、荒冢 BOSS→鬼影、熔窟 BOSS→烈阳；或接受现状并回写 design | `constants.ts:796-808` |
| **P2** | 灼烧 telegraph 前摇 167ms < 可读下界 666ms，不可躲 | 若保留 DOT 语义，灼烧应从「telegraph 前摇」改为显式「地面 DOT 区域」表达（避免与可躲 telegraph 语义混淆）；或拉长前摇到 ≥8 tick | `constants.ts:664` vs `constants.ts:62` |
| **P2** | 铁骨 3 件 maxHp+90（相对 100 基础 = +90%）防御成长陡 | 观察项：与暗金 maxHp 词缀（id22=50×2.4=120）同量级、未超词缀经济，但基础 HP 低放大相对占比；若主导策略再回调 | `affixes.ts:307-308` |

> 无 P0（无崩溃 / 无数值崩坏 / 无破坏性缺陷）。

---

## 5. 精英蓝怪化辨识度 / 强度匹配

- 精英（tier 1）统一渲染为「暗影刺客·钢蓝 tint + 常驻青环 + 王冠图标 + 文字『精英』」三重编码（`index.html:2809-2853, 2924, 3077-3078`），E2E `elite_blue` 钩子通过。
- 强度 `HP_MULT.elite=3`（90hp）/ `ATK` 同倍（24），尺寸仅 1.3×（34px vs 26px）——强度 3× 但尺寸不放大，**辨识度靠三重编码充分，强度/尺寸不匹配属轻微提示，不判 Bug**。

---

## 6. 结论与下一步

1. 验收门全绿，机械闭环（含多人同本、套装、强化、药水、分解、3 副本/3 BOSS）无回归，可进下一阶段。
2. 数值与 design 高度一致（BOSS/密度/掉落/套装 0 偏差），唯一数值级隐患是「熔窟无门槛 + 巨像 156 秒杀 L1」。
3. 机制侧 3 个 P1 缺口（环形圆形结算 / 锥形圆形结算 / 荒冢精英减速未落地）+ 1 个 P2 经济交叉（setIdForDrop）建议在下一轮打磨前由主理人裁定处理或回填 design。
4. 完整可执行数值建议见姊妹文档 `playtest-s2-balance.md`。

> 判定说明：无 FAIL 级阻塞；上述 P1 属「机制缺口 / 平衡隐患」而非「数值崩坏 / 破坏性缺陷」，故整体 **CONCERNS**。若主理人认定「环形/锥形圆结算」为阻塞性机制 Bug，可将该单项升级 FAIL。
