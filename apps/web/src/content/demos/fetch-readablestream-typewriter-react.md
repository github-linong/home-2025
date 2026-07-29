---
title: "Fetch ReadableStream 与 React 打字机优化"
heroImage: "/heroes/demo/fetch-readablestream-typewriter-react.webp"
description: "ChatGPT 式对话页：真实 Qwen 流式输出 + 可配置打字机（Naive / rAF），配置在右侧 drawer。"
pubDate: "2026-07-16"
type: web
demoUrl: "/demos/html/fetch-readablestream-typewriter-react.html"
category: "实验"
badge: "精选"
tags: ["React", "ReadableStream", "Fetch", "流式输出", "性能"]
relatedPosts:
  - "ai-interview-100-part1-llm-python-prompt"
---

## 简介

对话页模拟日常 Chat 体验：底部输入、消息气泡、流式助手回复。底层仍是：

`fetch` → `response.body.getReader()` → `TextDecoder({ stream: true })` 边收边展示。

打字机相关配置点右上角「配置」打开 drawer：

1. **Naive**：每个网络 chunk 都 `setState`（commits ≈ reads）。
2. **rAF 批处理**：chunk 先写入 buffer，用 `requestAnimationFrame` 合并到每帧最多一次 React 更新。

数据源：

- **真实模型**（默认）：`POST /api/demo/chat-stream`，api2 代理 DashScope/Qwen，把上游 SSE 转成 `text/plain` 增量流。
- **本地 mock**：浏览器内构造 `ReadableStream`，可用 token 间隔拉开 Naive / rAF 对比。

> 注意：TalkingHead 使用的 `POST /api/demo/llm-stream` 是整包 JSON 数字人协议，与本 demo 的 chat 流式接口分离。

## 如何测试验证

1. 打开 Demo，直接提问或点建议卡片；助手气泡应逐字增长。
2. Network 确认 `chat-stream` 为 `text/plain` 且分块到达。
3. 点「配置」打开 drawer，切到「Naive」，再用「本地 mock」+ 间隔 `5ms` 跑一轮：commits 接近 reads。
4. 改回「rAF」：commits 应明显更少。
5. 生成中点停止按钮，确认 `AbortController` 能停流。

## 相关规范与文档

- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [MDN: TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [React: render and commit](https://react.dev/learn/render-and-commit)
