# 拼拼卡 · 重构计划（决策确认文档 vs 已建实现）

> 基准：用户 2026-08-10 提供《拼拼卡 · 全部决策确认文档》，明确"后续开发以此文档为唯一基准"。
> 现状：`games/puzzle-cards/` 下已有按 PRD 实现的 Cocos Creator 3.x + 微信云开发 版本（24 云函数、纯 JS 模型逻辑、16 单测通过）。

## 一、决策变更对照表

| 维度 | 已建实现（拼图集卡 / PRD） | 新决策（拼拼卡） | 影响级别 |
|---|---|---|---|
| 产品名 | 拼图集卡 | **拼拼卡** | 文案/资源 |
| 目标用户 | 全年龄 | **女性 + 孩子** | 美术/文案 |
| 游戏引擎 | Cocos Creator 3.x | **Phaser 3 (v3.80+, JS)** | 客户端重写 |
| 后端 | 微信云开发（云函数+云DB） | **Node.js + Express + MySQL 8.0（自托管）** | 后端重写 |
| 渲染方式 | Cocos 场景 | **Phaser 内部渲染（无 DOM）** | 客户端 |
| 变现 | IAA + IAP | **纯 IAA（无 IAP）** | 删商城/钻石/月卡/通行证/卡包 |
| 难度档位 | 5 档（最大 36 片 / 6×6） | **10 档（最大 144 片 / 12×12）** | config |
| 吸附距离 | 20px | **30px** | config |
| 关卡数 | 56（52+4） | **60（精确）** | config |
| 赛季周期 | 60 天 | **30 天，无通行证** | config |
| 数据埋点 | 自研埋点 | **仅微信小游戏数据助手** | 删 analytics 模块 |
| 文案语气 | 中性 | **鼓励语气，禁"失败/你输了"** | 客户端文案 |
| 美术风格 | 未定 | **AI 手绘暖色（通义万相/千问），主色 #FF9A6C** | 资源 |

## 二、一期范围（确认保留）

登录/用户、拼图玩法、关卡、卡牌/图鉴、新手教程、排行（**好友**，开放数据域）、分享、助力、每日任务/签到、广告（IAA）、免费抽卡、邀请、赛季（积分榜，无通行证）、个人中心。

**移除 → 二期或不建**：IAP/商城/钻石/月卡/通行证/卡包购买、外观装饰、组队集卡、活动系统、全服赛季榜、自由拼图、订阅消息、自研埋点。

## 三、可复用资产（纯 JS，与引擎/后端无关）

- `cloud/model/`：`cardDrop, gacha, scoring, antiCheat, signin, dailyTask, adControl, invite, season, shardExchange, config` —— 业务逻辑可整体迁移到 Express 路由层。
- `scripts/gen-config.mjs`：调整难度/关卡数后复用。
- `test/core.test.cjs`：模型单测复用（16 项）。

## 四、需重建

### 后端：Express + MySQL 8.0
1. **库表**：26 个云集合 → MySQL 表（users, user_currency, user_progress, cards_owned, collection, pity_state, levels, series, cards, shares, help_requests, daily_tasks, signin, ads_log, invites, trades, pk_records, teams, seasons, activities, orders, achievements, daily_challenge, decorations 等；删 analytics_events/anti_cheat 视需保留）。
2. **路由**：对齐一期模块（去 IAP/analytics/decoration/pk/team/activity）。
3. **鉴权**：`wx.login` code → `code2session` 换 openid，JWT/会话管理。
4. **服务端权威**：掉率、保底、货币、卡牌归属全部服务端计算。

### 客户端：Phaser 3（JS，内部渲染）
1. **场景**：Boot → Preload → Main → LevelSelect → Puzzle → Collection(图鉴) → 等。
2. **拼图核心**：拖拽 / 吸附（SNAP_DISTANCE=30）/ 翻转 / 提交 → 调用后端 `levelComplete`。
3. **开放数据域**：`wx.getFriendCloudStorage` + sharedCanvas 好友榜。
4. **广告 IAA**：激励视频 / 插屏 / Banner（adControl 限频）。
5. **文案**：全部启用鼓励语气，无"失败/你输了"。

## 五、执行顺序（建议）
1. 后端：MySQL schema + Express 骨架 + 鉴权 + 核心路由（复用 model）。
2. 配置：改 `gen-config` → 10 难度 / 60 关 / 30px / 30 天赛季。
3. 客户端：Phaser 工程 + 拼图核心 + 各场景。
4. 接入广告 IAA + 好友榜。
5. 测试：模型单测 + 接口联调。
6. 提审清单（微信小游戏）。

## 六、决策与执行状态（2026-08-10）

- **用户决策**：维持 Cocos Creator 3.x + 微信云开发 技术栈；引擎(Phaser)/后端(Express+MySQL)迁移**推迟到二期**。本工程仅落地决策文档的**配置层**变更。
- **已完成（配置层）**：
  - 难度 5 → **10 档**（最大 12×12 / 144 片），概率 `baseByStars`/`maxRarityByStars` 扩展到 10 档。
  - 关卡 56 → **60**（5 章 × 12，对应 5 系列），移除隐藏章节。
  - 吸附距离 **20 → 30px**（PuzzleBoard）。
  - 赛季 **60 → 30 天**，移除通行证（season 云函数仅保留 current/addPoints；rank 标为二期）。
  - **纯 IAA**：`shop` 配置清空；免费抽卡卡包概率拆到独立 `gacha` 配置（看广告免费抽），`shop` 云函数返回不可用。
  - **无自研埋点**：`analytics` 云函数返回不可用（仅微信小游戏数据助手）。
  - 签到周奖励去外观（头像框 → premium 卡包）。
  - 单测 16/16 通过；`gacha.json`/`shop.json` 已随 bundle 同步进 24 个云函数。
- **已完成（客户端·鼓励文案 + 美术基座，2026-08-10）**：
  - 文案集中管理：`cocos/assets/Script/Core/Copy.ts` 建立全部鼓励语气 UI 文案（禁「失败/你输了」），覆盖 app/home/level/result/gacha/rank/privacy/common。
  - 美术主题：`cocos/assets/Script/Core/Theme.ts` 定义暖色糖果风主题（主色 `#FF9A6C`、调色板、`assetPath` 资源约定、圆角/阴影），面向女性 + 儿童。
  - 接入点：`Main.ts`（隐私/加载/弱网事件）、`PuzzleScene.ts`（关卡开始/进度/完成按星级给鼓励文案 + `ui:levelResult` 事件）、`OpenDataContext/index.js`（好友榜改用暖色 + 「邀请好朋友一起来拼图吧」）。
  - 美术资源清单：`cocos/assets/textures/README.md`（5 系列共 65 卡面 + 碎片 + UI + 启动闪屏，含 AI 生图提示词模板）；品牌占位 `textures/brand/brand-mark.svg`。
  - **二期云函数中立化**：`team` / `activity` / `decoration` / `push` 整体返回 `available:false`（暂未开放）；`rank` 仅禁用全服赛季榜（`getSeasonTop`），保留每日挑战提交 + 个人最佳。
- **已完成（客户端·全屏程序化搭建，2026-08-10）**：
  - 屏幕管理：`Main.ts` 程序化创建 `Canvas`（`ensureCanvas`）+ `ScreenRoot`，按 `home/levelSelect/puzzle/collection/gacha` 切换，无需手写易碎 `.scene` JSON。
  - 五大屏幕全部落地：`HomeScreen`(开始/试试手气/卡片册 + 收集进度) / `LevelSelectScreen`(60 关 4 列网格·按稀有度着色) / `PuzzleScreen`(底板 + 可拖拽吸附碎片 + 完成后 `levelComplete` 提交 + 鼓励结果弹窗) / `CollectionScreen`(以 `cfg.cards` 为完整图鉴、`collection.owned` 点亮) / `GachaScreen`(看激励视频免费抽·每日 2 次上限·服务端 `ads_log` 频控·结果与稀有度着色)。
  - 基础库：`Core/UI.ts`(addLabel/addButton/addPanel/addImage/dimOverlay/solidFrame，含 1×1 白色 SpriteFrame 兜底，避免空 Sprite 真机不可见)、`Core/Ad.ts`(IAA 激励/插屏/Banner，无广告位时安全降级)、`Core/Session.ts`(wx.login→云函数换 openid + me 缓存)、`Core/Cloud.ts`(callFunction Promise 化)、`Core/Storage.ts`(弱网缓存)。
  - 修复：关卡无 `cardId` 字段→按 `seriesId+indexInChapter` 推导参考图；`me` 不返回 `seasonPoints`→首页改显 `stats.totalCards`；结果遮罩 `rgba()` 非法色→`dimOverlay` 半透明黑；`UI` 面板/按钮补 `spriteFrame` 保证真机可见。
- **待办（启动前机械性工作）**：
  - 美术生产：按 `textures/README.md` 清单生成 AI 手绘资源（65 卡面 + 碎片 + UI + 闪屏）。**资源须放在 `cocos/assets/resources/textures/...`**（客户端用 `resources.load` 加载，`Theme.assetPath` 返回相对 `resources/` 的路径），缺失时 `addImage` 自动退化为对应稀有度/主题色块，不影响运行。
  - Cocos Creator 构建：用 Cocos Creator 打开 `cocos/` → 新建/指定启动场景 → 在 `Canvas` 根节点挂 `Script/Game/Main.ts` 组件（代码已 `ensureCanvas` 兜底，但需一个含 Main 的场景才能构建）→ 构建发布为「微信小游戏」。`game.js` 由构建过程生成，无需手写。
  - 引擎/后端迁移（Phaser + Express/MySQL）按决策文档二期评估。
  - 提审清单见 [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md)。
