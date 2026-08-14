# 江湖 jianghu · 浏览器客户端 C3（客户端体验大修）

> 目标：零安装即玩 —— 浏览器打开即连真实 jianghu 权威服务端，看到/玩到 **主世界移动 + 技能 + 进副本 + 掉落装备**。
> 自包含单文件（Canvas 2D + WebSocket，内联 CSS/JS，**无构建步骤**）。
> C2 新增（纯客户端，服务端 E6 已上线）：**本地移动预测 + 远端插值（手感）**、**打击感（伤害飘字/受击闪白/技能光效/格挡反馈/击杀粒子）**、**掉落可见性（稀有度光柱/拾取提示/拾取 toast）**、**背包面板（I 键）**。
> E7 新增（服务端 E7 装备实装）：**装备栏（3 槽）+ 属性面板** —— 背包物品点「装备」穿装，攻击/生命/暴击立即提升（服务端权威，见 §2）。
> E19 新增（服务端 E19 装备强化实装）：**强化石 + 强化按钮** —— 击杀精英/BOSS 掉强化石，背包物品点「强化」+5（词缀 ×1.15/级）。
> E21 新增（服务端 E21 药水实装）：**Q 喝药** —— 击杀精英/BOSS 掉疗伤药（普通怪概率），喝药回 30% 生命 + 5s CD；HUD 药水槽 + 回血绿字 + 咕嘟音效。
> C3 新增（用户试玩反馈 · 纯客户端）：**①相机锁定跟随**（人物不超屏，世界 40×30 格 clamp 不露空白）**②点击定位修正**（mouseup 重算 + 命中用渲染位置 + 屏幕空间半径）**③飘字跟随实体**（锚定 entityId，每帧按实体渲染位置换算）**④技能 HUD**（烈斩/剑气/震地/破军 + 悬停描述 + 冷却环）**⑤程序化武侠剪影**（斗笠侠客 / 山贼 / 野兽 / 暗影刺客 / 巨魔 + 掉落物品图标 + 入口漩涡增强，零外部资源）。
> E23 新增（纯客户端 · 技能光效差异化）：四技能**按下即播**本地差异化光效（不等服务端命中，命中后叠加命中闪光/飘字），视觉与 E11 定位/数值匹配 —— **烈斩=短促白色挥砍弧（90°/0.15s 近战感）、剑气=直线剑气波（青白金，飞 2.5×TILE+尾迹，到终点消散）、震地=地面震荡圈（土褐圆环+裂纹，2.0×TILE/0.3s）、破军=大范围斩闪（180° 红金巨弧+轻微屏幕震动，1.8×TILE/0.2s）**；范围对齐服务端 `SKILL_RANGE_BY_SLOT=72/120/96/86px`。同时修正客户端 SKILL_INFO 镜像（CD 3/5/4/8s、范围 1.5/2.5/2.0/1.8 格），HUD tooltip 与 CD 环对齐。服务端零改动。
> E26 新增（纯客户端 · 小地图增强）：右上角 minimap 按 kind 区分**形状/颜色** —— **玩家金点 / 队友暖橙点 / 敌人小红点 / BOSS 大红菱形（呼吸）/ 宝箱金方块（脉动）/ 入口紫色漩涡 / 地面掉落按稀有度 白·蓝·金·暗金 小点**（副本内打完 BOSS 找宝箱、找入口出本一眼可见）；minimap 盒改为世界 40×30 格**等比映射**（152×114 = 1920×1440 = 4:3，格子在图上为正方形，原 150×112 略扁已修正）；副本 world 同主世界 40×30 → 同一比例。服务端零改动。
> E27 新增（纯客户端 · 新手引导）：7 步逐动词引导（**点击移动 → 点击普攻 → 走近拾取 → I 背包穿装 → Q 喝药 → 数字键 1 放烈斩 → F 进/出副本**），**完成条件即「检测已会」**（移动/普攻/拾取/穿装/喝药/技能/进本任一动作做到即推进）；`localStorage`（`jh.onboarding.seenSteps`）记忆 + 老玩家（有穿装 / 等级>1 / 曾进本）整段跳过仅留 playhint；游客 Step3/4 自动跳过 + 一次性「登录可保存」提示；`?debug=1` 整体静默（E2E 不干扰）。服务端零改动。

---

## 1. 快速开始（3 步）

### ① 起 jianghu 服务端（终端 A）

```bash
cd games/jianghu/apps/jianghu
DEV_SKIP_AUTH=true PORT=3011 node --experimental-strip-types src/server.ts
```

- 端口默认 **3011**（`src/config.ts`：`port: num("PORT", 3011)`）。
- `DEV_SKIP_AUTH=true` 免登录（config 默认也是开启，除非显式 `DEV_SKIP_AUTH=false`；建议显式传，语义清晰）。
- 启动日志应看到：`server listening on :3011 (ws /ws/jianghu)` + `RESIDENT run ticking @ 12Hz`。

### ② 静态服务本目录（终端 B，任选其一）

```bash
cd games/jianghu/apps/web-client
python3 -m http.server 8080
# 或：npx serve . -l 8080
```

### ③ 浏览器打开

```
http://localhost:8080/index.html
```

即自动连接 `ws://localhost:3011/ws/jianghu?devUserId=dev` 并进入主世界。

**可选 URL 参数：**

| 参数 | 默认 | 说明 |
|---|---|---|
| `server` | `ws://localhost:3011` | 覆盖服务端地址（如 `?server=ws://192.168.1.5:3011`） |
| `devUserId` | `dev` | 开发身份（免登录）；换一个即换一个角色座位 |
| `debug` | 关 | `?debug=1` 打开调试钩子（E2E/排障用，见 §4） |

> 直接双击 `index.html`（`file://`）通常也能跑，但个别浏览器对 `file://` 页发起 WebSocket 有 Origin 限制，**推荐静态服务**。

---

## 2. 操作说明

| 操作 | 按键 | 说明 |
|---|---|---|
| 移动 | `W A S D` / 方向键 | 8 向移动（**本地预测**：按键即时移动，体感 <50ms；按住持续移动，12Hz 上报；松开即发 STOP 立即停） |
| 格挡 | `空格` / 格挡按钮 | 服务端开 250ms 格挡窗口（PARRY_TICKS=3）；窗口内减伤 60%，角色出现青蓝护盾光环 + 「格挡中」提示；受击时 parry 生效显示「格挡！」+ 盾闪 |
| **喝药**（E21） | `Q` / HUD 药水槽 | 发 `character.usePotion` → 服务端权威回血 **30% 生命上限**（`hp = min(maxHp, hp + round(maxHp×0.3))`）+ **5s CD**（POTION_CD_TICKS=60）；回血绿字 +N + 咕嘟喝药音效 + CD 冷却环；**满血不可用**（FULL_HP，不浪费）；开局 **2 瓶疗伤药**，击杀精英/BOSS 固定掉落（普通怪 10% 概率） |
| 技能 1-4 | `1 2 3 4` / 按钮 | 服务端权威范围命中（E11 差异化半径 1.5/2.5/2.0/1.8 格）。**C3 按钮显示中文名**（烈斩/剑气/震地/破军）+ 悬停 tooltip（描述/伤害/范围/CD）+ 冷却环（conic 扫角 = 剩余 CD 占比，数字保留）。**E23 技能光效差异化（按下即播，本地即时反馈）**：烈斩=短促白色挥砍弧（面前 90° 快弧 0.15s）、剑气=直线剑气波（青白金沿朝向飞 2.5 格 + 尾迹，波到终点消散）、震地=地面震荡圈（土褐圆环 + 裂纹扩散 2.0 格 0.3s）、破军=大范围斩闪（180° 红金巨弧 + 轻微屏幕震动 1.8 格 0.2s）；服务端命中后叠加命中闪光/飘字 |
| 拾取 | 走近掉落自动拾取 | 靠近掉落（≤1.5 tile）显示「按 F 拾取」提示；服务端为**重叠自动拾取**（PICKUP_RADIUS=1 tile），走近即入包；按 F 发 SIGNAL（服务端忽略，占位）。**C3 掉落光柱内含物品剪影图标**（武器/护甲/饰品按 itemId 槽位） |
| 背包 | `I` / HUD「背包 [I]」按钮 | 打开时拉 `character.inventory.get` 全量 + 拾取后实时推送刷新；格子显示稀有度色边框 + itemId 短号 + 词缀数 + 槽位；空背包显示「空」；游客也显示 |
| **装备**（E7） | 背包物品点「装备」按钮 | 发 `character.equip {itemId}` → 物品从背包移入对应槽（武器/护甲/饰品）；服务端回推 `character.inventory`（含 `equipped`）；**攻击/生命/暴击立即提升**（服务端权威 `setPlayerEquipped` → world maxHp/attrs 即时生效） |
| **卸下**（E7） | 点击装备栏已穿槽位 | 发 `character.unequip {slot}` → 物品回背包；背包满则拒绝（BAG_FULL） |
| **属性面板**（E7） | 背包面板顶部 | 攻击 / 生命 / 暴击（来自快照 `EntityState.attrs`，服务端装备后回填：`atk = 10+装备atk`、`maxHp = 100+装备maxHp`、`crit = 暴击率%`） |
| 进副本 | 走到裂隙入口附近 → `F` 或「进副本」按钮 | 发 `dungeon.enter`；服务端校验主世界 + 入口 10s 冷却（`tryEnterEntrance`） |
| 出本 | 副本内按 `F` 或「出本」按钮 | 发 `dungeon.exit`，回主世界安全区 |
| 缩放 | 滚轮 | **C3 相机锁定跟随本地玩家**（预测位置 → 按键即时动），缩放区间 0.45×~2.5×；**拖拽不再平移相机**（仅抑制点击动作），相机 clamp 到世界 40×30 格内（不露出世界外空白）。双击重置 follow 标志 |
| 小地图 | 右上角 | **E26 按 kind 区分形状/颜色**：玩家金点 / 队友暖橙点 / 敌人小红点 / **BOSS 大红菱形（呼吸）** / **宝箱金方块（脉动）** / **入口紫色漩涡** / **地面掉落按稀有度 白·蓝·金·暗金 小点** + 视野框（世界 40×30 格**等比映射**，副本同比例） |

**HUD**：顶部 = 连接状态 / 房间（主世界·副本）/ tick / 实体数 / 本地 HP 条 / 格挡态 / 技能 CD / **队伍提示（E17：快照含队友时「队伍：N 人」）** / **背包按钮** / **音效开关（🔊/🔇）+ 音量滑块**（E12）；底部 = 技能栏 + **药水槽（E21：「Q 疗伤药 ×N」+ 数量 + CD 冷却环，无药水半透明）**；屏幕下方 = **拾取 toast**（「拾取 [稀有度色]品（词缀×N）」）。

**打击感（纯客户端表现）**：实体 HP 下降 → **C3 飘字锚定实体**（头顶 -N，敌人受击黄 / 玩家受击红，1s 淡出上飘；**每帧按实体当前渲染位置换算屏幕坐标，实体移动/相机移动时跟随**）+ **150ms 受击闪白** + 扩散环；玩家放技能 → **E23 差异化本地光效（按下即播，按槽位：烈斩白色挥砍弧 / 剑气直线波 / 震地土褐震荡圈 / 破军红金斩闪 + 屏幕震动）**，命中叠加扩散环/闪白；击杀 → 6-12 个小方块粒子四散淡出。

**E12 音效（WebAudio 程序化合成，零外部资源 / 零网络请求）**：所有音效由 `SFX` 模块（`index.html` 内独立 IIFE，不耦合既有逻辑）实时合成——攻击/技能/命中/格挡/拾取/升级/倒地/复活/进出副本/断线重连/UI 点击/敌人死亡共 18 种。**浏览器自动播放策略**：首次用户手势（pointerdown/keydown）才惰性创建 `AudioContext` 并 resume；无手势 / 无音频环境 / 静音时 `play()` 直接 return（不创建 ctx、不抛错），E2E Z1-Z3 零报错。**音量控制**：HUD 顶部 🔊/🔇 按钮（点击静音/恢复）+ 音量滑块；默认开启，`localStorage`（`jianghu_sfx_vol` / `jianghu_sfx_muted`）记忆。技能音效按 slot 区分（`skill_1..4`）；普攻挥砍音 350ms 节流（input loop 12Hz 连发防机枪声）。

**C3 程序化武侠剪影（零外部资源，Canvas 路径绘制）**：
- **玩家「斗笠侠客」**：圆帽（帽檐椭圆 + 帽顶两层）+ 披风 + 剑轮廓（剑身 + 护手），按 `dir` 旋转朝向；本地更亮 + 描边高光；倒地灰色平躺；IFRAME 半透闪烁；复活无敌叠加金色圆环。
- **普通怪**（协议未下发 enemyTypeId，用实体 id 稳定哈希确定性区分）：**山贼**（红头巾 + 粗布衣 + 短刀）/ **野兽**（拉长躯干 + 吻 + 双耳 + 尾 + 四腿 + 凶光眼）。
- **精英「暗影刺客」**：尖兜帽 + 披风 + 匕首，暗紫调 + 幽青眼。
- **BOSS「巨魔」**：巨块身躯 + 弯曲双角 + 金红眼 + 两侧巨拳，深色调。
- **掉落物品图标**（按 `itemId % 3` 槽位，镜像服务端 `itemProto`）：武器（剑剪影）/ 护甲（盾）/ 饰品（戒指/宝石），稀有度色描边。
- **入口「裂隙」**：旋转涡流 + 径向外发光增强（呼吸脉动）。

**E17 客户端多人渲染（纯客户端；服务端 E13 已支持多人同本，本版本零服务端改动）**：
- **队友识别**：`kind===0 && id!==localEntityId` → 队友（非本地玩家；主世界/副本通用——任一房间快照出现其他玩家即按队友渲染）。
- **渲染差异**：队友斗笠侠客改**暖橙调**（本地保持深青）+ 头顶**名牌**「侠客·N」（N=ownerId/seatId；服务端未下发用户名，MVP 取舍：真实用户名归 Phase-3）；倒地（DOWNED）队友躺尸灰 + 名牌变灰；本地玩家保持现状（金圈标识，不加名牌）。HP 条保留。
- **队伍提示**：快照含队友时 HUD 显示「队伍：N 人」（N 含本地玩家）。

**新手引导（E27，纯客户端）**：
- **7 步**：①点击移动 ②点击普攻 ③走近拾取 ④I 背包穿装 ⑤Q 喝药（扣血触发）⑥数字键 1 放烈斩 ⑦F 进/出副本。每一步 = 一个真实输入动词；气泡（中文文案 + × 按钮）+ 高亮（玩家脚下脉动圈/箭头、最近敌人红圈、掉落描边、入口描边、背包/药水/技能槽按钮脉动）。
- **已会检测**：完成条件即检测（移动 >8px、`lastAttackAt`/首杀、拾取 toast/背包增量、`equipped` 变更、回血/药水 CD、`lastSkillFx`、`state==='dungeon'`）；做过的动作自动跳过，不重复教。
- **跳过方式**：气泡 `×` 或 `ESC` 整段静默（写 `jh.onboarding.dismissed`，刷新不再弹）；老玩家（有穿装 / 等级>1 / 曾进本）自动整段跳过，仅保留底部 playhint；回归玩家按 `jh.onboarding.seenSteps` 只补未完成步。
- **游客分支**：Step3 拾取 / Step4 穿装 游客背包恒空 → 跳过，并一次性 toast「注册登录后拾取/穿戴的装备才会保存」；Step1/2/6/7 照常。
- **debug 静默**：`?debug=1` 时引导整体禁用（E2E 断言 `window.__game.onboarding.enabled===false` 且 `step===0`）。

---

## 3. 协议解析要点（实测帧结构，客户端 `decodeSnapshot` 与服务端 `protocol-binary.ts` 对称）

**双平面**：控制面 JSON（显式 `type`）；数据面二进制（`ws.binaryType='arraybuffer'`，`ws.send(Buffer)`）。

**连接时序**：`connect(/ws/jianghu?devUserId=)` → 收 `session.ready`（含 `seatId/tickMs=83.33/tickRate=12`）→ 发 `room.join` → 收 `room.join.ok`（`roomId=room_resident_public` + `reconnectToken`）→ 持续收二进制快照（12Hz，主世界含 4 个漂浮 LOOT_GROUND + 1 个 ENTRANCE + 自己）。

**二进制快照帧**（全量帧；msgType 判别）：

```
[msgType:u8=0x01][tick:u32 LE][entityCount:u16 LE]
+ 每实体：
  [id:u16][changeMask:u16][pos.x:i16][pos.y:i16][kind:u8][dir:u8]
  [hp:u16][maxHp:u16][status:u16][seCount:u8][(type:u8, remainingTicks:u16) × seCount]
  + 条件字段（changeMask 位决定，编码侧恒含 POS|KIND|DIR|VITALS|STATUS_EFFECTS）：
    bit5 OWNER      u16 ownerId
    bit6 PARRY      u8 active + u32 windowEndTick
    bit7 LOOT       u32 itemId + u8 rarity + u8 affixCount + u8×affixes + u16 ttlTicks
    bit8 TELEGRAPH  u8 shape + u8 color + u32 startTick + u32 applyTick + u16 radius
    bit9 ENTRANCE   u16 cooldownTicks + u32 lastUsedTick
    bit10 TIER      u8 tier (0 normal / 1 elite / 2 boss)
    bit11 SKILL_CD  u16×4 skillCd
    bit12 ATTRS     u8 str + u8 dex + u8 vit + u8 hasExt + (u16 atk + u16 maxHp + u16 crit千分比)×hasExt   ← E7 扩展
```

**kind**：0=PLAYER 1=ENEMY 2=BOSS 3=LOOT_GROUND 4=TELEGRAPH 5=ENTRANCE。

> **E17 队友判定**：`ownerId`（bit5）对玩家恒下发（服务端 `encodeEntity` 在 `ownerId!==undefined` 时置 OWNER 位）；客户端 `decodeSnapshot` 已解析。本地玩家 = `kind===PLAYER && ownerId===seatId`；其余 `kind===PLAYER`（`id!==localEntityId`）即队友，名牌用 `ownerId`（=seatId）编号。

**输入**（`gateway.routeInput` 只读 `msg.payload?.cmd`，**放顶层会被静默丢弃**）：

```js
ws.send(JSON.stringify({
  type: 'input.cmd',
  payload: { cmd: { seq: 1, tick: <lastTick>, action: 0, dir: 0 } }   // seq 严格递增
}));
```

- `action`：0=MOVE 1=PARRY 2..5=SKILL1..4 6=SIGNAL 7=STOP（技能须带 `skillSlot: 0..3`）。
- `dir`：0=E 1=SE 2=S 3=SW 4=W 5=NW 6=N 7=NE（顺时针，屏幕坐标 y 向下）。
- **STOP（7）**：全部移动键松开 / 失焦 / 切页 / 断连前，客户端发 `action:7`；服务端 `world.enqueueInput` 清该 seat 的 `pending` + `lastMove`，下一 tick 起立即停（不再沿最后 MOVE 惯性滑行）。STOP 也走同一 `seq` 单调计数（C11），回退 seq 不生效。
- **SIGNAL（6）**：靠近掉落按 F 时发送（服务端 world.step 忽略未识别 action，仅客户端占位；拾取走重叠自动拾取）。
- **客户端不锁 target、不发伤害量** —— 技能命中/格挡/伤害全部服务端权威（`combat.resolveSkill`/`resolveDamage` 按范围结算）。

**E6 背包数据通道（控制面）**：

```js
// 打开背包面板拉全量（异步回复同格式）
{ type: 'character.inventory.get', requestId: 'inv1' }
// 拾取入库成功 / E7 装备/卸下 → 服务端推送（与 get 回复同一格式，items 可能为空）
{ type: 'character.inventory', items: [{ itemId, rarity, affixes: number[], slot: 'weapon'|'armor'|'trinket' }], equipped: { weapon?: {...}, armor?: {...}, trinket?: {...} }, cap: 60 }
```

- 登录玩家（`DEV_SKIP_AUTH` + `devUserId`）拾取入库后推送；游客零持久写（不推送，`items: []`）。
- 客户端以 itemId 去重做增量 toast（新入库物品 → 屏幕下方拾取提示）。
- **E7**：`items[].slot` 由服务端 `itemProto(itemId)` 确定性推导；`equipped` 为 3 槽已穿戴（客户端装备栏渲染）。

**E7 装备 / 卸下（控制面）**：

```js
// 穿装：物品从背包移入对应槽；换装时原槽装备自动回背包
{ type: 'character.equip', requestId, payload: { itemId } }
// 卸下：槽位物品回背包（背包满 → BAG_FULL 拒绝）
{ type: 'character.unequip', requestId, payload: { slot: 'weapon'|'armor'|'trinket' } }
// 两者成功均回复 character.inventory（含 equipped）；失败回 game.error（ITEM_NOT_FOUND / BAG_FULL / SLOT_EMPTY / BAD_SLOT / NOT_LOGGED_IN）
```

- 装备是**服务端权威**：`world.setPlayerEquipped` 即时更新 actor maxHp/attrs，战斗伤害（技能 +atk、暴击×1.5、减伤、攻速、移速）由服务端按装备计算；客户端只发 itemId/slot，不自行改属性。

**进本/出本**：

```js
{ type:'dungeon.enter', requestId, payload:{ entranceId:1 } }   // → dungeon.enter.ok(roomId, reconnectToken)
{ type:'dungeon.exit',  requestId }                             // → dungeon.exit.ok(roomId=RESIDENT)
```

**重连**：断线自动重连（1s→5s 退避）→ 新连接 `session.ready` 后发 `session.reconnect { payload:{ roomId, reconnectToken } }` → `session.reconnect.ok`（原副本存活则回副本；已销毁则 `fellBackToResident` 回主世界，服务端 `validateReconnect` 校验 token 寿命）。

---

## 4. 调试 / 自动化钩子（`?debug=1`）

页面暴露 `window.__game`：

```js
GAME.connected / state / seatId / roomId / reconnectToken / lastSnapshot / localEntityId
GAME.snapshotCount / lastTick / skillCd / parryActive / localHp / localMaxHp / lastLocalPos
GAME.predicted / localRenderPos / renderTick     // C2 本地预测渲染位置 / 远端插值 tick
GAME.lastHits / lastKills / lastSkillAt          // C2 打击感：最近伤害飘字 / 击杀 / 技能时刻（C3 lastHits 含 entityId）
GAME.lastSkillFx                                  // E23：最近一次技能光效 {slot, type}（slash/beam/quake/crush；E2E 断言钩子）
GAME.inventory {items,cap,loaded} / GAME.equipped / pickupToasts / nearLootId / pickupHint / invOpen
GAME.cam {cx,cy,scale,w,h} / GAME.playerScreenPos / GAME.floatTexts[] / GAME.rendered {enemies,lootSlots,entrance,player,party}   // C3 相机+飘字+贴图标志（E17：party=本帧渲染队友数）
GAME.minimapMarkers {boss, chest, entrance, loot}   // E26：小地图标记计数（drawMinimap 每帧刷新；副本内 BOSS/入口存在）
GAME.onboarding {enabled, step, seen, graduated, veteran, dismissed}   // E27：新手引导状态（debug 下 enabled=false/step=0；E2E 断言钩子）
GAME.partyMembers    // E17：当前快照队友列表 [{id,ownerId,kind,hp,maxHp,pos,status}]（kind=PLAYER 且 id!==localEntityId）
GAME.errors          // 收集的运行时/解码错误
GAME.debugEnterDungeon() / GAME.debugExitDungeon()   // 强制进出本（绕过「靠近入口」UI 门槛）
GAME.sendMove(dir) / GAME.sendSkill(slot) / GAME.sendParry() / GAME.sendSignal()
GAME.sendEquip(itemId) / GAME.sendUnequip(slot)       // E7：装备 / 卸下
GAME.toggleInventory() / GAME.openInventory() / GAME.closeInventory()
```

C2 E2E 断言约定：`lastHits` 记录最近 30 条 `{id, entityId, dmg, kind, t}`（hp 下降即记录；C3 entityId 锚定飘字跟随）；`lastKills` 记录敌人消失 `{x,y,isBoss,t}`；`pickupToasts` 记录最近拾取文案；`inventory.loaded` 收到过 `character.inventory`；`nearLootId` 非空表示拾取提示已显示。

C3 E2E 断言约定：`cam` 每帧更新 `{cx,cy,scale,w,h}`（相机锁定跟随 + clamp）；`playerScreenPos` 每帧更新（断言移动中恒在屏内）；`floatTexts` 每帧更新为 `{entityId, text, screen}`（断言锚定实体且屏幕位置随实体）；`rendered` 每帧重置为 `{enemies:[{id,variant,tier}], lootSlots:[slot], entrance:false, player:count, party:count}`（断言玩家/敌人剪影/掉落图标/入口增强渲染；E17 增 `party`=本帧渲染队友数）。

E17 E2E 断言约定（加分）：`partyMembers` = 当前快照队友列表（kind=PLAYER 且 id!==localEntityId，含 ownerId）；双页面真连 → P1 先进本（E13 waiting）→ P2 5s 窗口内加入同一 instance → 断言同 roomId、副本快照含 ≥2 个 kind=0、`partyMembers≥1`、`rendered.party≥1`（名牌为 Canvas 绘制无 DOM，用渲染标志代）。

---

## 5. 已知限制（MVP，Phase-3 待办）

1. ~~松开方向键后角色惯性滑行~~（**P0 已修复**）：`InputAction.STOP=7`，客户端在全部移动键松开 / 失焦 / 切页 / 断连前发 STOP。残余边界：`beforeunload` 的 STOP 为尽力而为；纯网络断线时 STOP 无法发出，服务端仍按 `DISCONNECT_GRACE_MS`（30s）后清理玩家。
2. ~~无本地预测 / 回正~~（**C2 已修复**）：本地玩家按键即时推进渲染位置（`PLAYER_SPEED=192px/s`，对齐服务端 `BASE_SPEED=4 格/s`），每快照 `lerp 0.3` 向权威收敛；远端实体 `renderTime=tick-3` 双快照插值。预测仅渲染层，位置仍以快照为准。残余边界：客户端预测不含墙碰撞（副本内撞墙由 0.3 收敛回正，有轻微回拉）；`PLAYER_SPEED` 为客户端常量，未来可随快照下发（单一来源）。
3. **无角色名**：协议未下发 displayName；玩家/敌人仅以形状+HP 条区分。**E17 部分缓解**：队友头顶名牌用 ownerId/seatId 编号「侠客·N」（主世界/副本通用），真实用户名归 Phase-3（服务端下发 displayName 后替换）。
4. **diff/ChangeBit Phase-3**：当前客户端解析全量帧（服务端当前也发全量），后续服务端切 delta 需同步升级解码。
5. **TELEGRAPH 实体**：服务端当前未生成 telegraph（预留 kind=4），客户端已支持渲染（红/青预警圈），后续 BOSS 战启用。
6. **入口冷却 UI**：`entrance.cooldownTicks` 已读取并显示，但进本门槛主要靠「靠近 + 服务端冷却」；多人「集合缓冲取先到者」归 Phase-3。
7. **E12 暴击音近似**：协议未下发 crit 标志（C12），客户端暴击音按「玩家面板暴击率（快照 `attrs.crit` 千分比）」概率触发，为服务端结算的近似表现，非逐击精确。
7. **游客模式**：`devUserId` 缺省时服务端按游客处理（`guest_*`，零持久写）；游客拾取不入背包（无 `character.inventory` 推送），背包面板显示「空」——登录态（传 `devUserId`）才能看到拾取入库。
8. **打击感为纯客户端表现**：飘字/闪白/光效/粒子基于快照 hp 变化与实体消失推断，非服务端事件推送；服务端若日后下发 `DamageEvent`/`KillEvent` 可替换为权威事件（更精确、免误判）。
9. **背包 itemId 去重做增量 toast**：极端情况（同 itemId 重复入库）会合并为一条 toast；词缀数显示为「词缀×N」，**词缀具体名称/数值 tooltip 未展示（E7 已实装属性效果，tooltip 分层归 Phase-2）**。
10. **装备平衡未调**：E7 词缀 value 为初值（稀有度系数 1/1.3/1.7/2.4），未做强度/经济联调（GDD §⑧）；crit/减伤叠加无上限钳制，极端堆叠可达必暴/近免伤（Phase-2 平衡项）。
11. **移速词缀（moveSpeed）已进战斗**（玩家移动 ×(1+移速%)）；未装备时字节不变（golden 锚点）。

---

## 6. 验证（真连真实服务端）

- **服务端回归**：`cd apps/jianghu && npm test` → **全绿（135）**（C2 未动服务端代码）。
- **C3 E2E**（`verify-e2e.mjs`，Puppeteer 真连真实 jianghu 服务端，puppeteer@24 + Chrome for Testing）：自管进程（起 jianghu 服务 + 静态服务 + Puppeteer）→ 断言链：连接→`session.ready`→`room.join`→收二进制快照→**E26 minimap 标记钩子（minimapMarkers 形状）**→**移动预测（按键 60ms 内渲染位即变 + 松键收敛）**→**掉落可见性（LOOT_GROUND + 拾取提示）→ 拾取→`character.inventory` 入库→背包面板**→鼠标点击移动（M1，屏内 tile 守卫）→鼠标点敌人 + 普攻（M2，屏内敌人守卫）→**C3 客户端体验大修**：**C3-3 飘字跟随**（lastHits.entityId + floatTexts.screen 锚定实体）→**C3-1 相机锁定**（移动中 playerScreenPos 在屏内 + cam clamp）→**C3-2 点击定位**（点 tile 中心 → moveTo 世界坐标误差 < 20px）→**C3-4 禁平移**（拖拽 cam 不动 + 不触发点击）→**C3-5 技能名 HUD**（烈斩/剑气/震地/破军）→**C3-6 程序化贴图**（rendered.player/enemies/lootSlots/entrance）→SKILL1→**E23 技能光效差异化**（lastSkillFx 钩子：1-4 按下即播 → 槽位对应 slash/beam/quake/crush）→**真实输入 walk+F 进副本**→副本内 SKILL1 命中敌人（HP 下降 + **伤害飘字 lastHits**）→**E26 副本内 BOSS/入口 minimap 标记存在（minimapMarkers.boss/entrance ≥1）**→出本→CDP 模拟断网→自动重连（`session.reconnect`）→**E17 双人同本（P1 进本 + P2 集合窗口加入 → 同 roomId / partyMembers / rendered.party）**；截图存 `verify/01-overworld.png` / `02-dungeon.png` / `03-after-exit.png` / `04-loot-pickup.png` / `05-inventory.png` / `06-equip.png` / `07-click-move.png` / `08-melee.png` / `09-camera-lock.png` / `10-click-accuracy.png` / `11-sprites.png` / `12-party-dungeon.png`。零 pageerror / GAME.errors / console.error。退出码 0=全绿（**44 项断言**：原 42 项 + E27 新手引导 2 项 —— 断言 `window.__game.onboarding` 钩子存在（`enabled===false`）且 `?debug=1` 下 `step` 恒为 0 不推进）。

  ```bash
  cd games/jianghu/apps/web-client
  node verify-e2e.mjs --port 3011 --static 8090   # 默认 headless，加 --headed 可观察
  ```
