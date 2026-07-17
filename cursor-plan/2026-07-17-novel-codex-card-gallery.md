# 图鉴数据 JSON 化 + Card 效果展示文章

## Goal

把《天灾第十年跟我去种田》设定页中「人物与动物图鉴」的数据提取为独立 JSON 文件，并新增一篇博客文章，用同一组数据演示多种不同的卡片(Card)视觉效果。

## Scope / Non-goals

- 新建 `apps/web/src/data/novel-codex.json`（humans + animals，字段与现有 profile 一致）。
- 重构 `apps/web/src/lib/novelCharacters.js` 改为从 JSON 读取，保持既有导出与校验函数不变，设定页零改动。
- 新增 `NovelCodexCardGallery.astro` 组件，共 19 种效果：翻转卡、游戏收藏卡（光泽扫过）、玻璃拟态遮罩卡、聚光灯跟随卡、极简档案条、3D 倾斜卡（含高光）、流光描边卡（@property 动画）、双色调卡（灰度→彩色）、票券卡（mask 打孔）、堆叠切换卡、手风琴展开卡、拍立得卡（胶带+偏转）、故障风卡（RGB 分离+扫描线）、邮票卡（mask 锯齿边）、杂志编辑排版卡，以及图片背景组：电影横幅卡（Ken Burns 推拉）、上滑揭示卡、色调滤镜卡（mix-blend-mode）、文字镂空卡（background-clip: text）；电影感扩展组：轮播横幅卡（交叉淡入 + 多方向推拉 + 圆点导航）、视差横幅卡（animation-timeline: view() 滚动驱动）、推近揭示卡（流媒体海报墙式 hover）、宽银幕字幕卡（21:9 遮幅 + 台词字幕）。共 23 种，纯 CSS 为主、少量原生 JS。
- 新增博客文章 `novel-codex-card-gallery.mdx` 挂载该组件。
- 不引入第三方依赖；不改动设定页现有卡片样式。

## Steps

1. 提取数据到 `src/data/novel-codex.json`。
2. `novelCharacters.js` 改为读取 JSON 并 re-export，跑现有 `novelCharacters.test.mjs` 验证。
3. 编写 `NovelCodexCardGallery.astro`（分节展示各效果，含说明文字，适配明暗主题与移动端）。
4. 新增 mdx 文章并在本地验证页面渲染。
5. 运行 web 测试与 `astro build` 确认无回归。

## Risks / Open Questions

- `node --test` 直接跑 `novelCharacters.js`，JSON 需用 `readFileSync` 方式加载以同时兼容 Node 18 与 Vite（不使用 import assertion）。
- 卡片效果依赖 hover，移动端需提供 focus/tap 的降级表现。
- 文章暂不配 hero 图（可后续补）。

## Acceptance Criteria

- JSON 含全部 15 位人物与 15 个动物，字段完整。
- 设定页数据来源切到 JSON 后，`novelCharacters.test.mjs` 通过。
- 新文章可访问，至少 4 种不同卡片效果，明暗主题下均可读。
- `npm test`（web）与 `astro build` 通过。
