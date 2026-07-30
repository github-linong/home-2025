---
title: "AI 文生图 · DashScope 多模型"
heroImage: "/heroes/demo/ai-image-gen.webp"
description: "调用阿里云 DashScope 多种大模型生成图片，支持参考图、风格预设、思考模式与高级参数。"
pubDate: "2026-07-29"
type: external
demoUrl: "/demos/image-gen"
category: "AI"
badge: "新作"
tags: ["AI", "DashScope", "通义万相", "文生图", "图片生成", "Qwen Image", "Z-Image"]
---

调用阿里云 DashScope 的多种文生图大模型，通过自然语言描述生成高质量图片。

## 支持模型

| 模型 | 特点 | 最高分辨率 |
|---|---|---|
| **Wan 2.7 Image Pro** | 最强画质，思考模式，支持参考图（4 张） | 4096×4096 (4K) |
| **Qwen Image 2.0** | 生成+编辑，擅长文字渲染，参考图（10 张） | 2048×2048 |
| **Z-Image Turbo** | 高性价比，照片级品质，快速生成 | 2048×2048 |
| **Wanx 2.1 Turbo** | 快速通用，智能提示词扩写 | ~2MP |
| **Wanx V1** | 经典款，9 种风格预设，参考图（1 张） | 1280×1280 |

## 功能特点

- **多模型切换**：前端动态加载模型列表与能力参数
- **参考图上传**：上传本地图片作为风格/内容参考（wan2.7 / qwen-image / wanx-v1）
- **风格预设**：摄影、动漫、油画、水彩、国画等 9 种风格（wanx-v1）
- **思考模式**：提升复杂指令的生成质量（wan2.7）
- **智能扩写**：自动优化提示词以获得更好效果
- **Seed 复现**：指定种子可复现相同结果
- **反向提示词**：排除不希望出现的内容
- **服务端代理**：API Key 仅在服务端，图片字节代理返回

## 技术实现

后端适配三种不同的 DashScope API 格式：
- **text2image API**（异步轮询）：wanx-v1、wanx2.1-t2i-turbo
- **image-generation API**（异步轮询）：wan2.7-image-pro
- **multimodal-generation API**（同步直返）：qwen-image-2.0、z-image-turbo

[打开 Demo](/demos/image-gen)
