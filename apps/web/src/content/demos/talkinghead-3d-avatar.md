---
title: "纯浏览器 3D 数字人 · TalkingHead"
description: "3D 数字人在浏览器本地渲染，百炼 Qwen 编排中文台词与多段手势，MotionEngine 配合 CosyVoice 音频连续表演。"
pubDate: "2026-07-17"
heroImage: "/heroes/demo/talkinghead-3d-avatar.webp"
type: external
demoUrl: "/demos/talkinghead-browser"
category: "AI"
badge: "新作"
tags: ["AI", "数字人", "3D", "WebGL", "语音交互", "TTS"]
---

基于开源 TalkingHead（MIT）引擎的纯浏览器 3D 数字人 Demo。

- 约 14 MB 的 Avaturn 照片级写实形象在本机浏览器 WebGL 渲染，无云端视频流
- 三点光照（暖主光 + 低环境光 + 冷轮廓光）配合 ACES tone mapping 提升真实感
- 语音识别使用浏览器内置 SpeechRecognition（建议 Chrome / Edge）
- 语音播报由阿里云 CosyVoice 合成，经本站后端安全代理，密钥不进浏览器
- HeadAudio 在浏览器内实时分析 CosyVoice 音频并驱动 Oculus viseme，无需中文转录或时间戳
- HeadAudio 不可用时自动降级为音频能量近似口型；CosyVoice 不可用时降级为浏览器 TTS
- 中文提问由本站后端安全代理给百炼 Qwen，并将模型输出解析为回答与 MotionEngine 白名单动作时间线
- 使用版本化 `avatar_response` 消息区分语音内容与可扩展的时间线事件
- 支持挥手、左右抬手、指向、点赞、点头、摇头、鼓掌、思考和庆祝等连续动作
- 全身视角展示，支持向左右侧步走动并自动回位，以及原地 360° 转身

[新窗口打开 Demo](/demos/talkinghead-browser)
