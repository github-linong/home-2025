---
title: "Fetch ReadableStream 与 React 打字机优化"
heroImage: "/heroes/demo/fetch-readablestream-typewriter-react.webp"
description: "用 fetch 读模型流式输出，对比 Naive setState 与 rAF 批处理对 React 提交次数的影响。"
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

模拟大模型 token 流：前端用 `fetch` + `ReadableStream.getReader()` + `TextDecoder` 边收边展示（打字机效果），并对比两种 React 更新策略：

1. **Naive**：每个网络 chunk 都 `setState`（commits ≈ reads）。
2. **rAF 批处理**：chunk 先写入 buffer，用 `requestAnimationFrame` 合并到每帧最多一次 React 更新。

数据源可选：

- **本地 mock**：浏览器内构造 `new Response(ReadableStream)`，无需后端。
- **真实接口**：`GET /api/demo/llm-stream`（api2），便于在 Network 面板观察分块传输。

## 如何测试验证

1. 打开 Demo，渲染策略选「Naive」，token 间隔设为 `5`，点「开始」。
2. 看 **React commits** 是否接近 **stream reads**。
3. 改成「rAF 批处理」再跑一轮：commits 应明显更少（通常远低于 reads）。
4. 数据源切到「真实 /api/demo/llm-stream」（需 api2 运行），在 Network 里确认响应为 `text/plain` 且逐步到达。
5. 生成中点「中止」，确认 `AbortController` 能停流。

## 相关规范与文档

- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [MDN: TextDecoder](https://developer.mozilla.org/en-US/docs/Web/API/TextDecoder)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [React: render and commit](https://react.dev/learn/render-and-commit)
