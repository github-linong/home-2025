# 拼拼卡 · AI 结合方案（内容层 + 开发层）

> 状态：v2（2026-08-14）。A1/A2 已落地，A3~A5 待做。落地顺序见文末「落地顺序」。
> 本文档回答「AI 怎么深度结合拼图 + 集卡」，与引擎/后端解耦：AI 管道全部是纯 Node 脚本 + JSON + 云函数，二期迁移 Phaser/Express 时可整体复用。

## 0. 总览：两条 AI 线

| 层次 | 结合点 | 状态 |
|---|---|---|
| 内容层 A1 | AI 美术生产流水线（73 卡面 + UI 图） | ✅ 73 张已生成（2026-08-11），流水线脚本可单卡重跑 |
| 内容层 A2 | AI 图鉴知识卡（每卡 1~2 句小知识） | ✅ gen-lore.mjs（LLM 73/73）+ 客户端三处展示 |
| 内容层 A3 | AI 每日挑战图（每天一张新拼图） | 📐 方案见下 |
| 内容层 A4 | AI 个性化难度（按玩家数据微调） | 📐 方案见下（轻量） |
| 内容层 A5 | AI 文案池扩展（鼓励语气随机池） | 📐 方案见下（顺带） |
| 开发层 B | AI 辅助开发工作流 + prompt 资产 | 📐 建议见下 |

---

## A1. AI 美术生产流水线（已落地）

- **脚本**：`scripts/gen-textures.mjs`
  - 读取 `config/cards.json`（73 张），按「系列风格 + 稀有度点缀」构建提示词；
  - 直连 DashScope 通义万相（`wanx2.1-t2i-turbo`，异步任务提交 + 轮询，复用 `apps/api2/src/demo/image-routes.js` 的 API 约定）；
  - 输出到 `assets/resources/textures/series/{seriesId}/{cardId}.png`（与 `assets/Script/Core/Theme.ts` 的 `assetPath.seriesArt` 契约一致）。
- **现状**：73 张卡面 + `board_bg`/`splash` 已全部生成（2026-08-11，通义万相 1024×1024）；脚本支持单卡/单系列重跑（如 `--series=flower --limit=1 --force`），端到端已验证（2026-08-14 强制重跑 flower_001 成功）。
- **风格基准**：AI 手绘暖色糖果风，主色 `#FF9A6C`，方形 1024×1024，无文字、无水印、无边框。完整提示词模板见 `assets/resources/textures/README.md`。
- **用法**：
  ```bash
  node scripts/gen-textures.mjs --dry-run      # 预览全部提示词，不发请求
  node scripts/gen-textures.mjs --limit=5      # 试跑 5 张（幂等：已存在自动跳过）
  node scripts/gen-textures.mjs --force        # 重新生成全部
  node scripts/gen-textures.mjs --ui           # 生成 UI 图（board_bg / splash）
  ```
- **失败降级**：客户端 `addImage` 在资源缺失时自动退化稀有度色块，流水线中断不影响游戏运行。

## A2. AI 图鉴知识卡（✅ 已落地）

**玩法定位**：每张卡配 1~2 句图鉴小知识——花语（玫瑰的花语）、萌宠（水獭的冷知识）、美食（关东煮的由来）、山河（长城的长度）、星辰（织女星传说）。收藏价值 + 教育属性，正中「女性 + 孩子」目标用户。

**已实现**：

1. **生成**：`scripts/gen-lore.mjs` 双模式——`--llm` 调 qwen-flash 批量生成（73/73 成功，失败自动回退模板），默认离线模板模式零依赖可用。产出 `config/lore.json` + `cloud/model/config/lore.json`，结构 `{ meta, cards: { [cardId]: { fact, tip } } }`。
2. **下发**：`scripts/gen-config.mjs` 将 lore 合并进 `cards.json`（`card.lore`），客户端经现有 `config` 云函数随卡牌配置直接拿到，**零新增云函数**。
3. **展示**（三处）：
   - `CollectionScreen`：点击任意卡 → 详情弹窗（大卡面 + 名字 + lore fact/tip；未拥有显示「神秘卡片」防剧透）；
   - `GachaScreen`：抽到新卡 → 结果面板出现「💡 小知识」按钮，点击看完整详情；
   - `PuzzleScreen`：通关得新卡 → 结果弹窗新卡下方 lore 一行，点击看详情。
4. **成本**：一次性生成 ≈ 3 万 token ≈ 几毛钱；运行时零成本（纯静态配置）。
5. **合规**：常识性知识 + 人工抽检（`config/lore.json` 直接改）；预生成静态配置，非用户实时生成，AIGC 标识压力小。

**LLM Prompt（存档）**：

```
你是儿童益智拼图游戏《拼拼卡》的图鉴文案编辑。为以下卡牌各写一条图鉴小知识。
卡牌列表：[...]
输出要求：严格输出 JSON 对象，键为卡牌 id，值为 {"fact": "...", "tip": "..."}。
要求：事实准确、语气温暖鼓励、面向6~12岁儿童可读、无负面词、不编造具体数字。
```

---

## A3. AI 每日挑战图（留存钩子，二期后做）

**玩法定位**：每天一张新的拼图主题图（今日花语 / 今日萌宠 / 今日食光…），配合已有每日任务体系。让老玩家每天有一个「新的」可拼对象。

**实现方案**：

1. **预生成**：云函数定时触发器（每日 03:00）调 DashScope 生成当天主题图 → 存云存储（云文件 ID）→ 写 `daily_challenge` 集合 `{date, seriesId, prompt, imageFileID, status}`。
2. **客户端**：首页「今日挑战」入口，`daily_challenge` 云函数拉当天记录，拿云文件 URL 展示。
3. **关键约束**：文生图延迟 10~30s，**绝不能玩家在线等**——凌晨预生成 + 云端缓存；失败自动降级为本地 73 张随机一张。
4. **成本**：每日 1 张 ≈ 0.14 元 ≈ 4 元/月，可接受。
5. **备选轻量版**：不做生成，每天从 73 张里「指定一张 + AI 写一句今日主题语」——成本为零，先验证玩法再上真生成。

---

## A4. AI 个性化难度（轻量，二期）

- 服务端已有 `levelComplete` 数据（用时/星级）。按最近 10 局均值做规则化微调：完成快 → 难度 `+1`（上限），卡关 → 吸附距离 `30px → 35px`（更宽容）。
- **规则为主，AI 只做点缀**：可让 AI 按玩家成绩生成一句局后点评（鼓励语气，走 qwen-flash，缓存复用），避免实时 LLM 延迟。
- 改动点：`me` 返回 `adaptive { pieceBonus, snapDistance }` → 客户端 `PuzzleBoard` 读取。

---

## A5. AI 文案池扩展（顺带做）

- `assets/Script/Core/Copy.ts` 已集中管理文案。用 qwen-flash 按语气规范批量扩写鼓励语池（「再试一次」「差一点点」各 20 条），随机取用，降低重复感。
- 同一 gen-lore 管道，零成本。

---

## B. 开发层 AI 工作流（建议）

**工具**：CodeBuddy（腾讯官方 AI IDE，与微信云开发打通，官方教程《CodeBuddy+CloudBase 1 小时开发微信小游戏》）；备选 Trae / Cursor / Claude Code；策划文案用 DeepSeek / 混元；美术用通义万相（即本流水线）。

**五个习惯**：
1. 喂上下文：开工前把 `config/cards.json`、`Theme.ts`、`Copy.ts`、目标云函数贴给 AI；
2. prompt 资产化：`scripts/prompts/` 存可复用模板（本仓库已有一份生图模板在 textures/README.md）；
3. 显式声明环境限制：「小游戏无 DOM，只能用 wx.* 与 Cocos API」——AI 写小游戏代码第一大翻车点；
4. 一次一个功能：生成 → 真机预览 → 让 AI 重构；
5. 人管「为什么」（玩法/数据模型/数值），AI 管「怎么做」（样板代码/修 bug/文案/资源）。

**提审材料**：AI 起草（简介/截图说明/自测报告），人工复核后提交——合规责任在开发者。

---

## 落地顺序（建议）

1. ✅ A1 流水线脚本 + 端到端验证（2026-08-14 强制重跑 flower_001 成功）
2. ✅ A1 素材盘点：73 张卡面 + UI 图已全部生成（2026-08-11），无需重跑
3. ✅ A2 知识卡：`gen-lore.mjs`（LLM 73/73）+ `lore.json` 合并进 cards.json + 客户端三处展示（图鉴详情 / 抽卡结果 / 通关结果）
4. ✅ 工程缺口：启动场景清理（4 Main → 1，`scripts/fix-scene.mjs`）、24 云函数 bundle 刷新、tsc 业务代码 0 错误
5. ✅ 工程缺口：启动场景清理（4 Main → 1，`scripts/fix-scene.mjs`）、24 云函数 bundle 刷新、编辑器级 TS 诊断业务代码 0 错误、Playwright 端到端冒烟 7 步全过（`pinpin-demo/preview-e2e.mjs`）
6. ⏳ Cocos GUI 构建 `build/wechatgame` + 微信开发者工具真机预览（无头 CLI 受 macOS 沙箱限制；GUI 已就绪，点「构建发布」即可）
6. 📅 A5 文案池（与 A2 同一管道，半天）
7. 📅 A3 每日挑战图：先轻量版（指定卡 + AI 主题语），验证留存再上真生成
8. 📅 A4 个性化难度（二期）

**与二期迁移的关系**：A1/A2 产出是纯文件（PNG + JSON），A3 是独立云函数，均与 Cocos/Phaser 无关；迁移时零重做。
