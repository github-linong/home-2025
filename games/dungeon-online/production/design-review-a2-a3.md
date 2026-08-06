# A2+A3 设计评审（客户端插值打磨 + telegraph/协作技视觉）

- **路径**：`games/dungeon-online/production/design-review-a2-a3.md`
- **评审人**：design-strategist（文策渊）
- **类型**：设计评审（只读不改码 / 不改 GDD）
- **汇编落盘**：主理人（游承峰）
- **评审对象**：
  - `apps/client/EntityView.gd`（A3：`_show_telegraph` 从 `startTick→applyTick` 长大+提亮；shield ring / taunt marker / 短暂 cast bar，全部 data-driven）
  - `apps/client/GameWorld.gd`（A2：100ms 插值缓冲、本地预测+回正；render-tick 估计下传 A3）
  - `production/a2-a3-client-note.md`（工程自审，列出设计问题 C1–C5）
- **基线**：`art-bible.md` §3/§4/§7/§10、`accessibility.md` #3/#4/#5/#9/#11/#13、`design/gdd/09-skill.md` §7、`design/gdd/08-enemy-ai.md` §4/§7、`design/ux/ux-spec.md` §0/§2/§3/§4、`docs/architecture/ADR-NET-01.md`（D3/D6/D12）、`packages/sim-core/src/types.ts`（`TelegraphShape` / `ENEMY_PROTOTYPES` / `SKILL_PROTOTYPES`）

---

## 0. 判定摘要

- **判定：CONCERNS（合并条件，设计侧）** —— A2/A3 工程实现扎实、协议一致性 **PASS 8/8**（`client-protocol-conformance.mjs`）、视觉结构连贯、Discipline B 守约；**无工程合并阻断项**。但存在 **2 项须在「好玩吗」验证门前闭环的设计打磨项**（M1 telegraph 第 1 帧全幅边界、M2 协作技调色板纪律），否则 P3「读得懂的紧张感」与 art-bible §3 调色板纪律不达标。
- **阻塞项（设计侧，阻断 A2/A3 合并）：无**
- **裁决速览**：
  - **C3 → 裁定 YES**：四形状（RING/AOE_FILL/CONE/LINE）全实现客户端渲染，对齐 wire 枚举；boss CONE=三角处理确认。附设计缺口（方向性形状缺朝向字段）作 N2 跟踪。
  - **C4 → 裁定接受 flash-on-cast（600ms）**：不增持久 cast 条。
  - **C2 → FLAG（架构）**：交 engineering-lead ADR（服务端 tag 数据面），非合并阻断。
  - **C1 → FLAG（预测保真）**：交 engineering-lead 单源跟踪，非合并阻断。
  - **C5 → 备注**：低风险的工程自陈，记跟踪（N6）。

---

## 1. Telegraph 可读性评估（⑧ §7 / art-bible §7 / accessibility #4）

**当前实现**（`EntityView._show_telegraph`）：
- `progress = (render_tick - startTick) / (applyTick - startTick)`，钳 0..1
- 整圈 `scale = lerp(0.35, 1.0, progress)`（长大）
- fill alpha `lerp(0.10, 0.50, progress)`；outline alpha `lerp(0.30, 0.95, progress)`（提亮）

**是否读作公平的 "tell"？**
- **时序 ✅**：前摇 ≥0.6s（18tick，D12 硬下限）在服务器端落地；客户端用插值的 `render_tick` 驱动 `progress`，与权威前摇窗口锁步——弱网下仍可读紧张感不崩。
- **范围 ⚠（核心问题）**：`grow` 的是**整圈边界**（0.35→1.0 倍半径），意味着玩家**直到 `applyTick` 才看到真实危险半径**。第 1 帧只见到最终范围的 35%。这与 art-bible §7「静态可读形状…自第 1 帧存在」及 accessibility #4「telegraph 第 1 帧可读」的**精神有偏差**：形状可读，但**危险范围不可读**。玩家无法在风up 早期判断"会打到哪"。
  - 注：这并非"不公平"（最终范围确定、整段前摇可反应），但**劣于固定全幅**的最优实践。

**UX 改进建议（M1，must-fix-before-playtest）：**
1. **解耦「边界」与「充能」**：固定全幅 `OUTLINE`（= 最终半径，`scale=1.0` 常显，第 1 帧即真实危险边界）+ `FILL` 在固定轮廓**内** `grow`（充能感）。这是 Monster Hunter / Hades 的通用范式——边界立即可读，充能表达"何时"。
2. **末段提亮（color progression）**：`progress→1` 时 outline 向「hot」提亮（更高明度/趋白），强化" imminent "。维持 DANGER 红语义，仅提亮度不换色相（不破 art-bible §3）。
3. **edge pulse**：末 ~150ms 外扩一圈薄亮环，把视线吸到边界与命中点。
4. **DANGER 红对齐**：当前 `Color(1.0,0.2,0.2)` 略偏离 art-bible DANGER `#E5484D`(0.898,0.282,0.302)；建议对齐到调色板值。
5. **色盲安全**：形状为主通道、alpha ramp 不依赖色相，protan/deutan 下仍可读 ✅；无需改。

**三重编码缺口（N3，跨 阮和鸣/⑬）：** 当前 telegraph 仅 `shape + color`（2/3）。art-bible §7 要求「形状+色块+**声**」，accessibility #3 要求「形状+图标+**文字**」。缺第三通道。建议：`telegraph` 出现时客户端触发音效（阮和鸣域）+ 可选地面图标/文字。FLAG，不阻断（声效属音频系统）。

---

## 2. 协作技视觉连贯性（⑨ §7 / art-bible §3 / accessibility #5/#9/#13）

**Shield ring（硬编码青 `Color(0.4,0.85,1.0)`）：**
- ⚠ **越调色板**：青既非 4 阵营色，也非 GOLD/EMBER/DANGER（art-bible §3 全调色板无此色）→ 破 §3 纪律。
- ⚠ **与 ⑨ §7 不符**：⑨ §7 明定「护盾链接 = 目标盟友**静态护盾环（自身阵营色）**」。硬编码青未绑被护玩家身份。
- **建议（M2）**：改为**被护玩家阵营色**（由 `ownerId%4 → faction palette` 派生，snapshot 已含 `ownerId`）。既在调色板，又表"保护此队友"的身份语义。
- `shieldReduction`(0.5) 已序列化但客户端未消费 → 可选以环厚/小标签表减伤幅度（N7，打磨）。

**Taunt marker（黄三角 `Color(1.0,0.85,0.2)` ≈ GOLD）：**
- ✅ **语义正确**：黄≈GOLD，与 art-bible §3「GOLD=协作信号」一致；放在头顶、与红色地面 CONE 三角异色异位，无混淆。
- ⚠ **与 ⑨ §7 措辞不符**：⑨ §7 写「嘲讽战吼 = 施法者**静态嘲讽光环（阵营色）**」。实现用 GOLD 而非阵营色。
- **建议**：定稿 **taunt = GOLD（协作语义）**（比阵营色更贴 art-bible §3「协作=暖色」），并在 design-strategist 后续回填 ⑨ §7 时修订措辞（N8）。

**Cast bar（flash 600ms，硬编码淡紫 `Color(0.9,0.75,1.0)`）：**
- ⚠ **越调色板**：淡紫不在调色板（非阵营/非 GOLD/EMBER/DANGER）→ 破 §3 纪律。
- **建议（M2）**：改用 **EMBER**（art-bible §3 明示「EMBER=协作技光效」）或**按技能着色**（shield→被护阵营色 / taunt→GOLD / revive→GOLD 或春绿）。去淡紫。

**是否清晰不杂乱？**
- ✅ 结构清晰：shield ring 绕身（fill alpha 0.18 克制不遮身）/ taunt 三角头顶（-34~-44）/ cast flash 头顶（-25~-30）。cast(-25~-30) 在 hp(-22) 与 taunt(-34~-44) 之间竖直堆叠，当前不重叠，真机跑时留意。
- ✅ shield fill 0.18 透明、不挡身。
- 建议：cast flash 可缩至 ~400ms 脉冲减少滞留感（打磨，非必改）。

**三重编码（N3）：** ring/marker 仅 `shape+color`（2/3），缺图标/文字第三通道。建议 + 小护盾/咆哮图标；施放同时经 ⑩ 广播文字信号（ux-spec §6 已设计）满足 accessibility #9/#13。

**C4 关联**：shield ring / taunt marker 本身已"持续"表 buff 态（由 `shieldUntilTick`/`tauntUntilTick` 驱动），cast bar 仅作施放确认闪 → 不冗余、不杂乱。

---

## 3. 设计裁定（C1–C5）

### C3 — 裁定：YES，四形状全实现客户端渲染；boss CONE=三角处理确认
- **依据**：`types.ts` `TelegraphShape{RING:0, AOE_FILL:1, CONE:2, LINE:3}`；`world.ts` 序列化 `shape` 取 `ENEMY_PROTOTYPES[enemyTypeId].shape`（grunt=RING / elite=AOE_FILL / boss=CONE），非敌人默认 RING。客户端四形状几何与 wire 枚举一一对应 ✅。
- **FLAG（N1）**：当前 **无服务端 producer 发 `LINE`**（`ENEMY_PROTOTYPES` 仅用 RING/AOE_FILL/CONE）。`LINE` 为前向兼容死码 → 建议 ① 增加 LINE 生产者（某敌人普攻/玩家攻击），或 ② 仅作前向兼容并在集成测试加 `LINE` 渲染断言。
- **设计缺口（N2，关联 C3）**：**方向性形状 CONE/LINE 缺朝向字段** —— `telegraph` 快照仅 `{shape,color,startTick,applyTick,radius}`，无 `dir`/`angle`；客户端不旋转。结果：cone/line **恒指世界 +x**。若 Boss 锥形朝左方玩家却渲染朝右 → 误导战局。建议：① 加 `telegraph.dir`（单位向量）或 `angle` 字段并由服务端按攻击者朝向填充，或 ② 明确"攻击者本体朝向=唯一真值"且客户端据 attacker facing 渲染。**建议进 playtest 门前**（否则 boss CONE 可能指错方向）。

### C4 — 裁定：接受 flash-on-cast（600ms），不增持久 cast 条
- **依据**：⑨ §7 协作技 `castTicks=0`（即时、无客户端前摇），可读性赖**即时视觉反馈**。shield ring / taunt marker 已"持续"表 buff 态（`shieldUntilTick`/`tauntUntilTick` 驱动），cast bar 仅施放确认闪，二者互补不冗余。持久 cast 条会重复呈现 + 增加杂乱，且需新增快照字段。
- **REVIVE_BOOST 仅 flash**：其持久反馈 = 救援读条跳增（⑪/⑬ 承载），flash 为唯一瞬时提示，可接受。
- **裁定**：flash-on-cast 符合设计意图，**无需新字段、无需持久化**。

### C2 — FLAG（架构/健壮性，交 engineering-lead ADR；非 A2/A3 合并阻断）
- **设计/UX 含义**：无 `type` 判别的数据面 `world.snap` 靠 shape 路由（`tick`+`entities` 启发式）→ 协议演化时任何同形消息会被误路由，可能"瞬间无渲染"，违背 ux-spec §3「无瞬移/可读」UX。
- **建议**：服务端 tag 数据面（`{type:"world.snap", payload}` 或二进制帧 tag）→ 走 ADR。本评审不解决。当前契约可用、conformance PASS，不阻断合并。

### C1 — FLAG（预测保真度，交 engineering-lead 单源跟踪；非阻断）
- **设计在乎保真**：ux-spec §3「本地预测跟手→回正+插值 100ms 平滑（无瞬移误导战局）」。若客户端 `moveSpeed` 与服务端漂移 → 橡皮筋(snap-back)，违"无瞬移"手感。
- **现状**：`LOCAL_CLASS_MOVE_SPEED=[140,185,165,170]` / `TICK_RATE=30` 手镜像 sim-core；`CLIENT_INPUTS_PER_SERVER_TICK=2.0` 为启发式（非 D9 golden 的逐 tick 最新 pending 重演）。
- **建议**：`TICK_RATE` + `CLASS_BASE.moveSpeed` + `PLAYER_CLASSES` 顺序**单一来源**（共享 JSON / codegen 入客户端）→ 自动 golden 对齐。非阻断（30Hz/60fps 近似可用；仅服务端改数时漂移）。

### C5 — 备注（低风险的工程自陈，记跟踪 N6）
- 重连换 seat → `_local_class_ms` 陈旧至下次全量重检。当前 2–4 人无风险；记 engineering 待办。

---

## 4. 契约一致性 / 纪律（Discipline B）

- **Discipline B（客户端只渲染、不著本地状态）**：`EntityView.apply_state` 每帧据 snapshot 重算并**显式隐藏**过期视觉（`_hide_telegraph` / shield·taunt 窗口过 / cast 计时）→ "无残留 overlay" 设计成立 ✅（对齐 a2-a3-note §3）。
- **字段一一对应**：`telegraph{shape,color,startTick,applyTick,radius}` 与 `EntityView` 消费对应 ✅；`shieldUntilTick`/`tauntUntilTick`/`activeSkill` 与 ⑨ 状态位一致 ✅。
- **render-tick 锁步**：`GameWorld` 插值 `tick_a,tick_b` 得 `render_tick` 下传驱动 telegraph/技能 timing → 与权威前摇窗口锁步 ✅（A3 设计正确）。
- **A2 回正**：仅本地玩家预测+指数平滑、远程玩家走插值缓冲、不回滚远程 → 符合 Discipline B「客户端无权威态」✅。

---

## 5. 可访问性（accessibility #3/#4/#5/#9/#11/#13）

- **#4 静态预警**：grow 整圈削弱「第 1 帧全幅」 → 见 M1。
- **#3 三重编码**：telegraph + 协作标记均缺第三通道（声/图标/文字）→ 见 N3。
- **#5 阵营色纪律**：shield 青 / cast 淡紫越界 → 见 M2（改阵营色 / EMBER）。
- **#11 减弱动效**：grow/intensify 属"必要预警动效"；**固定 OUTLINE 须保留**（动效关时仍可读边界）→ 设计 OK。
- **#9 / #13 文字+图标 / 事件文本**：协作施放须经 ⑩ 广播文字信号（ux-spec §6 已设计）→ 交 ⑬/⑩ 实现。

---

## 6. 判定与遗留

### 6.1 判定：CONCERNS（合并条件，设计侧）
A2/A3 工程扎实、协议 PASS(8/8)、视觉结构连贯、Discipline B 守约 → **可合并**。但 **M1/M2 须进「好玩吗」验证门前闭环**，否则 P3 可读性与调色板纪律不达标。

### 6.2 必改（must-fix-before-playtest，设计打磨）
- **M1 — telegraph 第 1 帧全幅边界**：固定全幅 OUTLINE（最终半径常显）+ FILL 在轮廓内 grow；加末段提亮 + edge pulse。对齐 art-bible §7 / accessibility #4。
- **M2 — 协作技调色板纪律**：shield ring → 被护玩家阵营色；cast bar → EMBER 或按技能着色（去淡紫）；对齐 art-bible §3 / ⑨ §7。taunt = GOLD 保留。

### 6.3 非阻塞跟踪（CONCERNS，交相关方）
- **N1（C3 子）** — `LINE` 无生产者：加生产者，或仅前向兼容 + 集成断言。
- **N2（C3 子·设计缺口）** — 方向性 telegraph 缺朝向字段：加 `telegraph.dir`/`angle` 或锁定 attacker facing 为真值；boss CONE 可能指错方向，建议 playtest 门前。
- **N3（跨 阮和鸣）** — telegraph/协作标记缺第三编码通道：telegraph-appear 触发音效 + 加图标/文字；满足 accessibility #3/#9/#13。
- **N4（C2）** — `world.snap` 无 `type` 判别：交 engineering-lead ADR（服务端 tag）。
- **N5（C1）** — 预测常量单源：交 engineering-lead（共享 JSON / codegen）。
- **N6（C5）** — 重连换 seat 类速陈旧：engineering 低风险的待办。
- **N7** — `shieldReduction` 序列化但客户端未用：可选环厚/标签表幅度（打磨）。
- **N8** — ⑨ §7 taunt「阵营色光环」措辞与 GOLD 实现不符：design-strategist 回填时定稿 taunt=GOLD 并修订 ⑨ §7。

### 6.4 阻塞项：**无**（设计侧不阻断 A2/A3 合并）

---

## 7. Handoff
- 本稿随 quality-lead 的 QA 计划一并汇编落盘为 `games/dungeon-online/production/design-review-a2-a3.md`。
- **结论**：CONCERNS，工程可合并；M1/M2 进 playtest 门前。
- **跨队友路由**：
  - N3（telegraph/协作音效+第三编码）→ **阮和鸣**（音频）协同 ⑬。
  - N2 / N4 / N5 / N6 → **engineering-lead**（朝向字段 / 数据面 ADR / 预测单源 / 重连 seat）。
  - N8 → **design-strategist** 自回填（修订 ⑨ §7 措辞）。
- **裁决速传**：C3=YES（四形状，boss CONE 三角确认，附 N1/N2）；C4=接受 flash-on-cast；C2/C1=架构跟踪非阻断。

（文策渊 · design-strategist · A2+A3 设计评审，主理人汇编落盘）
