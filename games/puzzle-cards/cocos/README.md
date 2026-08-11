# Cocos Creator 客户端骨架

微信小游戏客户端（Cocos Creator 3.x）。游戏画面走 Canvas/WebGL，**没有 WXML/WXSS**。
服务端权威逻辑全部在 `../cloud/`，本目录只做体验与本地预判。

## 目录

```
cocos/
├── game.json                    # 小游戏配置（openDataContext 指向好友排行榜）
├── assets/
│   ├── Script/
│   │   ├── Core/               # 基础设施
│   │   │   ├── Cloud.ts        # wx.cloud.callFunction 封装
│   │   │   ├── EventBus.ts     # 事件总线
│   │   │   ├── Storage.ts      # 本地缓存（弱网兜底 U-005）
│   │   │   └── Privacy.ts      # 隐私授权（U-006，wx.requirePrivacyAuthorize）
│   │   └── Game/
│   │       ├── Main.ts         # 入口场景：隐私→云初始化→拉配置
│   │       ├── PuzzleScene.ts  # 拼图对战场景骨架（拖拽/吸附/提交）
│   │       └── Puzzle/
│   │           ├── PuzzlePiece.ts   # 碎片数据模型
│   │           ├── PuzzleBoard.ts   # 底板/吸附(20px)/完成判定
│   │           └── Scoring.ts       # 本地星级预判（权威以云端为准）
│   └── OpenDataContext/        # 开放数据域（好友排行榜，双线程）
│       └── index.js            # wx.getFriendCloudStorage + 共享画布绘制
```

## 关键约定

1. **权威在服务端**：拼图完成、掉卡、货币、排名写入全部走云函数（`levelComplete`/`cardDrop` 等）。
   客户端只在 `PuzzleScene.finish()` 提交 `levelId/usedTimeSec/hintsUsed/pieceHash`，
   `pieceHash` 用于反作弊（PRD 24.2 服务端校验碎片位置）。
2. **好友排行榜走开放数据域**：小游戏分享到群拿不到 openid 列表。主域用 `OpenDataContext` 组件显示
   `sharedCanvas`，并通过 `wx.postMessage({type:'friendRank'})` 触发 `OpenDataContext/index.js` 绘制。
3. **隐私合规**：`Main.start()` 首屏调用 `ensurePrivacy()`（小游戏 `wx.requirePrivacyAuthorize`），
   并需在微信 MP 后台挂《隐私保护指引》。
4. **配置不打包**：60 关 / 68 卡数据由云函数 `config` 运行时下发（弱网用本地缓存兜底）。

## 在 Cocos Creator 中打开与构建

1. Cocos Creator 3.x → 打开 `cocos/` 目录（识别为小游戏工程）。
2. 构建 → 平台选 **微信小游戏** → 填入小游戏 **AppID** → 构建。
3. 用**微信开发者工具**导入构建产物；开通**云开发**环境。
4. 上传 `../cloud/functions/*`（先 `node scripts/bundle-functions.mjs` 注入 model），
   并在云开发控制台运行一次 `../cloud/database/init.js` 建集合+索引+种子数据。
5. 真机预览 / 提审。

## 待补（持续工程，非本骨架范围）

- 美术资源（卡面图、拼图底图、动画）、Cocos 场景与预制体编辑、UI 绑定。
- 拖拽手势实现、缩放(P-011)、暂停(P-012)、限时(P-008)、干扰碎片(P-009)、异形/旋转(P-003/P-004)。
- 翻卡动画(P-007)、分享卡片生成(S-04)、订阅消息真实下发(M24)。
- 性能优化（setData/首包 ≤4MB、分包、资源压缩，见 PRD 26）。
