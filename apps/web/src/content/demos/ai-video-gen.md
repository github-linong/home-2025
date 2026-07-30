---
title: "AI 视频生成 · DashScope"
heroImage: "/heroes/demo/ai-video-gen.webp"
description: "调用阿里云 DashScope 多种视频大模型，支持文生视频和图生视频，可调节分辨率、宽高比和时长。"
pubDate: "2026-07-30"
type: external
demoUrl: "/demos/video-gen"
category: "AI"
badge: "新作"
tags: ["AI", "DashScope", "通义万相", "视频生成", "文生视频", "图生视频", "Wan"]
---

调用阿里云 DashScope 的视频生成 API，通过自然语言描述或参考图片生成短视频。

## 支持模型

| 模型 | 类型 | 最高分辨率 | 时长 | 音频 |
|---|---|---|---|---|
| **Wan 2.7 T2V** | 文生视频 | 1080P | 2-15s | ✅ |
| **Wan 2.6 T2V** | 文生视频 | 1080P | 2-15s | ✅ |
| **Wanx 2.1 Turbo** | 文生视频 | 720P | 5s | ❌ |
| **Wanx 2.1 Plus** | 文生视频 | 720P | 5s | ❌ |
| **Wan 2.7 I2V** | 图生视频 | 1080P | 2-15s | ✅ |
| **Wan 2.6 I2V** | 图生视频 | 1080P | 2-15s | ✅ |
| **Wanx 2.1 I2V** | 图生视频 | 720P | 5s | ❌ |

## 技术实现

- 后端：Express + DashScope video-generation API（异步任务轮询）
- 轮询间隔 10 秒，最长等待 10 分钟
- 视频代理：服务端下载 MP4 并代理返回（100MB 上限）
- 前端：实时计时器 + 视频播放器 + 参数持久化

[打开 Demo](/demos/video-gen)
