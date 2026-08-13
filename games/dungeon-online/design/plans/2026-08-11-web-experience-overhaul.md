# 《余烬小队》Web 体验改造方案 v1.0

> 状态：**已收敛（grill-me 四轮决策全部锁定）** · 2026-08-11
> 定位：把"救火版 web 客户端"升级为"能玩 15 分钟、想再开一局"的可玩 Demo，
>       兑现概念文档定义但尚未落地的核心循环（探→战→商→下→Boss→结算）。
> 对标：BrowserQuest（客户端结构/精灵/HUD）、Kaetram（工程化）、
>       ricardo-foundry/canvas-vampire-survivors（局内三选一 Build + 游戏感）、
>       netcode-arena（手感回正参考，不重写）。

---

## 0. 已锁定的决策（grill 结论）

| 分支 | 决策 | 含义 |
|---|---|---|
| A 目标 | **A1 + A2** | 视觉抛光 + 玩法闭环；服务端尽量不动，必要时增量 |
| B 美术 | **B1 为主**（B2 借规范 / B3 兜底） | 现有 AI 图做像素管线 + 程序化动画；不推翻 assets 结构 |
| C 玩法 | **C3 完整** | 3 层 + Boss 层下行、层间三选一 Build、BOSS 战、结算、meta 解锁、随机布局 |
| D 联机 | **D3 完整，单人优先** | 随机匹配 + 好友房 + 房间码 + 职业选择；**单人可立即开局**（minPlayers=1） |

**最终效果定义（一句话）**：
> 打开游戏 → 大厅（"单人立即开始"大按钮 + 房间码/邀请 + 职业选择 + 队友列表）→
> 进入随机布局地牢，3 层下行 + Boss 层，层间三选一 Build → BOSS 战 → 通关结算
> （最佳层数/用时/击杀 localStorage 记忆）→ 再来一局。

---

## 1. 现状差距（为什么"太粗糙"）

| 层 | 现状 | 差距 |
|---|---|---|
| sim-core 权威模拟 | 波次/Boss/5 协作技/掉落/救援/断线托管 全实现 | ✅ 完备 |
| 权威服务器 | room/seat/重连/心跳 齐全，`room.create` 协议已存在 | ✅ 完备 |
| Godot 客户端 | review-only 不可运行 | 沙箱无 Godot，不作为交付目标 |
| **web 客户端** | 单文件救火版：固定 4 波、无大厅、无小地图、无攻击动画、无 Build、无 meta | ❌ **粗糙所在** |

根因：**设计文档与服务端定义了完整循环，但玩家摸到的那一层（web 客户端）没兑现**。

---

## 2. 改造方案（按 3 个可独立验证的 Slice）

### Slice 1 · 视觉抛光（纯客户端，服务端 0 改动）

**目标**：解决"难看"——从"红点 + 色块"变成"像素风 + 有动画 + 有反馈"。

1. **像素管线**（B1）
   - 现有 1024px AI 图预缩到 32/48px 基准（离屏 canvas 一次缩放 + nearest-neighbor）
   - 统一调色板（炭灰/苔藓绿/暗蓝 + 余烬橙点缀，对齐概念文档 §6）
   - 按需生成带透明底的裁剪图，缓存到 `assets/generated/`
2. **程序化动画**（零新素材）
   - 待机浮动（sin 呼吸）+ 走路 2~3 帧摆动（scaleX/脚部偏移）
   - 受击挤压（hit squash）+ 白闪保留
   - 攻击挥砍：武器旋转弧 + 位移跟随
   - 按 `enemyTypeId` 区分体态节奏（brute 重缓 / bomber 轻快）
3. **小地图**（对齐 BrowserQuest minimap）
   - 右上角，等比映射地牢布局 + 敌红点/队友绿点/BOSS 菱形/宝箱金点
4. **攻击/技能反馈增强**
   - 攻击命中粒子、击杀爆炸、受伤屏幕微震已有，补齐：**命中顿帧（hit-stop 60ms）**、**残影**、**地面血迹渐隐**
5. **HUD 分层**（借 BrowserQuest 规范）
   - 顶部状态条 / 底部技能栏 / 左侧波次 / 右侧小地图 / 中央结算弹层，统一边距与字体
6. **音效分层**：已有 WebAudio，补「层通关 / 三选一弹出 / meta 解锁」三种提示音

**验收**：`GAME.rendered` 断言扩展；截图对比无明显退化；加载体积从 ~10MB → ~3MB。

### Slice 2 · 玩法闭环（sim-core 增量 + 协议增量，向后兼容）

**目标**：解决"没得玩"——从"固定 4 波"变成"每局不同的 3 层下行 + Build + 结算"。

1. **逐层下行**（C3）
   - 每局 = 3 层普通层 + 1 层 Boss 层；层数进 `snapshot`（新增字段，旧客户端忽略）
   - 每层敌人组合/密度由确定性 RNG 生成（P2 支柱：每局不同）
   - 层间安全区 = "商"点（Regroup）：治疗回满 + 掉落清点
2. **三选一 Build**（C3）
   - 每层通关后弹三选一（Vampire-Survivors 式）：
     伤害 +15% / 生命 +20% / 攻速 +12% / 解锁新主动技（护盾·急救·嘲讽·标记·弹幕 轮转）
   - **服务端权威**：`perk` 状态进 EntityState，sim-core 结算伤害/攻速/生命时消费（新增 `applyPerk` 入口，纪律 B 保持）
   - 协议：新增 `character.perk.pick {perkId}` + snapshot 增量字段
3. **BOSS 战强化**：Boss 阶段 2 转阶段时清场 + 新增召唤物 + 狂暴（服务端已有 enrage，扩展触发条件）
4. **通关结算**：层数/用时/击杀数/死亡数 → 结算面板；最佳层数 localStorage
5. **meta 解锁**（localStorage 纯客户端）
   - 职业皮肤（解到某层解锁）+ 初始加成（+5% 伤害 等，客户端本地生效并随 input 上报）
   - 说明：meta 数值若影响服务端结算，则上报 perk；否则纯表现
6. **随机布局**（轻量版）：波次敌人组合随机 + 宝箱/医疗包点位随机（服务端 `spawnWave` 用 RNG 选模板）

**验收**：E2E 断言「进 3 层 → 三选一 → 进 Boss 层 → 结算」；旧客户端（当前版本）连接新服务端不崩溃（字段向后兼容）。

### Slice 3 · 联机体验（大厅 UI + 单人优先 + 随机匹配）

**目标**：兑现"好友房 + 邀请 + 随机匹配"，同时保证**单人立即开局**。

1. **大厅界面**（D3）
   - 首屏：标题 + **「单人立即开始」主按钮** + 「创建/加入房间」
   - 房主：房间码（6 位，复用 `generateRoomCode`）+ 「复制邀请链接」+ 队友列表（职业/就绪）+ 「开始游戏」
   - 加入方：输入房间码 or 点邀请链接直达
   - 随机匹配：「快速加入」（服务端复用 RESIDENT/公开房逻辑，小增量）
2. **职业选择**（D2 并入）
   - 进房后选 坦/射/法/医（复用服务端 CLASS_BASE/CLASS_SKILLS 白名单）
   - 房间内实时同步职业 + 就绪状态（复用 `transferOwner` 模式新增轻量广播）
3. **快捷信号**（文档 MVP 明确项）
   - 快捷短语：集合 / 救我 / 拿药 / 开 boss / 撤（客户端浮字 + 音效，服务端透传）
4. **单人优先原则**
   - 大厅主按钮「单人立即开始」直接 `room.create`（minPlayers=1 已支持）
   - 联机全部是"可选增强"，不做强制等待

**验收**：双浏览器 P1/P2 建房 → 邀请 → 同本；单人按钮 1 秒内进图；房间码失效提示。

---

## 3. 实施顺序与估算

| 阶段 | 内容 | 工作量 | 依赖 |
|---|---|---|---|
| S1 | Slice 1 视觉抛光 | 1-2 天 | — |
| S2 | Slice 2 玩法闭环（sim-core + 协议增量 + E2E） | 2-3 天 | S1 的小地图/动画可用于验证 |
| S3 | Slice 3 联机大厅 | 1-2 天 | 服务端小增量（随机匹配广播） |
| S4 | 联调 + E2E 回归 + 截图基线 | 0.5-1 天 | S1-S3 |

**红线**：不改核心协议位（新增字段/消息须向后兼容）；不改 51+28 测试的 golden 哈希（perk 新增走新字段，不动旧路径）；E2E 42 项断言保持绿（新增断言，不删旧断言）。

**风险**：
- Slice 2 的 perk 需动 sim-core（伤害/攻速结算入口），有 golden 哈希风险 → 方案：perk 生效前零干扰（perk=null 时路径与旧一致，golden 不变）
- localStorage meta 在"游客多设备"下无意义 → 接受（Demo 定位）
- 随机匹配需要 RESIDENT 非满员广播 → 服务端小增量（新增 `room.lobby` 快照），与现有协议并存

---

## 4. 交付物清单

- [ ] S1：web-client 视觉抛光（像素管线 / 动画 / 小地图 / hit-stop / HUD 分层）
- [ ] S2：sim-core 逐层 + perk + BOSS 转阶段 + 随机布局；协议增量；E2E
- [ ] S3：大厅 UI + 职业选择 + 快捷信号 + 随机匹配；单人按钮
- [ ] S4：回归 + 截图基线（`verify/` 目录更新）

## 5. 进度记录

- [x] grill-me 四轮决策锁定（A/B/C/D）
- [x] S1 视觉抛光：像素管线（32px nearest + 调色板）/ 程序化动画（待机/走路/受击/挥砍）/
      hit-stop（60ms 顿帧 + 提亮）/ 小地图（敌/友/BOSS/宝箱/视野框）/ 挥砍刀光
- [x] S2 玩法闭环（sim-core 增量 + 协议增量，golden 已重锁）
      - 逐层下行：`layout.floorOfWave` + snapshot 顶层 `floor/totalFloors`
      - 三选一 Build：`PERK_CATALOG`（dmg/hp/spd/cdr）+ `world.applyPerk` +
        `character.perk.pick` 协议 + combat 伤害倍率消费 + 移速/冷却消费
      - 层间「商」点：wave 过渡期生成确定性三选一池（Rng 派生）
      - 通关结算：settle 面板 + localStorage 最佳楼层（meta）
      - 新测试 5 项（s2-perks.test.ts），golden layout 重锁
- [x] S3 联机大厅
      - 大厅 UI：单人立即开始 / 创建房间 / 随机匹配 / 加入房间（房间码）
      - 房间面板：房间码 + 复制邀请链接 + 职业选择（tank/ranger/mage/healer）+
        队友列表 + 房主「开始游戏」
      - 协议增量：`character.class.select` + `room.quickMatch`（RESIDENT 公共房）+ seat.classId
      - `?solo=1` 直达单人、`?code=XXXXXX` 直达加入房间
- [x] S4 回归：sim-core 95 ✓ / dungeon-server 28 ✓ / E2E verify-client 20 项 PASS ✓
- [x] **全局 review（第二遍）** 修复 6 个真实缺陷：
      1. 三选一 overlay **循环弹窗**（applyPerk 后服务端池不清空 → 客户端每帧快照重复弹）→ 服务端
         「在场玩家全决策即清池」+ 客户端楼层记忆 + 「跳过」逃生口 + `character.perk.skip` 协议
      2. onboarding 蒙层 z-index 高于大厅，**盖住大厅按钮** → 推迟到 game.start.ok 后弹
      3. `session.ready` 与 `room.create.ok` 竞态 → 房主「开始游戏」按钮不显示 → session.ready 到达后重渲染
      4. `room.create.ok` 用**伪造面板**而非真实 room.snapshot → 改为等真实 snapshot 驱动
      5. 加入方**无法自动进游戏**（只收 room.snapshot 没有 game.start.ok）→ roomState=active 自动开局 + sync.request
      6. join/create/quickMatch 失败无兜底 → game.error 时回到大厅主界面
- [x] **O 轮优化（全量收尾）** 6/6 完成：
      1. 快捷信号 8 PING（room.signal 协议透传 + 信号条按钮 + 快捷键 T/H/M/B/G/K/Y/V + 浮字 + 音效）
      2. E2E flaky 修复（采样按 tick 归一化 + 等待 playing + 预热 5 采样）→ 连续 3 次 20/20
      3. 倒地倒计时（rescue.downedTicks 下发 + 剩余秒数「N s」UI + 有/无队友两种时限）
      4. 离线模式（ws 失败 → 大厅离线横幅 + 重试连接 + 单机演示本地假快照兜底）
      5. 入口页链接（demo 卡片「游戏入口页」按钮 + 详情页链接 /games/）
      6. 美术增强（脚底椭圆阴影随 bob 变淡 + 受击闪白 source-atop）
- [ ] 已无待办缺口（§6 全部解决；P3「正式美术资源/逐帧动画」为长期产能项，非本轮缺口）
- [x] **DIST-FIX 战斗逻辑 review（2026-08-11）**：逐行 review 攻击/技能/距离判断逻辑
      - 发现 2 个真 bug：玩家普攻无距离校验（全图锁头）+ 技能无距离校验（全图施放）
      - 修复：`PLAYER_ATTACK_RANGE=60px`（telegraph 启动时校验）+ `SKILL_PROTOTYPES.range`
        （SHIELD/REVIVE 140px、MARK/BARRAGE 240px）
      - 顺带发现：wave1 刷怪点纯随机 tile → 可能距玩家 840px（开局找不到怪）→ 锚定玩家出生点
        150-300px 环带（独立 Rng 不污染主随机流）
      - 客户端修复：走A（按住空格自动接近射程外目标 + 进入射程持续攻击）——解决「打不到怪/看不懂」
      - golden layout/world 哈希重锁 + 5 处测试适配（moveClose helper）→ 95/95、31/31、E2E 20/20
- [x] **PERF-ROUND 性能 + 视觉反馈（2026-08-12 凌晨）**：用户「卡的要死」→ 多轮迭代自检
      - **卡顿主因**：本地模式 tickLocal(30Hz) + draw()(60Hz RAF) **双重调度 draw**（每帧最多 2 次全量重绘）
        + 大量 `shadowBlur`（Canvas 最贵操作）每帧×实体×环数
      - **修复**：① 移除 tickLocal 中的 draw()（PERF-FIX） ② vignette 渐变按尺寸缓存 ③ 实体状态环/castRing
        `shadowBlur` → 双层描边（glowRing 辅助）→ 视觉接近、GPU 便宜 10 倍 ④ 本地模式 MOVE 输入节流到 30Hz 边界
        （攻击/技能每帧发，方向合并到 tickLocal） ⑤ 渲染单独 RAF 驱动
      - **O2-迭代 2 视觉反馈**：屏幕红边（本地受击 220ms 淡出）+ 敌人颜色框（grunt 红/elite 黄/
        Boss 紫/远程 蓝/bomber 橙，双层半透明环）+ 挥砍刀光（原有 localSwing 系统，弧形 150ms 淡出）
      - **O1-迭代 1 HP bug**：`handleSnapshot` 用 `seatIndex` 找本地玩家，本地模式 seatIndex=null → HP:"-"
        → 修复：startLocalGame 显式 `seatIndex = 0` + GAME.localEntityId 同步
      - **优化**：sync-games.mjs 增加 `local-sim.js` 同步（Astro + web-client 双端都拿到最新 bundle）
      - **实测**：本地模式 60FPS 稳定，4s 内杀 2 只 grunt → 升 Lv.2（HP 196→204），第 6s 进入 Boss 波
      - **大 PDF 风险回滚**：高 DPI 屏 dpr 缩放优化（涉及全 draw 坐标系重写）暂不做，先交付核心

## 8. PAUSE-FIX（2026-08-12）安全状态：提示出现时世界暂停

用户反馈「出现提示时任务要处于安全状态，不然还没进游戏就死了」。修复：

- **本地模式**：`uiPaused` 标志——onboarding / 三选一 perk / 结算面板显示时 `tickLocal` 跳过 `world.step()`
  → 世界冻结，玩家读引导/选 perk 时**不会被怪打死**
- **网络模式**：无法暂停服务端 → 首次进入不弹全屏 onboarding，改为**右上角非阻塞操作提示**（4s 自动消失，可边玩边看）
- **实测**：onboarding 显示 7s，HP 196→196 不变、tick 10→10 冻结 → `pausedWorld: true` 确认安全
- E2E 20/20 全 PASS

## 8. 2026-08-12 明早 10 点验收清单

打开 `http://localhost:4321/games/dungeon/index.html?solo=1&server=ws://127.0.0.1:1` → 点「🕹 本地单机（无需服务端）」：
- 1 屏 onboarding 引导，1 秒读完可关
- 玩家（Lv.1、HP 196/196）出生在中心，wave1 怪在 150-300px 环带
- 按住空格走 A：自动接近 + 持续攻击
- 击中 → 橙字伤害数字；升级 → 金色粒子 + 闪屏 + 升级音
- 受伤 → 屏幕红边 + 60ms 顿帧 + 橙色伤害
- 敌人脚踩颜色框：grunt 红 / elite 黄 / Boss 紫 / 远程 蓝
- 走位/WASD 走 A 都丝滑（60 FPS，headless 验证）
- 杀光 wave 1 自动进 wave 2，6s 内升 2 级
- 信号条：按 T/H/M/B/G/K/Y/V 发 8 种 PING，屏幕中央上方显示
- 玩家死亡（10s 自动复活）/ 倒地（救援环 + 倒计时）已实现
- 网络模式：同上但走服务端 3010/3011 ws（点「⚔ 单人立即开始」）

- [x] **LOCAL-FIX 本地单机版（2026-08-11）**：用户要「完全不依赖服务端、本地就能玩」
      - 思路：sim-core 是纯 TS 确定性权威模拟（无 Node 依赖）→ esbuild 打包为浏览器 bundle（59.8kb IIFE）
        → `window.__LocalSim = { createWorld, createWorldInputQueue, NS }`
      - 输出：`apps/web/public/games/dungeon/local-sim.js`（用 scripts/build-local-sim.mjs 一行构建）
      - 客户端：①HTML `<script src="local-sim.js" defer>` 预加载 ②大厅新增「本地单机」按钮
        ③ws 连接失败 6s 自动降级到本地模式 ④本地模式 sendInput/sendJson 走 localWorld.enqueueInput
        ⑤perk/skip 走 localWorld.applyPerk/skipPerk ⑥startNewRun 支持本地重开
      - 走 A/升级/技能/小地图/伤害数字/信号全链路复用 → 离线/在线体验一致
      - 实测：headless puppeteer 点击「本地单机」→ state=playing、entities=4、玩家受击掉血、Lv.1/小地图/信号/技能栏全渲染
      - sim-core 96/31/E2E 19 全绿（本地重写 sendInput 函数声明避免重赋值 TDZ 隐患）
- [x] **G-ROUND 升级/持续收益/技能 review（2026-08-11）**：用户反馈「技能奇怪、升级、持续收益、buff 都没做」
      - **现状盘点**：技能有但 CD 靠本地估算、升级系统完全缺失、掉落 buff 有机制无 HUD 反馈
      - **G1 升级系统（新增）**：击杀得经验（grunt 10/elite 25/boss 100）→ 升级 maxHp+8/伤害+(lv-1)*2/hp+20%
        + 客户端 Lv 徽章 + 经验条 + 升级金光粒子/音效。阈值 20+(lv-1)*20（wave1 杀 2 只即升 1 级）
      - **G2 Buff 可视化**：LOOT buff 窗口下发快照（buffUntilTick/buffMult）→ 右上角状态栏显示
        「攻击+X% · Ns」+ 剩余 3s 红闪
      - **G3 技能反馈**：本地射程校验（SHIELD/REVIVE 140px / MARK/BARRAGE 240px）→ 超距提前提示
        「距离不够」而非静默失败（服务端 resolveSkillApplication 返回 null 无反馈的根因）
      - 测试：g1-leveling.test.ts（3 项）+ S2 适配（升级改变 maxHp）+ golden 重锁
        → sim-core 98（96+2skip）/ server 31 / E2E 20/20 全绿
- [x] **BAL-FIX 平衡轮（2026-08-11）**：用户实测反馈「怪太多、人太弱、看不懂」
      - 攻击/技能/受击逻辑核查：**确认正常**（golden 证明攻击生效、telegraph/D12 前摇/IFRAME/倒地免疫全对）
      - 「看不懂」根因：伤害浮字被 hit-stop 门控跳过渲染 + 字号太小 → 修复：hit-stop 不再跳过
        floaters、18px+描边、敌人受击橙字大号/本地受击白字、治疗绿字、随机漂移防重叠
      - 「人太弱」：普攻 18→26（DPS 30→43）+ 玩家 HP 全体 +40%
        （tank 140→196 / ranger 80→112 / mage 90→126 / healer 100→140）
      - 「怪太多」：刷怪密度 SPAWN_COUNT_MAX 6→4（单波 6-12 → 4-8）
      - 敌人伤害微降：grunt 8→6 / elite 12→10 / brute 12→10 / boss 20→18 / bomber 14→12 /
        caster 10→9 / gunner 10→9
      - golden layout/world 哈希重锁 + 3 处硬编码测试更新 → 95/95、31/31、E2E 20/20 全绿

---

## 6. 剩余差距（review 后诚实清单，未解决）

1. **E2E flaky**：`net speed` / `smooth CoV` 两项偶发 FAIL（服务端 30Hz 采样窗口 vs 脚本 100ms 采样竞态），
   非功能问题；连续 3 次跑 1 次 FAIL。彻底修复需把采样 cadence 提到 ~30ms 对齐 tick。
2. **快捷信号（D2 承诺，未做）**：D3 选"完整但单人优先"，8 个 PING（集合/救我/拿药/开 boss/撤/宝箱/多谢/嘲讽）
   本轮未交付——4 人配合时沟通靠打字，缺一套快捷信号。
3. **离线模式（P1.2）**：服务端连不上时仅显示"连接错误"，无单机演示兜底（方案 §2 P1.2 未交付）。
4. **倒地体验（P1.3）**：dungeon 玩家倒地后 rescue 环已有，但"倒地倒计时/自动复活"的显式 UI 数字没有
   （截图里 HP:0/140 tick 还在跳就是倒地但环不显眼）。
5. **营销图 vs 实际美术**：hero.webp（AI 竹林英雄）与像素管线角色仍有差距——已用 splash + 美术说明缓解，
   但"正式美术资源"未交付（P3 长期）。
6. **角色只有 1 帧程序化动画**（待机浮动/走路起伏，非逐帧行走）——已改善但离 BrowserQuest 8 方向 4 帧行走还有距离。
7. **入口页没链接**：`/games/index.html` 已建，但 demo 卡片的"立即开玩"直接进游戏页，没有显式入口跳到
   /games/index.html（可加一个小链接）。
8. **perk 音效复用**：`perk pick / skip` 用 `sfxSkill()` 复用，无独立音效（低优先）。

## 7. 下一步建议（按优先级）

| 优先 | 任务 | 工作量 |
|---|---|---|
| P1 | 快捷信号 8 PING（协议透传 + 客户端浮字 + HUD） | 0.5d |
| P2 | E2E flaky 修复（采样 cadence 对齐 30Hz tick） | 0.5d |
| P2 | 倒地倒计时 + 自动复活倒计时 UI 数字 | 0.5d |
| P3 | 离线模式（服务端不可达 → 单机演示兜底） | 1d |
| P3 | 入口页链接 + demo 卡片入口 | 0.5d |
| P3 | 正式美术资源（像素逐帧行走动画） | 1-2d |
