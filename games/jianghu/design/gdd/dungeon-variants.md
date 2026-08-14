# 内容扩展概念 · 副本变体 / 精英 BOSS / 装备套装（dungeon-variants）

> 作者：design-strategist（文策渊）　|　版本：v0.1（制作收尾 → 打磨）　|　关联：design/gdd/dungeon.md、combat.md、loot.md、spawning.md、systems-index.md；实现：sim-core/constants.ts、affixes.ts、dungeonGen.ts、world.ts
> 目标：在**不改动 dungeonGen 生成器核心**的前提下，用「配置/敌人类型/掉落权重/数值/技能」做内容扩展。每项标注**实现成本（低/中/高）**与**依赖现有能力**，供 engineering-lead 排序。本文件为设计概念，不写代码。

---

## 0. 现状盘点（可复用的既有能力，扩展的前提）

| 能力 | 现状 | 复用方式 |
|------|------|----------|
| 副本生成 | `dungeonGen.buildDungeonSpec(seed, biomeId)` **已接受 `biomeId`**，参与 `layoutRng` 派生（不同 biome 同 seed 布局不同）；`rooms∈[5,12]`、`maxDepth=3`、BOSS 置最深层 | 变体 = 新增 biome 枚举，让 biomeId 决定敌人池/BOSS 类型/掉落权重 |
| 敌人池 | `dungeonGen` 硬编码 `ENEMY_POOL=["savage","brigand","shadow"]`；BOSS 固定 `dungeon_boss` | 把 `ENEMY_POOL` 改为按 biome 查表（配置化） |
| 刷怪区 | `SpawnZone{pos,tier,enemyTypeId,count,respawnTicks,aggression,patrolTiles}` 已支持 tier/aggression/巡逻 | 变体直接改 SpawnZone 配置（密度/aggression/enemyTypeId） |
| BOSS 机制 | 2 阶段 @50% hp（`BOSS_PHASE_THRESHOLD=0.5`）；phase2 每 3s 生成 AOE telegraph（`shape=1` 填充，`TELEGRAPH_TICKS=12`(1s) 前摇，`TELEGRAPH_RADIUS=72px`，伤害=`atk×BOSS_AOE_DAMAGE_MULT(1.5)`）；近战接触攻击带前摇 `ENEMY_WINDUP_TICKS=5` | 精英/BOSS 变体 = 改数值 + 换 telegraph shape/radius/color，复用同一生成/结算路径 |
| telegraph 形状 | `TelegraphState.shape` 已定义 4 种：`0=圆环 / 1=AOE填充 / 2=锥形 / 3=线性`（当前仅用 `1`） | 特色技能映射到未用 shape，客户端 `drawTelegraph` 按 shape 分支渲染（成本低中） |
| 状态效果 | `EntityStatus` 已定义 `STUN(1)/SLOW(2)/PARRY_ACTIVE/IFRAME/DOWNED/WINDUP`；其中 `SLOW` 位**已定义未落地**（MVP 无减速 debuff） | 荒冢「减速词缀」= 激活 `SLOW` 位（低中成本） |
| 掉落权重 | `RARITY_WEIGHTS_BY_TIER{n,elite,boss}` + `DROP_RATE{n:0.3,e:1.0,b:1.0}` + `RARITY_VALUE_MULT[1,1.3,1.7,2.4]` | 变体专属掉落 = 按 biome 覆盖权重表（配置化，低中） |
| 词缀属性 | `AffixStat` 6 类：`atk(1-12)/maxHp(13-22)/reduction(23-30)/critChance(31-40)/attackSpeed(41-50)/moveSpeed(51-64)`，共 64 条 | 套装加成直接映射这 6 类；专属掉落倾向 = 按 biome 加权词缀 id 区间 |
| 装备槽 | `ITEM_PROTOS` 3 槽 `weapon/armor/trinket`（`itemProto(itemId)=itemId%3`）；`computeEquipStats` 纯函数汇总 | 套装 = 新增 `setId` 字段 + `computeEquipStats` 检测同套装件数 |

---

## 1. 副本变体（3 主题，复用 dungeonGen，不重写生成器）

> 三主题共用同一生成器，通过 `biomeId` 分派「敌人池 + 密度 + BOSS 类型 + 掉落权重」。

### 变体 A：石牢（Stone Prison）—— 高密度近战，暗金掉率↑
- **氛围文案**：铁链拖地、石壁渗水、昏黄火把摇曳；狭长牢房层层嵌套，压抑阴冷，尽头传来镣铐的闷响。
- **敌人构成**（复用 SpawnZone tier/aggression）：近战系敌人为主（`savage` 变体），**密度上调**（`DUNGEON_SPAWN_DENSITY` 本 biome 取 1.5，普通本 1.2），普通怪 `passive`（被打才反击）、精英 `aggressive`。
- **BOSS 特色技能**（对应 telegraph 形状）：**裂地重锤** —— `shape=1`(AOE填充)，`radius=96px`（比默认 72 大一圈），前摇 `TELEGRAPH_TICKS=12`(1s)，伤害 `atk×1.5`；惩罚站桩，逼走位。
- **专属掉落倾向**：暗金掉率↑（BOSS 权重 `[0,0,45,55]` 调为 `[0,0,40,60]`）；`atk`/`maxHp` 词缀（id 1–22）微升。
- **难度定位**：新手 → 进阶过渡（怪多但弱，练群伤技能「震地」与走位）。
- **实现成本：中**（biome 敌人池 + 密度 + 掉落权重表；无新机制）。

### 变体 B：荒冢（Barrow / Ghost Tomb）—— 幽灵精英，减速词缀
- **氛围文案**：荒坟磷火、青白鬼影游荡、雾瘴低垂；墓碑错落，亡者低语，脚步声会被吞没。
- **敌人构成**：幽灵系（`shadow` 变体）为主，精英 `aggressive` 且**接触攻击附带减速**（激活 `EntityStatus.SLOW`，移速 -X%，持续短）。
- **BOSS 特色技能**：**鬼啸扇形** —— `shape=2`(锥形)，`radius=120px`，前摇 12 tick(1s)，锥内命中附加减速 debuff（`SLOW`）。
- **专属掉落倾向**：`moveSpeed`(51–64) + `reduction`(23–30) 词缀掉率↑（克制「风筝」打法，鼓励堆减伤/移速反制减速）。
- **难度定位**：中高端（减速考验走位与格挡时机，对应 P3 格挡反击）。
- **实现成本：中**（激活 `SLOW` 位 + 锥形 telegraph 分支 + 词缀加权）。

### 变体 C：熔窟（Molten Cavern）—— 火主题 BOSS，持续灼烧地面
- **氛围文案**：岩浆裂隙贯穿、赤红火光映壁、焦土热浪蒸腾；脚下地面龟裂，热流从缝隙中喷涌。
- **敌人构成**：火系敌人（新增 `fire` 系原型），`aggressive`，密度中等（1.2）。
- **BOSS 特色技能**：**环形喷发** —— `shape=0`(圆环)，`radius=96px`，内圈安全/外圈伤害（逼玩家贴脸）；**灼烧地面** —— BOSS 在身周生成持续伤害区域（DOT，玩家停留持续掉血）。
- **专属掉落倾向**：`critChance`(31–40) + `atk`(1–12) 掉率↑，`attackSpeed`(41–50) 微升（爆发 build）。
- **难度定位**：高端（DOT 地面考验走位与持续输出，关底挑战）。
- **实现成本：高**（灼烧地面 = 新增持续 DOT 区域机制，需 world 新增区域实体/判定；环形 telegraph 本身低中）。

---

## 2. 精英 BOSS 变体（3 命名精英，复用 phase/telegraph/AOE，改数值/技能）

> 复用既有 BOSS 2 阶段 + telegraph 生成/结算路径，只改**数值/telegraph shape/radius/伤害/可格挡性**。可格挡性沿用现有规则：**近战接触攻击可格挡（parry 覆盖）；地面/远程 AOE telegraph 不可格挡**。

| 精英 | 所属主题 | 技能设计 | 前摇 | 范围 | 伤害 | 可格挡性 | 数值基调 | 成本 |
|------|----------|----------|------|------|------|----------|----------|------|
| **铁骨魁**（Ironbone Juggernaut） | 石牢 | ① 裂地重锤（`shape=1` AOE 填充）；② 近战挥击（复用接触攻击前摇 `ENEMY_WINDUP_TICKS=5`） | AOE 12 tick(1s)；挥击 5 tick(0.4s) | AOE 96px；挥击 48px | AOE `atk×1.5`；挥击 `atk×1.0` | 挥击可格挡；AOE 不可格挡 | HP×1.2 / ATK×1.1（偏肉，硬吃考验） | **低**（纯数值 + 换 radius） |
| **幽冢鬼母**（Wraith Matriarch） | 荒冢 | ① 鬼啸扇形（`shape=2` 锥形，命中附 `SLOW` 减速）；② 鬼爪（接触攻击） | 锥形 12 tick(1s)；鬼爪 5 tick | 锥形 120px；鬼爪 48px | 锥形 `atk×1.2`+减速；鬼爪 `atk×1.0` | 鬼爪可格挡；锥形不可格挡 | HP×0.9 / ATK×1.2（脆皮高伤，考验反应） | **中**（锥形 + SLOW 激活） |
| **熔岩巨像**（Magma Colossus） | 熔窟 | ① 环形喷发（`shape=0` 圆环，内圈安全）；② 灼烧地面（DOT 区域）；③ 拳击（接触攻击） | 环形 12 tick(1s)；拳击 5 tick | 环形 96px；拳击 48px | 环形 `atk×1.5`；DOT 每秒 `atk×0.3` | 拳击可格挡；环形/DOT 不可格挡 | HP×1.3 / ATK×1.3（关底定位） | **高**（环形 + DOT 地面新机制） |

> 数值均为**概念初值**，落地需与 `HP_MULT/ENEMY_BASE_HP(30)/ENEMY_BASE_ATK(8)` 及 `BOSS_PHASE2_ATTACK_INTERVAL_TICKS(6)` 联调（护 concept §8.2「BOSS 难度失衡」）。

---

## 3. 装备套装（3 件套，3 槽 weapon/armor/trinket）

> 3 槽对应 `ITEM_PROTOS`。套装加成映射到既有 `AffixStat` 6 类：`atk/maxHp/reduction/critChance/attackSpeed/moveSpeed`。
> **实现方式**（两种，推荐 A）：
> - **A（推荐）**：`InventoryItem`/`EquippedItem` 新增 `setId?: number` 字段；`computeEquipStats` 检测「同 setId 件数」→ 叠加套装加成。成本**中**（新字段 + 纯函数扩展，无世界副作用）。
> - **B（零新字段，降级）**：用「专属词缀 id 标识套装件」（在 `AFFIX_TABLE` 预留 id 段或新增 65+ 专属 id），判定靠「同时装备 N 件带同一专属 id」的 hack。成本**低**，但语义丑、占用词缀池。

| 套装 | 部位（weapon/armor/trinket） | 2 件加成 | 3 件加成 | 定位 | 映射属性 | 成本 |
|------|------------------------------|----------|----------|------|----------|------|
| **铁骨套装**（Ironbone） | 铁骨重剑 / 铁骨玄甲 / 铁骨护符 | `maxHp +30` | `reduction +8%`（+额外 `maxHp +60`） | 防御坦克，抗高密度石牢 | `maxHp` / `reduction` | 中 |
| **鬼影套装**（Wraith） | 鬼影短刃 / 鬼影轻甲 / 鬼影铃 | `attackSpeed +8%` | `moveSpeed +12%`（+`attackSpeed +5%`） | 攻速游走，反制荒冢减速 | `attackSpeed` / `moveSpeed` | 中 |
| **烈阳套装**（Blazing Sun） | 烈阳剑 / 烈阳袍 / 烈阳珠 | `critChance +8%` | `atk +20`（+`critChance +5%`） | 暴击爆发，熔窟 DPS 关底 | `critChance` / `atk` | 中 |

> 套装加成数值为**同量级保守值**（与词缀值域对齐，防主导策略红线）：2 件≈1 条金词缀强度，3 件≈1 条暗金词缀强度。

---

## 4. 实现成本汇总（供 engineering-lead 排序）

| 项 | 成本 | 依赖现有能力 |
|----|------|--------------|
| 精英① 铁骨魁 | **低** | BOSS phase + telegraph 改 radius/数值（纯配置） |
| 副本变体 A 石牢 | **中** | `biomeId` 敌人池/密度 + 掉落权重表 |
| 副本变体 B 荒冢 | **中** | `biomeId` + 激活 `EntityStatus.SLOW` + `shape=2` 锥形 telegraph |
| 精英② 幽冢鬼母 | **中** | 锥形 telegraph + `SLOW` |
| 装备套装 ×3 | **中** | 新增 `setId` 字段 + `computeEquipStats` 扩展（方案 A） |
| 副本变体 C 熔窟 | **高** | `biomeId` + 新增地面 DOT 区域机制 |
| 精英③ 熔岩巨像 | **高** | 环形 telegraph（低中）+ DOT 地面新机制 |

---

## 5. 依赖排序建议（给 engineering-lead）

```
① 精英①铁骨魁（纯数值，最低风险，验证 telegraph 复用）
   └─> ② 套装 setId 字段（affixes.ts 纯函数，独立无世界副作用，高价值）
         └─> ③ 副本变体 A 石牢（biomeId 配置化，验证 biome 体系）
               └─> ④ 副本变体 B 荒冢 + 精英②鬼母（激活 SLOW + 锥形 telegraph）
                     └─> ⑤ 副本变体 C 熔窟 + 精英③巨像（DOT 地面，放最后 / Phase-2）
```

---

## 6. 设计理论红线复核

| 红线 | 风险 | 缓解 |
|------|------|------|
| **主导策略** | 套装若过强 → 锁定单一 build；减速若可无限叠加 → 风筝流作废 | 套装加成与词缀同量级（§3 注）；`SLOW` 设上限/短持续，不叠加 |
| **经济失衡** | 石牢暗金掉率↑ → 通胀（无 sink 的老问题，见 loot §⑧） | 掉率上调幅度保守（60%→55% 仅 BOSS 档）；已有强化/分解 sink 承接 |
| **认知过载** | 3 副本 + 3 BOSS + 3 套装同时上线 → 新手轰炸 | 分阶段上线（先 A 后 BC）；副本入口用「裂隙异象漩涡」+ 名称区分（见 dungeon §②） |
| **支柱漂移** | 高密度副本变「互害」？ | 纯合作无 PvP 保持（concept 决策 A）；高密度护 P1 共闯（群伤「震地」价值凸显） |

---

## 7. 开放问题 / 待主理人裁定

1. **DOT 灼烧地面**是唯一需新增世界机制的高成本项，是否本期做，还是随副本 C 一起降级为 Phase-2？
2. **套装字段方案**：推荐 A（新增 `setId`，中成本、语义干净）；是否接受改动 `InventoryItem` 结构（需回填持久化/协议视图 `InventoryItemView`）？
3. **套装掉落来源**：套装件是否专属掉落（仅对应副本 BOSS/精英出）？建议「套装件在对应主题副本 BOSS 概率出 + 大图低概率」，形成主题刷点闭环——是否认可？
4. **专属词缀**：暗金「+1 专属」（loot §⑧ 遗留）是否与套装绑定，避免另起炉灶？
