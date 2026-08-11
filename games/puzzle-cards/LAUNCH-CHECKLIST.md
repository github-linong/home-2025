# 拼拼卡 · 微信小游戏提审清单

上线前逐项核对。当前进度：配置层 + 客户端文案/美术基座 + 五大屏幕程序化搭建 + 二期模块中立化已完成，16/16 单测通过。
剩余为美术资源生产、Cocos Creator 构建（挂场景）、提审材料。

## 0. 客户端构建（Cocos Creator）
- [ ] 用 Cocos Creator 3.8.x 打开 `cocos/` 工程（已含 `project.json` / `tsconfig.json` / 全部 Script）。
- [ ] 新建或指定启动场景，在 `Canvas` 根节点挂 `Script/Game/Main.ts` 组件（`Main.start()` 会 `ensureCanvas` + `ensureScreenRoot` 并拉起首页；无 `.scene` 手写布局）。
- [ ] 将美术资源放入 `cocos/assets/resources/textures/...`（客户端用 `resources.load` 加载；缺失时自动退化为色块）。
- [ ] 构建发布 → 选择「微信小游戏」，产出 `build/wechatgame/`（`game.js` 由构建生成）。
- [ ] 用微信开发者工具导入 `build/wechatgame/` 真机预览。

## 1. 工程与账号
- [ ] 微信公众平台「小游戏」类目已选（休闲 / 益智类，儿童向需注意适龄提示）。
- [ ] `project.config.json` appid 正确（`wxbe938ae77d7c1ed6`），`compileType: game`。
- [ ] 云开发环境已开通并初始化（env: `puzzle-cards-prod`），`cloud/database/init.js` 已执行建集合 + 索引。
- [ ] 24 个云函数已上传并部署（含已中立化的 team/activity/decoration/push/rank）。

## 2. 隐私合规（强校验，易驳回）
- [ ] MP 后台已挂《隐私保护指引》并填写收集项（openid / 昵称 / 成绩等）。
- [ ] 客户端 `Core/Privacy.ts` 调用 `wx.requirePrivacyAuthorize`，首次进入弹授权；拒绝后不阻断（可稍后重试）。
- [ ] 隐私弹窗文案来自 `Core/Copy.ts`（鼓励语气，无强制/恐吓措辞）。

## 3. 域名与网络
- [ ] 纯云开发（wx.cloud）无需配置 request 合法域名；若有自有 API，需在 MP 后台配 **HTTPS** 合法域名。
- [ ] 所有网络走 HTTPS，证书有效。

## 4. 包体与性能
- [ ] 主包 + 分包总包体 ≤ 20MB（建议主包 < 4MB，美术资源走分包/远程）。
- [ ] 启动耗时：中端安卓 < 1.5s（弱网走 `Core/Storage` 本地缓存兜底）。
- [ ] 真机调试：iOS / Android 各机型，不同屏幕尺寸。

## 5. 素材与内容合规（儿童向重点）
- [ ] 美术为原创 AI 手绘暖色风格，无真人肖像未授权、无惊悚/暴力元素。资源须置于 `cocos/assets/resources/textures/`（见第 0 条），否则 `resources.load` 取不到。
- [ ] 卡面/UI 无真实货币、无充值诱导（纯 IAA）。
- [ ] 文案全量走 `Core/Copy.ts`，**无「失败/你输了/闯关失败」** 等负面词（已用 `grep` 校验客户端无字面命中）。
- [ ] 适龄提示：如面向低龄，启用微信「未成年人防沉迷」相关配置。

## 6. 功能自测
- [ ] 拼图：10 档难度、30px 吸附、翻转（9/10 档）正常。
- [ ] 关卡：60 关进度持久化；完成提交 `levelComplete` 服务端权威评级。
- [ ] 集卡：掉率/保底服务端权威；重复卡转碎片（`shardExchange`）。
- [ ] 免费抽卡：看广告免费抽，每日 2 次上限（`gacha` 云函数）。
- [ ] 广告 IAA：激励/插屏/Banner 接入，流量主资质已开通，频控（`adControl`）生效。
- [ ] 分享 + 好友榜：开放数据域 `wx.getFriendCloudStorage` + sharedCanvas 正常绘制。
- [ ] 签到/每日任务/赛季积分（30 天，无通行证）正常。
- [ ] 弱网/断网：本地缓存兜底，恢复后对账。

## 7. 已禁用模块（一期不开放，返回 available:false）
- [ ] `team`（组队集卡）、`activity`（活动）、`decoration`（外观）、`push`（订阅消息）整体关闭。
- [ ] `rank.getSeasonTop`（全服赛季榜）关闭；保留每日挑战 + 个人最佳。
- [ ] `shop` / `analytics` 不可用（纯 IAA、无自研埋点）。

## 8. 提审材料
- [ ] 游戏名称「拼拼卡」、简介、图标（暖橘主题）、截图（含主界面/拼图/集卡）。
- [ ] 演示视频（核心玩法 30s+）。
- [ ] 客服 QQ / 邮箱。
- [ ] 自测报告（本清单 1–7 勾选）。

## 9. 上线后
- [ ] 微信小游戏数据助手监控留存/崩溃/广告 eCPM。
- [ ] 二期评估：Phaser + Express/MySQL 迁移、组队/活动/外观/全服榜/订阅消息。
