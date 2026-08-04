---
title: "Chrome 内置 AI LanguageDetector 测试"
heroImage: "/heroes/demo/language-detector.webp"
description: "基于 Chrome Built-In AI LanguageDetector API 的客户端语言检测 Demo，支持模型下载进度、置信度排序与多语言示例。"
pubDate: 2026-08-04
updatedDate: 2026-08-04
badge: "实验"
tags: ["chrome", "ai", "language-detection", "built-in-ai"]
type: "web"
category: "前端实验"
---

## 简介

一个用于测试 Chrome Built-In AI `LanguageDetector` 的交互式 Demo，直接在浏览器端完成多语言识别，无需调用远端模型。

## 如何测试验证

1. 使用支持 Built-In AI 的 Chromium 浏览器（Chrome / Edge，开启相关实验项）。
2. 访问 `/demos/language-detector/`。
3. 点击「初始化 / 下载模型」下载本地模型（首次需联网一次）。
4. 输入或选择示例文本，点击「检测语言」查看置信度排序结果。

## 相关规范与文档

- [Chrome Built-in AI](https://developer.chrome.com/docs/ai/built-in)
- [LanguageDetector API 草案](https://github.com/WICG/translation-api)
