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
├── cocos/                   # Cocos Creator 3.x 工程（客户端）
│   └── assets/Script/...    # 拼图核心逻辑（仅本地预判，权威以云端为准）
├── scripts/gen-config.mjs  # 生成并校验全部数值表
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

# 2. 跑核心算法单测
node --test test/

# 3. 微信开发者工具：导入 games/puzzle-cards/ 作为小游戏工程，
#    开通云开发，上传 cloud/functions/* 与 cloud/database/init.js，
#    Cocos Creator 构建到 wechatgame 平台。
```

## 拼拼卡决策基线（替代原 PRD）

> 完整对照见 [RESTRUCTURE-PLAN.md](./RESTRUCTURE-PLAN.md)。当前工程**维持 Cocos Creator 3.x + 微信云开发**，仅落地决策文档的配置层变更。

- **难度**：10 档（4 / 9 / 16 / 25 / 36 / 49 / 64 / 81 / 100 / **144** 片，最大 12×12）
- **关卡**：精确 **60 关**（5 章 × 12，对应 5 系列）
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
- 所有弹窗与提示语集中在客户端 UI 文案处统一管理：`cocos/assets/Script/Core/Copy.ts`（已建，覆盖 app/home/level/result/gacha/rank/privacy/common），美术主题见 `cocos/assets/Script/Core/Theme.ts`（主色 `#FF9A6C`、调色板、资源约定）。
- 美术资源清单与 AI 手绘暖色提示词：`cocos/assets/textures/README.md`；品牌占位 `cocos/assets/textures/brand/brand-mark.svg`。
- 上线前核对见 [LAUNCH-CHECKLIST.md](./LAUNCH-CHECKLIST.md)。
