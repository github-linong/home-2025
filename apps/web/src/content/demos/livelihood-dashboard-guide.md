---
title: "民生数据大屏 · 3D 数字人导览"
description: "透明背景 3D 数字人叠加在民生数据大屏上，Qwen 基于页面面板数据回答提问，数字人走到对应面板旁指向讲解并高亮面板。"
pubDate: "2026-07-17"
type: external
demoUrl: "/demos/livelihood-dashboard"
category: "AI"
badge: "新作"
tags: ["AI", "数字人", "3D", "数据可视化", "大屏", "TTS"]
---

在民生数据大屏上叠加一个透明背景的 3D 数字人讲解员。

- 大屏为独立全屏页面，含人口、就业、医保、教育、菜篮子价格、养老 6 个假数据面板
- 数字人 WebGL 画布背景全透明，直接悬浮在大屏上，默认停靠右下角
- 页面面板数据以结构化形式随提问发给后端，注入 Qwen 系统提示词，模型只基于大屏数据回答
- 模型通过版本化 `avatar_response`（v2）消息返回台词与 `focus` 时间线事件
- 数字人按 focus 事件平滑走到对应面板旁，播放指向手势，面板同步高亮，讲解完自动回位
- 语音由阿里云 CosyVoice 合成、HeadAudio 实时驱动口型，密钥不进浏览器
- focus 目标在后端按请求面板 ID 白名单校验，非法目标自动剔除

[新窗口打开 Demo](/demos/livelihood-dashboard)
