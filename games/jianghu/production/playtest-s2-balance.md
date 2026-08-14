# Sprint 2 平衡调优建议清单（playtest-s2-balance）

路径：`production/playtest-s2-balance.md`
作者：严守真（quality-lead / QA 主程）｜ 状态：已落盘（配套 `playtest-s2-report.md`）
约束：只读审计，未改运行时代码。本清单给出**具体数值建议**，供主理人/文策渊/程基岩裁量后落地。

---

## 0. 建议总览

| 级别 | 项 | 一句话建议 |
|---|---|---|
| P1 | 熔窟门槛 / 巨像秒杀 | 熔窟加等级门槛；或巨像 ATK 1.3→1.15，环形 1.5→1.2 |
| P1 | 环形「内圈安全」缺失 | 环形改为真圆环结算（内圈免伤），与灼烧构成正确博弈 |
| P1 | 荒冢精英减速未落地 | 荒冢精英/普通登记 slowOnHit，SLOW 倍率对齐 0.6 |
| P2 | 灼烧不可躲 | 灼烧 0.15→0.12 或前摇 2→8 tick；或改显式 DOT 区域 |
| P2 | 铁骨 maxHp+90 | 观察项：可试 +90→+70（累计）若主导策略 |
| P2 | setIdForDrop 交叉 | 回填 design：BOSS 宝箱按主题归属（石牢→铁骨/荒冢→鬼影/熔窟→烈阳） |

---

## 1. 熔岩巨像（熔窟 BOSS）—— 新手秒杀风险

### 现状（实测推导）
- `PLAYER_MAX_HP=100`（`constants.ts:208`）；L1 玩家 100hp。
- 巨像 `atk = ENEMY_BASE_ATK(8) × HP_MULT.boss(10) × atkMult(1.3) = 104`。
  - 环形喷发 `104 × 1.5 = 156`（>100 → 一击秒）；
  - 拳击 `104 × 1.0 = 104`（>100 → 一击秒）；
  - 灼烧 `104 × 0.15 ≈ 16 / 0.5s ≈ 32/s`（3.1s 烧空 100hp）。

### 建议（任选或组合）
- **方案 A（推荐，门槛优先）**：熔窟入口（`run-manager.ts:572-577`，`biomeIdForEntrance` entrance 4）加**最低等级门槛**（如 L≥4，或「通关石牢/荒冢任一」进度门槛），对齐 design §1 变体 C「高端/关底」定位。门槛未达 → 拒绝 `dungeon.enter`（新 reason 如 `ENTRANCE_LEVEL_LOCKED`）。
- **方案 B（数值下调，若不加门槛）**：
  - 巨像 `atkMult 1.3 → 1.15`（atk 104→92，环形 138 仍偏高，但拳击 92 < 100 不再一拳秒）；
  - 环形 `aoeDamageMult 1.5 → 1.2`（环形 92×1.2≈110，仍近秒，建议配合方案 A）；
  - 灼烧 `MAGMA_BURN_DAMAGE_MULT 0.15 → 0.12`（32/s → 26/s，L1 可多撑 1 秒做出反应）。

> 定位提示：熔窟是「关底挑战」，高伤害属 design 本意；核心缺陷是**无门槛**让 L1 直接吃到关底伤害，优先加门槛而非无脑削数值。

---

## 2. 环形喷发「内圈安全」—— 机制补全

- 现状：`world.ts:1324` 圆结算，圆心与圆边同吃满伤；`constants.ts:688` 自标注圆形结算。
- 建议：环形（`shape=0`）落刀改为**圆环判定**：
  ```
  const d = Math.hypot(p.x - a.x, p.y - a.y);
  const hit = d <= R && d >= R * INNER_SAFE_RATIO;   // 内圈安全
  ```
  新增常量 `BOSS_RING_INNER_SAFE_RATIO = 0.45`（内圈半径 43px，供玩家贴脸输出，与灼烧「贴脸惩罚」形成博弈：贴脸躲环形→吃灼烧；拉开躲灼烧→吃环形）。锥形（shape=2）同理补扇形方向判定（见 §3）。

---

## 3. 锥形（幽冢鬼母鬼啸）圆形结算 —— 机制补全

- 现状：`shape=2` 实为 360° 全圆 120px（`world.ts:1324`），且命中附 SLOW（`world.ts:1335`），失去「侧闪」counterplay，难度高于 design。
- 建议：锥形落刀按朝向 `dir` 做扇形夹角判定：
  ```
  命中 ⇔ d ≤ 120 && |angle(p - a) - dir*45°| ≤ 60°（120° 锥）
  ```
  - 半径可维持 120px，但把「全圆」收窄为 120° 扇形（对齐 design「锥形」）。
  - 顺带核对鬼母 ATK×1.2 已偏高（`atk=96`，锥形 96×1.2≈115，仍近秒 L1）——若荒冢无门槛，建议鬼母 `atkMult 1.2 → 1.1` 或锥形 `aoeDamageMult 1.2 → 1.1`。

---

## 4. 荒冢「减速词缀」补全

- 现状：design §1 变体 B「精英 aggressive 且接触攻击附带减速」未落地；仅 BOSS 幽冢鬼母 SLOW（`constants.ts:680` slowOnHit）。
- 建议：在 `ENEMY_TYPE_VARIANTS` 增荒冢原型减速登记（或按 biome 在 `dungeonGen.ts:68` 荒冢池派生带 slowOnHit 的变体 id）：
  ```
  "shadow_slow": { hpMult: 1, atkMult: 1, slowOnHit: true }   // 荒冢精英/普通专用
  ```
  - SLOW 参数沿用现 `SLOW_MOVE_MULT=0.6`（移速 -40%，`constants.ts:726`）+ `SLOW_TICKS=36`（3s）——与 BOSS 一致，不叠加 refresh（已实现）。
  - 掉落倾向（moveSpeed/reduction ↑）已落地（`constants.ts:732,758-764`），无需改。

---

## 5. 灼烧地面可读性 / 数值

- 现状：灼烧 telegraph 前摇 2 tick（167ms，`constants.ts:664`）< `MIN_TELEGRAPH_TICKS=8`（666ms，`constants.ts:62`），近乎不可躲；伤害 32/s。
- 建议（二选一）：
  - **A（保 DOT 语义，改表达）**：灼烧从「telegraph 前摇」改为显式「地面 DOT 区域」实体（每次进入判定一次、持续掉血），避免与「可躲 telegraph」混淆；此时前摇短是设计本意。
  - **B（最小改动，降伤）**：`MAGMA_BURN_DAMAGE_MULT 0.15 → 0.12`（32/s→26/s）并保留高频短前摇，明确「贴脸有惩罚但不至于快速致死」。

---

## 6. 套装 / 经济

- **铁骨 3 件 maxHp+90**：与暗金 maxHp 词缀（id22=50 × 2.4 = 120）同量级，未超词缀经济，design §3「同量级保守值」成立。若后续 playtest 发现「铁骨 3 件锁死防御 build」，可下调累计 maxHp +90→+70（2 件 +25 / 3 件 +45），保持坦克定位但减陡峭。
- **setIdForDrop 交叉**：建议按 design §7 Q3 回填裁定——BOSS 宝箱按主题归属：
  - 石牢 BOSS 宝箱 → 铁骨（SET_IRONBONE）；
  - 荒冢 BOSS 宝箱 → 鬼影（SET_WRAITH）；
  - 熔窟 BOSS 宝箱 → 烈阳（SET_BLAZING_SUN）。
  - 若维持现状（全主题 BOSS→烈阳），需回写 design 并接受「烈阳最易凑齐、铁骨/鬼影仅普通/精英掉落」的经济不对称。

---

## 7. 落地影响面（供工程排序）

| 项 | 文件 | 改动面 | 风险 |
|---|---|---|---|
| 熔窟门槛 | `run-manager.ts:572-577` + `protocol.ts`（enter 拒绝 reason） | 小 | 低（需新增 reason + 客户端提示） |
| 环形真环 / 锥形扇形结算 | `world.ts:1317-1341` + 新增常量 | 中 | 中（需回跑 telegraph.test.ts / determinism golden，几何变化可能改 D9 哈希） |
| 荒冢精英减速 | `constants.ts:669-698` + `dungeonGen.ts:68` | 小 | 低（新增变体登记，未登记→基线不变，golden 稳定） |
| 灼烧降伤/改 DOT | `constants.ts:663-666`（降伤）或 `world.ts`+`types.ts`（显式 DOT 实体，较大） | 小/大 | 低/中 |
| setIdForDrop 归属 | `constants.ts:796-808` | 小 | 低（纯函数，改映射即可；需回跑 set.test.ts） |

> 注：任何几何结算（环形/锥形）改动会影响 telegraph 落刀判定 → 需同步复核 `sim-core/tests/unit/telegraph.test.ts` 与 determinism golden；建议按「门槛（低风险）→ 减速补全（低风险）→ 环形/锥形结算（中风险）」顺序推进。
