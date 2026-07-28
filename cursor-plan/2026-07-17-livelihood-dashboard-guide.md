# 民生大屏数字人导览 Demo

## 目标

新建独立「民生大屏」Demo 页：透明背景的 3D 数字人叠加在大屏上，LLM 通过页面面板的结构化上下文回答数据问题；回答时数字人移动到对应面板旁做指向动作并语音讲解，面板同步高亮。

## 范围

- 新页面 `apps/web/src/pages/demos/livelihood-dashboard.astro`：深色大屏风格，6 个假数据面板（人口概况、就业率、医保参保、教育资源、菜篮子价格指数、养老服务），图表用内联 SVG 手写，不引入图表库。
- 面板数据单一来源：frontmatter 中的 `PANELS` 常量同时渲染页面和序列化给客户端脚本，请求时随 prompt 发给后端，保证「模型知道的=页面显示的」。
- 数字人浮层：TalkingHead 渲染器本身 `alpha:true`，容器不铺底色即透明；默认停靠右下，focus 时以 CSS 过渡移动到目标面板旁，自动播放指向手势，讲解结束回停靠位。
- 新后端路由 `POST /api/demo/guide`：请求带 `prompt` + `panels`；系统提示词要求模型从面板中选 focus 目标并生成讲解词；返回 `avatar_response` version 2（timeline 支持 `focus` 事件）；校验 target 必须在请求面板 ID 内，沿用限流与长度限制。
- 语音与口型：CosyVoice TTS 代理 + HeadAudio，复用 talkinghead-browser 的实现方式；v1 该页只做文字提问，不接麦克风。
- 动作：v1 不接 MotionEngine，到达面板后用 TalkingHead 内置 `playGesture("index")` 指向，控制新页脚本体量。
- demo 列表新增 `apps/web/src/content/demos/livelihood-dashboard.md`。

## 非目标

- 不做通用「任意页面挂载」浮层组件。
- 不在本任务处理「更像真人」的模型资产升级（另行迭代）。
- v1 不做多面板连续导览编排，单次回答聚焦一个面板。

## 步骤

1. 后端：`apps/api2/src/demo/guide-routes.js` 新增 guide 路由与 `parseGuideReply` 校验（focus target 白名单为请求面板 ID）；挂载到 `server.js`；照 `demo-stream.test.js` 风格补单测。
2. 前端：新页面布局 + 6 面板 SVG + 浮层脚本（TalkingHead 初始化、CosyVoice 播报、HeadAudio 口型、focus 移动与高亮）。
3. demo 列表条目、构建、本地浏览器端到端验证。
4. 部署 api2 + web，线上冒烟。

## 风险 / 开放问题

- 后台标签页 rAF 被暂停会让自动化验证看不到移动动画，需 pump `head.animate()`（仅测试手段，真实用户不受影响）。
- 大屏 + 3D 在低端设备可能掉帧：面板动画只用 CSS，3D 单实例。
- 模型可能选错面板：后端校验非法 target 直接剔除，前端无 focus 时原地讲解。

## 验收标准

- 透明背景无黑底残留，数字人直接叠加在大屏上。
- 提问「哪个区就业率最高」等问题时，数字人移动到正确面板旁、指向、播报，面板高亮；结束后回位。
- 非法/缺失 focus 时优雅回退为原地讲解。
- api2 单测全绿；线上部署冒烟通过。
