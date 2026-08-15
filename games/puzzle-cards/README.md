# 拼拼卡 · 微信小游戏

轻度休闲微信小游戏：**拼图 + 集卡 + 社交排行**。技术栈 **Cocos Creator 3.x + 微信云开发（云函数 + 云数据库 + 云存储）**。

> ⚠️ 这是**微信小游戏（Mini Game）**，不是微信小程序。游戏画面走 Cocos 的 Canvas/WebGL 渲染，
> 没有 WXML/WXSS/`Page()`。好友排行榜必须走**开放数据域（Open Data Context）**双线程。
> 本仓库的 `cloud/` 是所有模块共用的**服务端权威底座**（云开发），客户端只做体验与本地预判。

## 目录结构

```
games/puzzle-cards/
├── project.config.json      # 微信开发者工具小游戏工程配置（compileType: game）
├── cloud/                   # 微信云开发（服务端权威）
│   ├── model/               # 纯逻辑层（CommonJS，云函数直接 require，无构建步骤）
│   │   ├── config/          # 由 scripts/gen-config.mjs 生成的数值表 JSON
│   │   ├── db.js            # 云数据库访问封装
│   │   ├── resp.js          # 统一响应格式
│   │   ├── config.js        # 配置加载器
│   │   ├── cardDrop.js      # 掉卡概率 + 保底引擎（服务端权威）
│   │   ├── scoring.js       # 星级评定 + 速度系数
│   │   ├── shardExchange.js # 重复卡转碎片 + 碎片兑换
│   │   ├── antiCheat.js     # 反作弊校验
│   │   ├── signin.js / dailyTask.js / adControl.js / invite.js / gacha.js / season.js
│   ├── functions/           # 云函数（每个目录 = 一个云函数）
│   └── database/init.js     # 创建集合 + 索引（幂等）
├── config/                  # 数值表可读副本（与 cloud/model/config 同源）
├── assets/                  # Cocos Creator 3.x 客户端（工程根即 Cocos 工程根）
│   ├── Script/...           # 拼图核心逻辑（仅本地预判，权威以云端为准）
│   ├── resources/textures/  # 美术资源（AI 生成流水线，见 textures/README.md）
│   └── OpenDataContext/     # 好友排行榜开放数据域（sharedCanvas 双线程）
├── docs/ai-integration.md   # AI 结合方案（内容层 + 开发层）
├── scripts/
│   ├── gen-config.mjs       # 生成并校验全部数值表
│   └── gen-textures.mjs     # AI 美术生产流水线（DashScope 通义万相）
└── test/                    # 核心算法单测（node --test）
```

## 关键架构决策（来自 PRD 评审）

1. **概率/保底/货币/卡牌全部服务端权威**：客户端只展示，掉落由 `cloud/functions/cardDrop` + `model/cardDrop.js` 计算，
   防作弊（M23）依赖此设计。
2. **好友链走开放数据域**：小游戏分享到群拿不到 openid 列表，好友排行榜读取侧用 `wx.getFriendCloudStorage`。
3. **隐私合规**：小游戏用 `wx.requirePrivacyAuthorize`，需在 MP 后台挂隐私协议（U-006）。
4. **广告频控服务端记**：每日 15 次 / 间隔 3 分钟不能只存本地（AD-009）。

## 本地开发

```bash
# 1. 生成数值表（关卡/卡牌/概率/签到/任务/免费抽卡）
node scripts/gen-config.mjs

# 2. 跑核心算法单测（注：Node 24 需用 glob 形式，目录形式会误报）
node --test "test/*.test.cjs"

# 3. 生成美术资源（73 张卡面 + UI 图已于 2026-08-11 全部生成；需重跑时用 --force）
node scripts/gen-textures.mjs --dry-run   # 预览提示词
node scripts/gen-textures.mjs --force     # 全量重新生成

# 4. 生成图鉴知识卡（A2：--llm 需 DASHSCOPE_API_KEY；默认离线模板）
node scripts/gen-lore.mjs --llm
node scripts/gen-config.mjs               # 合并 lore 进 cards.json 后重跑一次
node scripts/bundle-functions.mjs         # 上传云函数前同步 model 到 24 个函数

# 5. 微信开发者工具：导入 games/puzzle-cards/ 作为小游戏工程，
#    开通云开发，上传 cloud/functions/* 与 cloud/database/init.js，
#    Cocos Creator 构建到 wechatgame 平台。
```

## 拼拼卡决策基线（替代原 PRD）

> 完整对照见 [RESTRUCTURE-PLAN.md](./RESTRUCTURE-PLAN.md)。当前工程**维持 Cocos Creator 3.x + 微信云开发**，仅落地决策文档的配置层变更。

- **难度**：10 档（4 / 9 / 16 / 25 / 36 / 49 / 64 / 81 / 100 / **144** 片，最大 12×12）
- **关卡**：精确 **60 关**（5 章 × 12，对应 5 系列）
- **卡牌**：**73 张** = 68 普通 + 5 隐藏（每系列 1 张隐藏；5 系列：花语集 / 萌宠志 / 食光记 / 山河卷 / 星辰谱）
- **吸附距离**：**30px**
- **赛季**：**30 天**，无通行证
- **变现**：**纯 IAA**（激励 / 插屏 / Banner），无 IAP / 钻石 / 月卡 / 通行证 / 卡包购买；免费抽卡卡包概率独立到 `gacha` 配置，看广告免费抽取
- **数据**：不自建埋点，统一由「微信小游戏数据助手」采集（`analytics` 云函数一期返回不可用）
- **二期（暂未开放）**：组队集卡、活动系统、外观/装饰、全服赛季榜、自由拼图、订阅消息
- **目标用户**：女性 + 孩子；美术为 AI 手绘暖色（主色 #FF9A6C）

## 文案规范（鼓励语气）

- 全程使用鼓励、正向文案；**禁用**「失败」「你输了」「闯关失败」等负面词。
- 拼图未完成用「再试一次」「差一点点」「继续加油」；通关用「完成啦」「太棒了」「拼好啦」等。
- 卡牌/收集用「集到新卡」「又解锁一张」；抽奖用「试试手气」「惊喜来袭」。
- 所有弹窗与提示语集中在客户端 UI 文案处统一管理：`assets/Script/Core/Copy.ts`（已建，覆盖 app/home/level/result/gacha/rank/privacy/common），美术主题见 `assets/Script/Core/Theme.ts`（主色 `#FF9A6C`、调色板、资源约定）。
- 美术资源清单与 AI 手绘暖色提示词：`assets/resources/textures/README.md`；品牌占位 `assets/resources/textures/brand/brand-mark.svg`。
- 上线前核对见 [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md)。
- AI 结合方案（生图流水线 / 图鉴知识卡 / 每日挑战图 / 开发层工作流）：[docs/ai-integration.md](./docs/ai-integration.md)。
