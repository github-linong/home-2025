# 音频方向与音效补全设计（Audio Direction）· DRAFT v0.1
> **状态：DRAFT v0.1 · 可访问性档 = `Standard`（听力辅助可选，见 §4）** ｜ 主理人确认用
> **作者**：阮和鸣（audio-director）
> **对齐**：art-bible §1（「灯尽处」母题 + 情感弧）/§2（暖=安全、冷=危险、RIFT 紫青异象）/§3（光影氛围）；asset-specs §5（telegraph 静态可读）/§6（裂隙入口漩涡）；accessibility.md #15/#19（音频冗余 + 音频可视化）；concept §2.3（感官/幻想乐趣）；combat §②（格挡 250ms 窗口 + BOSS 2 阶段 @50%）
> **技术约束（已核对现有实现）**：浏览器 2D Canvas · 零外部音频资源 · 全部 WebAudio 程序化合成（与 `index.html` 内 E12 `SFX` 模块一致）· 12Hz tick · 0.4s 前摇 · 1s telegraph 预警。
> **命名约定**：一次性音效沿用现有扁平 `DEFS` 键名（snake_case）；新增**持久/循环节点**用独立 `LOOPS` 注册表（见 §3）。

---

## 0. 听觉身份（一句话）
> **「灯尽处」的听觉版：暖灯所及是宫商清音、松风低语；灯外是埙鸣幽咽、煞气嗡鸣；刀剑一触即发，预警一声先至——用克制的暗调与清晰的声学编码，让任何浏览器里的玩家「听」出『家』与『战场』的边界。**

与 art-bible §1.2「调性三元」对齐的**声音调色板（sound palette）**：

| 语义 | 调性来源 | 声音原型（WebAudio 可合成） | 音区/音色 |
|---|---|---|---|
| 安全区（暖=家） | 武侠·城池 | 五声音阶古筝拨弦近似 + 暖色低 drone | 中低频、暖、留白 |
| 刷怪区（冷=危险） | 暗黑奇幻·荒野 | 低音埙（陶埙）持续音 + 冷色风噪底 | 次低频、幽咽、阴翳 |
| 裂隙入口（紫=异变） | 暗黑历史·异象 | 双音 detune 持续嗡鸣 + 高频 RIFT_TEAL 微光 | 低频 + 高频闪烁 |
| 战斗（打击感） | 武侠·刀光 | 噪声爆 + 低频方波 + 高频泛音 | 全频段、瞬态 |
| telegraph（危险预警） | 视觉 DANGER 同步 | 1s 持续上行紧张音 + 低频脉冲加速 | 中低频、可读 |

**声音情感曲线**（对齐 art-bible §1.3）：入城=归处（暖 drone + 稀疏宫商）→ 出城=戒备（暖转冷，加入低 drone）→ 荒野=孤绝（埙音 + 风噪）→ 裂隙=异变（嗡鸣渐入）→ 击杀/成长=变强（泛音上行 + 金光）。

---

## 1. 音乐基调（Music Direction）

### 1.1 主 BGM 方向
- **情绪**：孤绝肃杀、克制留白，**慢、散板感**（≈ 60–72 BPM 的意象，不必强打拍），绝不抢战斗音效。水墨「留白」= 音乐里「静默间隙」，音符稀疏、尾音长。
- **速度/密度**：探索态每 4–8 秒 1–2 个音符点缀；战斗态加密但不换调。
- **WebAudio 配器近似（零外部资源）**：
  - **低音埙/陶埙** ≈ `sine`/`triangle` 持续音（基频 150–300Hz，低通 800Hz 以下），叠加极慢 **LFO 颤音**（3–5Hz，depth 小）模拟「埙的幽咽」。用五声音阶选音（宫商角徵羽，如 A3–C4–D4–E4–G4）。
  - **古筝拨弦** ≈ 短促 `triangle` pluck（音高固定、快速指数衰减 ~0.3–0.6s）+ 轻 `sine` 泛音，稀疏随机点缀，模拟「拨弦余韵」。
  - **环境底噪** ≈ 低通白噪声（<400Hz）极低增益，模拟风声/荒野底噪（见 §2 ambient_wind）。
  - **刀剑冷光** ≈ 高频 `sine` 泛音（>2kHz，短 0.05–0.1s）偶尔闪过，呼应「刀剑冷光」关键词。
- **实现思路**：一个轻量 **scheduler**（基于 `ctx.currentTime` 提前排程，非 `setInterval` 硬打拍）驱动 BGM 音符；走**独立 `musicBus` gain**，音量低于 SFX。

### 1.2 探索态 vs 战斗态（音频分层 / 紧张感切换）
采用「**底层持续 + 上层切换**」两层结构，切换用 **1–2s crossfade**，避免突兀：

| 层 | 探索态（explore） | 战斗态（combat） |
|---|---|---|
| 底层 drone | 暖/冷单音或纯五度（安全区暖、刷怪区冷），增益低 | 同音改**低半音**或减五度（tritone）制造紧张，增益略升 |
| 中层 pluck | 稀疏古筝拨弦（4–8s 一次） | 密度加密（1–2s 一次）+ 加入低频「心跳」脉冲（sine 60–80Hz 短促） |
| 顶层 | 风噪底 | 风噪底 + 可选战鼓（低频 sine 短促重复，约 100–120 BPM） |

- **关键纪律**：战斗态不得遮蔽 `telegraph` 预警音与 `parry_success`/`crit` 等关键反馈——战斗态对 SFX 总线做 **ducking**（SFX 触发时 musicBus 增益 -3~-6dB 短暂下压）。
- **切换触发**：进入/离开仇恨（战斗状态）时由客户端判定；BOSS 战单独覆盖（见 §1.3）。

### 1.3 BOSS 战主题 + telegraph 预警音
- **BOSS 战主题**：压迫感 = **极低 drone（40–60Hz）持续** + **缓慢上行小二度**（半音 tension，如 55Hz→58Hz 交替）+ 低频「心跳」脉冲（约 60–70 BPM，随阶段加速）。
- **阶段切换（50% hp，2 阶段 @`BOSS_PHASE_THRESHOLD=0.5`）**：第二层引入**不和谐音程**（tritone）+ 脉冲提速 + 音量略升，作为「狂暴」听觉信号；与视觉妖纹脉冲（asset-specs §5.3）同步。
- **telegraph 预警音（P0，必做）**：这是本作战斗安全的核心声学编码，须与 **0.4s 前摇**、**1s 预警**的时序严格对齐：
  - **时序**：telegraph 出现（1s）→ 持续上行紧张音；apply 命中（0.4s 前摇后）→ 释放为短促重击音（复用 attack/skill 打击）。
  - **合成**：`sawtooth` 150→400Hz 上行 + 低频 `sine` 脉冲（90Hz，**tremolo LFO 逐渐加速**），总长 ≈1s，慢 attack、快 release；音量低于攻击命中音、但可辨识。
  - **可访问性**：telegraph 已有视觉红圈（三重编码），音频为其**冗余**而非唯一编码；见 §4「听力辅助」。

---

## 2. 缺失音效清单（现 18 种 + potion 之外）

> 现有已实现：`attack / skill_1~4 / hit / crit / parry / parry_success / pickup / potion / levelup / downed / revive / enter_dungeon / exit_dungeon / disconnect / reconnect / ui / enemy_dead`。
> 优先级：**P0 核心循环 / P1 Standard 增强 / P2 打磨（Phase-2）**。合成思路沿用现有原语（`osc` 正弦/方波/锯齿 + `noise` 低通/高通/带通 + `noiseSweep` 扫频 + `echo` 延迟）。

### P0（核心循环，先做）

| # | 音效 | 触发时机 | 合成思路（波形 / 包络 / 音高） | 备注 |
|---|---|---|---|---|
| 1 | `telegraph`（预警） | 敌人/陷阱 telegraph 出现至 apply（≈1s） | `sawtooth` 150→400Hz 上行 + `sine` 90Hz tremolo 加速脉冲，慢 attack 快 release，~1s | 战斗安全核心，与 0.4s 前摇区分 |
| 2 | `ambient_wind`（环境风噪，循环） | 探索态常驻（安全区弱/刷怪区强） | `noise` 经低通 300–600Hz + **LFO 调制截止频率**，增益 0.1–0.15；循环节点 | 听觉身份底座，须极低音量 |
| 3 | `footstep`（脚步/移动） | 每格步进（tick 移动） | 短 `noise` 低通 <600Hz（0.03–0.05s）+ 轻 `sine` 80–120Hz；**节流 ≥80ms** 防 12Hz 连发 | 地面材质可换滤波频点（石/土） |
| 4 | `chest_open`（宝箱开启） | E20 按 F 开「战利品宝箱」 | 木箱 `square` 120→80Hz thunk + `sawtooth` 200→300 吱嘎 + 金光 `sine` 523/659/784 上行琶音（比 levelup 更软），~0.6s | 现用 `ui`+`pickup` 占位，缺专属开箱音 |
| 5 | `enchant_success`（强化成功） | E19 强化回复成功 | 锤击 `square` 200→140 + `noise` 短爆 + 金属泛音 `sine` 660→1320 上行，~0.4s | 现用 `ui` 占位，缺强化爽感 |
| 6 | `disassemble`（分解） | E22 分解成功 | 碎裂 `noise` 高通 3kHz 短爆 + 下行 `sine` 800→300 + 2–3 个碎玻璃短噪声，~0.5s | 现用 `ui` 占位 |
| 7 | `portal_hum`（入口漩涡嗡鸣，循环） | 靠近地牢入口裂隙漩涡时（视距内） | 双 detune `sine`/`sawtooth` 55Hz+57Hz → 低通 + 慢幅度 LFO + 高频 `sine` 2kHz 微光；**距离衰减**，循环节点 | 裂隙异象是地图锚点（art-bible §6.3） |

### P1（Standard 增强）

| # | 音效 | 触发时机 | 合成思路 | 备注 |
|---|---|---|---|---|
| 8 | `party_join`（队友加入） | E17 队伍人数增加 | 中性双音 `sine` 392→523 上行 + 轻和声，~0.3s | 与 pickup/levelup 区分 |
| 9 | `dungeon_clear`（胜利/副本完成） | 击杀深层 BOSS / 清本 | 五声音阶上行旋律 4–5 音（`sine`/`triangle`）+ 低频锣感 `sine` 60Hz 长衰减，~1.5s | 比 levelup 更庄重 |
| 10 | `boss_dead`（BOSS 死亡重音） | BOSS 击杀 | `enemy_dead` 加重加长版：次低频 `sine` 150→40Hz + `noise` 低通爆 + 缓慢泛音余韵，~1s | BOSS 必掉更好词缀，需重奖感 |
| 11 | `kill_streak`（击杀连击音） | 短时间窗内连续击杀（multikill） | 每次击杀 `sine` pluck 音高随连击数上行（如 523→659→784→880…），~0.15s | 承接 concept §4.1 胜任感 |
| 12 | `ui_open` / `ui_close`（UI 面板开合） | 背包/卷轴面板开合 | 开：`noise` bandpass 上扫 + 竹简 `square` 轻 click；关：反向下扫 | 与通用 `ui` click 区分 |
| 13 | `crit`（暴击重音增强） | 暴击命中 | 在现有 `crit`（hit+880→1240 sine）上叠加 sub `sine` 60Hz 重击，让它「更重」 | 现有 crit 可保留，增强层次 |

### P2（打磨 / Phase-2 待办）

| # | 音效 | 触发时机 | 合成思路 | 备注 |
|---|---|---|---|---|
| 14 | `stagger`（受击硬直） | D3 格挡硬直 300ms（Phase-2） | 重低频 `sine` 120→60Hz thud + 短 `noise` 低通，~0.25s | 与 `hit`（轻 click）区分 |
| 15 | `elite_spawn`（精英/精怪登场） | 精英异象脉冲登场 | `noiseSweep` 200→900Hz + RIFT 紫青泛音 `sine` 880→1320 上行，~0.7s | 呼应 asset-specs §5 VFX 登场 |
| 16 | `boss_phase`（BOSS 阶段切换） | 50% hp 切二阶段 | 下行小二度 tension `sine` 58→55Hz + 不和谐泛音，~0.8s | 与视觉妖纹脉冲同步 |
| 17 | `combo_finish`（连招终结，雏形） | D6 连招触发额外伤害（Phase-2） | 短促双音叠 + `noise` 爆，强调「破防」 | 连招 MVP 不实现，预留 |

> **enemy_dead 评估**：现有 `enemy_dead`（`sine` 300→70 + 低通噪声）**对普通怪够用**；缺的是「精英/BOSS 击杀」的重量级与「连击」的爽感，故拆成 P1 的 `boss_dead` / `kill_streak`，普通怪维持现状。

---

## 3. 实现策略（WebAudio 合成 · 与现有实现一致）

### 3.1 中间件选型
**不引入第三方音频中间件**，用 WebAudio 原生 API 自建——与现有 `SFX` 模块同源，零外部资源、零构建依赖、零资产体积。现有原语（`osc`/`noise`/`noiseSweep`/`echo`）已覆盖本清单全部合成需求，仅需两类扩展：

1. **循环节点（LOOPS）**：`ambient_wind` / `portal_hum` / BGM drone 需要**持久循环**而非 one-shot。新增一个 `LOOPS` 注册表：`start(name)/stop(name)` 管理 `OscillatorNode`/`BufferSource(loop=true)` + 各自的 `gain`，挂到对应 bus。
2. **总线结构（bus）**：当前只有单一 `master`（SFX 直连）。建议扩为：
   ```
   master ──┬── musicBus   (BGM/氛围，gain 0.2–0.35)
            ├── ambienceBus (风噪/嗡鸣，gain 0.10–0.18)
            └── sfxBus     (一次性音效，gain 0.5–0.7)
   ```
   静音/音量仍走 `master`（现有持久化 `jianghu_sfx_vol/muted` 不变）；新增独立音量键可选（Phase-2）。

### 3.2 事件命名约定
- 一次性音效：沿用扁平 `DEFS` 键名（snake_case，如上清单）。
- 循环/氛围：`LOOPS` 键名 = `ambient_wind` / `portal_hum` / `bgm_drone` / `boss_theme`。
- 命名一律小写 + 下划线，避免 `camelCase` 混用；实现时在 `SFX.play('chest_open')` 一致调用。

### 3.3 实例化 / 池化 / 性能预算
- **一次性 SFX**：沿用现有「即建即弃」（`osc`/`noise` 短生命周期 + `stop` 清理），低端机安全。
- **噪声缓冲复用**：现有 `getNoise` 已复用白噪声缓冲，`ambient_wind` 直接复用。
- **循环节点上限**：持久节点 ≤ 4（`bgm_drone` + `ambient_wind` + `portal_hum` + `boss_theme`）；`portal_hum` 按**距离衰减 + 同屏仅 1 个入口**约束，不重复起。
- **同发语音数预算（低端机）**：一次性 SFX 同发 ≤ 8–12；`footstep` 必须**节流（≥80ms）**，避免 12Hz tick 下连发；`kill_streak` 在连击窗口内单发不叠加。

### 3.4 音量平衡建议（音效 vs 环境 vs 音乐）
| 总线 | 建议 gain | 相对关系 | 说明 |
|---|---|---|---|
| `sfxBus` | 0.5–0.7 | 基准 | 战斗关键音（`parry_success`/`crit`/`telegraph`）优先 |
| `musicBus` | 0.2–0.35 | 低 6–8dB | BGM 让位于音效，留白为主 |
| `ambienceBus` | 0.10–0.18 | 最低 | 风噪/嗡鸣只做「底」，绝不抢戏 |

- **ducking**：战斗态 SFX 触发时 `musicBus` 短下压 -3~-6dB，`telegraph`/`parry_success` 触发时下压更明显。
- **动态层级**：探索 → 战斗 → BOSS 高潮，music/ambience 增益逐步略升，但 SFX 始终保持清晰可辨。

### 3.5 可访问性（听力辅助，可选开关）
现有已覆盖：静音 / 音量记忆（`localStorage`）/ 手势解锁 AudioContext（`Z1–Z3` 零报错）。补以下**听力辅助**：

1. **关键音可视化（可选，Standard #19 音频可视化）**：`telegraph` / BOSS 技能触发时，屏幕边缘淡入同色脉冲/图标（复用 DANGER/RIFT 色），让听障玩家「看」到预警——**音频始终是视觉 telegraph 的冗余，不做唯一编码**。
2. **听力辅助三开关（Phase-2 设置菜单）**：
   - **低频增强**：提升 `telegraph`/`boss` 次低频增益（低音穿透）。
   - **高频削减**：降低/关闭 `footstep` 噪声、虫鸣等高频（敏感人群）。
   - **纯视觉模式**：关闭全部氛围/BGM，仅保留关键预警的视觉与文字（配合 accessibility #13 事件文本化）。
3. **事件文本化对齐**：精英/BOSS 登场、阶段切换、传说掉落已有文字（accessibility #13），音频与之同步，不新增无文字的关键音频语义。

---

## 4. 落地优先级建议

### Phase-1（P0 先做，MVP 内）
1. `telegraph`（战斗安全核心，与视觉红圈同步）→ 2. `ambient_wind`（听觉身份底座）→ 3. `chest_open` / `enchant_success` / `disassemble`（E19/E20/E22 反馈补齐）→ 4. `portal_hum`（裂隙入口锚点）→ 5. `footstep`（移动反馈，含节流）。
> 落地顺序 = 安全 > 身份 > 循环反馈 > 锚点 > 手感。

### Phase-2（P1/P2，后续里程碑）
- **P1**：`party_join` / `dungeon_clear` / `boss_dead` / `kill_streak` / `ui_open·close` / `crit` 增强。
- **P2**：`stagger`（D3 硬直）/ `elite_spawn` / `boss_phase`（D1 三阶段）/ `combo_finish`（D6 连招）——**跟随对应玩法 Phase-2 待办**，玩法未落地前不提前做音频。

---

## 5. 待主理人审批项
1. **音乐可开关的默认策略**：MVP 建议「BGM/氛围默认**关**或默认低音量」（留白、护音效），由用户拍板默认值。
2. **听力辅助归属**：关键音可视化 / 低频增强 / 高频削减是否纳入 Standard（建议关键音可视化入 Standard，其余 Comprehensive/Phase-2）。
3. **`footstep` 是否必要**：12Hz tick + 俯视网格下脚步音有「连发噪音」风险，建议 P0 做但**默认低音量 + 节流**，试玩后决定保留/关闭。
4. **事件命名**：新增键名（§2 清单）是否锁定，锁定后交由程基岩在 `SFX.DEFS` 增补。

---
— 阮和鸣（audio-director）｜ DRAFT v0.1 · 对齐 art-bible §1–§3/§6 + accessibility #15/#19 + concept §2.3 + combat §②
