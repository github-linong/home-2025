# 新手引导 UX 设计（ux-onboarding）

> 作者：design-strategist（文策渊）　|　版本：v0.1（制作收尾 → 打磨）　|　关联：ux-spec.md、design/gdd/*.md、apps/jianghu/sim-core（E1–E26 已落地）、apps/web-client/index.html
> 目标：新玩家从「打开页面 → 打完第一只怪 → 穿上第一件装备 → 进第一次副本」全程有引导，**30–60 秒建立核心循环认知**，不打断老玩家。本文件给 engineering-lead / 客户端落地，不改代码。

---

## 0. 目标与约束（对齐 P5「即开即玩」）

| 项 | 约定 |
|----|------|
| 核心循环认知 | 进 → 探（点地面走）→ 杀（点怪普攻）→ 捡（走近自动拾取）→ 强（I 穿装）→ 挑（F 进副本） |
| 时长 | 全程 30–60s；单步提示 ≤1 次打断，其余用「不遮屏的轻提示」 |
| 打断原则 | **不强制、可跳过、可检测已会**；任一步超时 → 静默降级为常驻 playhint，不阻塞游玩 |
| 老玩家 | 检测到「已会」或已有进度 → 整段跳过，仅保留底部 playhint 轮换 |
| 贴合真实能力 | 只引导**已落地**的交互：点击移动/WASD、点击普攻、走近自动拾取、I 背包「装备」、Q 喝药、1–4 技能、F 进/出副本；**不造不存在的交互**（如不引导"格挡反伤""连招"，MVP 未实现） |

**红线防护（对齐 concept §8.1）**：引导不得引入「强制登录墙」（护 P5 游客即玩）、不得引入「掉落惩罚性教学」（护 P5 低挫败）、不得过载（每步只教一个动词）。

---

## 1. 设计原理（MDA / 自我决定论 / 心流）

### 1.1 MDA 三层
- **Mechanics（规则）**：7 步逐动词解锁（移动→普攻→拾取→穿装→喝药→技能→副本），每一步都映射到一个真实输入。
- **Dynamics（涌现）**：完成条件即「行为检测」——不是点掉弹窗，而是玩家**真的做出了该动作**；引导随玩家行为自然推进，而非线性强制。
- **Aesthetics（乐趣）**：首杀、首件掉落金光、首次穿装数值变化，天然构成「胜任感 + 收集欲」的正反馈；引导只做**前置提示**，不抢走正反馈。

### 1.2 自我决定论（SDT）——胜任感渐进
- 7 步按「从易到难」排序，每一步都是**可完成的单点动作**，连续成功累积胜任感（Competence）。
- 自主性（Autonomy）保留：任何一步都可跳过/延后；引导结束即「毕业」，玩家自由探索（对应 concept §4.1）。
- 关系感（Relatedness）在 Step 7 副本用「集合点」承接（P1 共闯）。

### 1.3 心流（难度阶梯）
- **低认知**（Step 1–3）：单键/单点动作，0 失败成本，建立「我在控制这个世界」的掌控感。
- **中认知**（Step 4–6）：打开面板/多键，引入「装备/药水/技能」的 build 选择，但不强制。
- **高认知**（Step 7）：进副本聚合前六步，作为「核心循环验证」，失败成本低（死亡不掉装）。
- 每一档都**先给成功再给复杂度**，避免新手第一屏被词缀/技能/BOSS 同时轰炸（护 P5 认知过载红线）。

---

## 2. 引导状态机与「检测已会」机制

```
进入主世界(overworld)
   │  ┌──────────────── 全局「已会」快照判定 ───────────────┐
   │  │  (a) 首次进入(无进度) → 走完整 7 步               │
   │  │  (b) 回归玩家(localStorage 有 seenSteps) → 只补未完成步 │
   │  │  (c) 老玩家(有穿装/进本/击杀记录) → 全跳过，仅 playhint │
   │  └──────────────────────────────────────────────────┘
   ▼
Step1 移动 ──✓──▶ Step2 普攻 ──✓──▶ Step3 拾取 ──✓──▶ Step4 穿装
   │                    │                    │              │
   └─ 超时→静默跳过 ────┴─ 超时→静默跳过 ────┴─ 超时→静默跳过 ─┘
                                                            ▼
                                           Step5 喝药(扣血后触发，非阻塞)
                                                            ▼
                                           Step6 技能(战斗中触发，非阻塞)
                                                            ▼
                                           Step7 进/出副本(靠近入口触发) → 毕业
```

**核心规则：完成条件即「检测已会」。** 玩家若在引导启动前已经做过某动作（回归/老玩家），该步**自动跳过**，不重复教。

### 2.1 全局「已会」快照（客户端状态，零协议改动）
- `onboarding.seenSteps`：`number[]`，已完成的步骤 id（1–7），存 `localStorage`（键 `jh.onboarding.seenSteps`）。
- 老玩家硬信号：`character.inventory` 返回 `equipped` 非空，或 `character.level` 返回 `level > 1`，或进过本（`state==='dungeon'` 曾为 true）→ 视为老玩家，**整段引导降级为「不显示，仅保留 playhint」**。
- 游客分支（见 §6）：游客 `inventory` 恒空、`equipped` 恒空，无法走 Step 3/4 的「拾取入包/穿装」路径 → 引导自动降级（详见 §6）。

### 2.2 引导进度条（可选轻提示）
- 顶部血条下方一条 7 格细进度（`step 2/7`），非侵入；老玩家不显示。

---

## 3. 逐步引导规格

> 每步给出：**触发条件 / 提示文案（中文）/ 高亮目标 / 完成条件 / 失败兜底 / 客户端钩子**。
> 所有「检测」均在客户端用现有快照与交互回调完成，**MVP 不改服务端协议**（见 §4）。

| # | 步骤 | 触发条件 | 提示文案 | 高亮目标 | 完成条件（=已会检测） | 失败兜底 | 客户端钩子（现有） |
|---|------|----------|----------|----------|----------------------|----------|---------------------|
| 1 | 点击移动 | `state==='overworld'` 且 `seenSteps` 无 1，且玩家 `pos` 未位移（>8px） | 「**点击地面，走起来**」／副文「或按 WASD / 方向键」 | 玩家脚下脉动圈 + 一个指向远处地面的半透明箭头；底部 playhint 高亮该句 | 首次触发点击移动（`sendMoveToTile` 被调 或 `keys` 有 WASD 且 `sendStop`/位移发生） | 15s 无移动 → 换文案「也可以按 WASD 移动」；30s 仍无 → 静默标记完成（判定挂机/已会），不阻塞 | `handleClick` 地面分支 / `sendMoveToTile` / `keys`+`keyup→sendStop` / 快照 `pos` 变化 |
| 2 | 点击普攻 | 完成 Step1 后，检测周围 `< AGGRO_RADIUS(240px)` 存在普通怪（`tier===0`，被动站桩）且未普攻过 | 「**点一下怪物，挥剑攻击**」 | 最近站桩怪红圈描边（`selectedEnemyId` 高亮已有） | 首次 `sendAttack`（`GAME.lastAttackAt` 更新）或 `GAME.lastKills` 首杀 | 8s 无攻击 → 强化「左键点怪 = 走近自动普攻」；若玩家用技能击杀 → 亦视为会战斗，跳步 | `handleClick` 敌人分支 / `sendAttack` / `GAME.lastAttackAt` / `GAME.lastKills` |
| 3 | 拾取掉落 | 首次击杀（`GAME.lastKills`）且产生 `LOOT_GROUND`（`nearLootId` 非空） | 「**走到掉落上，自动捡起**」 | 掉落物描边 + 既有「拾取 [稀有度色]物品」toast | 首次 `pickupToast` 或 `character.inventory` items 增量（登录玩家） | 掉落 `ttlTicks` 将尽（<120）仍未拾取 → 再提示一次；背包满溢出 → 提示「按 I 整理背包」 | `pickupToast` / `character.inventory` items diff / `GAME.nearLootId`（拾取提示环已有） |
| 4 | 穿装备 | 完成 Step3 后，`inventory` 有可装备 item 且同槽 `equipped` 为空，且**非游客** | 「**按 I 打开背包，点『装备』穿上**」 | 底部背包按钮（I）脉动 + 背包面板新物品行「装备」按钮高亮 | 首次 `sendEquip` 成功（`character.equipped` 变更） | 10s 未开背包 → 背包按钮脉动加强；玩家继续杀怪不阻塞；**游客** → 跳步（见 §6） | `toggleInventory` / `sendEquip` / `character.equipped` 变更 / `GAME.guest` 判定 |
| 5 | 喝药 | `hp < 0.7*maxHp` 且 `potions>0` 且未用过药（`seenSteps` 无 5） | 「**按 Q 喝药回血**」 | 血条变红 + 药水按钮（Q）脉动 | 首次 `sendUsePotion` 成功（`character.potion` ok 或 `GAME.potionCdUntilTick` 置位 / 回血飘字） | 靠升级回满血 → 跳过（视为已会回血机制）；`potions===0` → 不触发，等首次获得药水 | `sendUsePotion` / `character.potion` 回复 / `GAME.potionCdUntilTick` / `prevHp` diff |
| 6 | 技能 | 完成 Step2 后，战斗中（有 `combatTarget`）且任一技能 CD 归零（`skillCd[slot]===0`） | 「**按 1 放『烈斩』，伤害更高**」 | 技能栏槽 1（烈斩）高亮脉动 | 首次 `sendSkill`（`GAME.lastSkillAt` / `GAME.lastSkillFx`） | 12s 一直普攻不放技能 → 换文案「1/2/3/4 = 烈斩/剑气/震地/破军」；触屏 → 提示点技能按钮 | `sendSkill` / `GAME.lastSkillAt` / `GAME.lastSkillFx` / 快照 `skillCd` |
| 7 | 进/出副本 | 核心步（1–3 至少完成）后，玩家距 `ENTRANCE` ≤ `ENTRANCE_INTERACT_RADIUS(72px)` | 「**走到漩涡旁按 F 进副本**」／出本「**击杀深层 BOSS，按 F 出本回城**」 | 入口（裂隙漩涡）描边 + 既有 F 提示环 | 进本：`state==='dungeon'`（`room.enter.ok` / `toast('已进入副本')`）；出本：`exitDungeon`（`toast('已出本')`）→ 引导毕业 | 不主动进本 → 不强制（P5）；在靠近入口时再提示；毕业条件可退化为「完成 1–4 步即视为核心循环建立」，进本作可选软提示 | `toggleDungeon` / `room.enter.ok` / `state` 切换 / `exitDungeon` |

---

## 4. 实现友好：客户端钩子清单（MVP 零协议改动）

> 全部「检测」复用 **web-client 已有设施**，无需新增服务端字段/协议。下表是给 engineering-lead 的落地清单。

| 检测目标 | 现有客户端钩子（无需改） | 服务端影响 |
|----------|--------------------------|-----------|
| 移动 | `handleClick`(地面分支)、`sendMoveToTile`、`keys`/`keyup→sendStop`、快照 `pos` | 无 |
| 普攻 | `handleClick`(敌人分支)、`sendAttack`、`GAME.lastAttackAt` | 无 |
| 击杀 | `GAME.lastKills`（E2E 钩子，敌人 hp→0/移除检测） | 无 |
| 拾取 | `pickupToast`、`character.inventory` items 增量、`GAME.nearLootId` | 无（已下发） |
| 穿装 | `toggleInventory`、`sendEquip`、`character.equipped` 变更 | 无（已下发） |
| 喝药 | `sendUsePotion`、`character.potion` 回复、`GAME.potionCdUntilTick` | 无（已下发） |
| 技能 | `sendSkill`、`GAME.lastSkillAt`/`lastSkillFx`、快照 `skillCd` | 无（已下发） |
| 进/出本 | `toggleDungeon`、`room.enter.ok`、`state` 切换、`exitDungeon` | 无（已下发） |
| 老玩家判定 | `character.equipped` 非空 / `character.level>1` / `state` 曾为 dungeon | 无（已下发） |
| 提示设施 | `toast()`、`pickupToast()`、`#playhint`（底部提示条，已有 8 句轮换）、`setStatus()` | 无 |

**需要新增的仅客户端代码**（不改协议）：
1. `onboarding.js` 模块：`seenSteps` 读写 `localStorage`、7 步状态机、超时/跳过逻辑。
2. 高亮层：一个不遮屏的「步骤高亮 mask」（描边/脉动/箭头，复用现有 `selectedEnemyId` 红圈与拾取提示环的绘制风格）。
3. `#playhint` 与引导联动：引导激活时，底部提示条**固定**为当前步骤文案（暂停 8s 轮换）；毕业/跳过恢复轮换。

**唯一可选的服务端增强（Phase-2，非 MVP）**：把 `onboarding.seenSteps` 落库（跨设备同步），避免换浏览器重复引导。本期用 `localStorage` 即可。

---

## 5. 关键屏幕 UX 与可访问性

- **高亮不靠颜色 alone**（对齐 ux-spec §5）：引导高亮 = 描边（形状）+ 脉动（动效）+ 箭头（方向），色盲可辨；不新增仅靠颜色的提示。
- **文案可读**：提示气泡正文 ≥14px，高对比（≥4.5:1）；键盘族全程可用（WASD/1–4/Q/I/F），触屏族点按钮等价。
- **不遮操作**：引导气泡放屏幕边缘（不盖住技能栏/血条/怪物），高亮用描边而非全屏遮罩，玩家可边引导边玩。
- **降级**：低带宽/移动端可关闭高亮动效，仅保留底部 playhint 文字（护 P5 即开即玩）。
- **跳过入口**：引导气泡带「×」可关闭；`ESC` 或关闭后整段静默，不弹第二次。

---

## 6. 游客 / 老玩家 / 回归玩家 三分支

| 分支 | 判定 | 引导行为 |
|------|------|----------|
| **新玩家（登录）** | `character.level===1` 且 `equipped` 空 且 `seenSteps` 空 | 走完整 7 步 |
| **新玩家（游客）** | `GAME.guest===true` | Step 1/2/6 照常（移动/普攻/技能无需登录）；Step 3 拾取、Step 4 穿装**跳过**（游客背包恒空、无法拾取/穿戴），改为一次性提示「**注册登录后拾取/穿戴的装备才会保存**」（呼应现有 guest toast）；Step 5 喝药视药水计数（游客击杀可获药水计数，但不落库）；Step 7 副本可进（单人不强制组队） |
| **回归玩家** | `seenSteps` 含部分 id | 只补未完成步，已完成步静默 |
| **老玩家** | `equipped` 非空 或 `level>1` 或曾进本 | 整段跳过，仅 playhint 轮换 |

---

## 7. 开放问题 / 待主理人裁定

1. **游客是否给「登录 nudge」时机**：建议在 Step 3（首件掉落）时一次性提示登录价值（而非开局强推），护 P5 即开即玩。是否接受？
2. **引导毕业条件**：建议「完成 1–4 步」即判定核心循环建立（Step 5–7 为情境软提示），更贴合 30–60s 目标；是否认可？
3. **`seenSteps` 落库**：跨设备同步归 Phase-2，本期 localStorage 是否足够？
4. **引导与 playhint 的优先级**：引导激活期间暂停 8s 轮换、固定显示当前步骤文案，毕业恢复——是否可接受该交互？
