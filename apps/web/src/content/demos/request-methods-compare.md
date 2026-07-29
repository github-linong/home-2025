---
title: "请求方式对比 Demo"
heroImage: "/heroes/demo/request-methods-compare.webp"
description: "多卡片对比 XHR、Fetch、SSE、WebSocket、WebTransport、HTTP/2 Push、JSONP、Beacon、Image 等请求技术与单次/流式/长轮询/全双工/只发不收场景。"
pubDate: "2026-07-29"
type: web
demoUrl: "/demos/html/request-methods-compare.html"
category: "实验"
badge: "精选"
tags: ["XHR", "Fetch", "SSE", "WebSocket", "WebTransport", "HTTP/2 Push", "JSONP", "Beacon", "长轮询", "流式"]
---

## 简介

这个 demo 用「技术 × 业务场景」两个维度对比浏览器中常见的数据请求方式：

- **技术维度**：XMLHttpRequest、Fetch、EventSource、WebSocket、WebTransport、HTTP/2 Push、JSONP、Beacon、Image
- **场景维度**：单次请求、流式接收、长轮询、全双工、只发不收

页面顶部有对照矩阵，下方卡片按场景分组；WebTransport / HTTP/2 Push 在本机 Express 环境下以**能力探测**为主（诚实展示不可用原因）。

## 卡片说明

### 单次请求

| 卡片 | 关键 API |
|---|---|
| XHR 单次 | `new XMLHttpRequest()` + `onload` |
| Fetch 单次 | `fetch().then(r => r.json())` |
| JSONP 单次 | 动态 `<script>` 注入 + 全局回调 |

### 流式接收

| 卡片 | 关键 API |
|---|---|
| XHR 流式 | **合理设计**：`text`/`""` + 服务端一次 ~2KB prelude + `\n` 分帧（`?design=1`）+ `readyState=3` 轮询；非「假流」 |
| XHR Blob | `responseType=blob`：`progress.loaded` 会涨，但 `xhr.response` 在结束前为 `null`，**不能**提前读正文 |
| Fetch 流式 | `response.body.getReader()` + `TextDecoder` |
| SSE | `new EventSource()` + `onmessage` |
| iframe 流式 | Forever Frame：隐藏 iframe 加载 chunked HTML，逐步执行 `<script>parent.cb(word)</script>` |
| HTTP/2 Push | **已过时**：探测 `Link: rel=preload` 替代方案与 Performance push timing（通常为 0） |

### 长轮询

客户端收到响应后立即发起下一次请求，模拟服务器推送（SSE 出现前的常见方案）。

| 卡片 | 风格 |
|---|---|
| XHR 长轮询 | 回调递归 |
| Fetch 长轮询 | `async/await` 循环 |

### 全双工 — WebSocket / WebTransport

| 卡片 | 说明 |
|---|---|
| WebSocket | 本机可用：握手后逐词 push |
| WebTransport | 需 HTTPS + HTTP/3；api2 为 HTTP/1.1 Express，卡片做 `typeof WebTransport` + 连接尝试并展示失败原因 |

### 只发不收 — Beacon / Image

| 卡片 | 关键 API | 数据放哪 | 能读响应吗 |
|---|---|---|---|
| Beacon | `navigator.sendBeacon()` | POST body | 否（只知是否入队） |
| Image 像素 | `new Image(); img.src = url` | URL query | 否（只有 onload/onerror；响应是 1×1 GIF） |

`img` 像素点是更老的埋点手段：兼容好、只能 GET、有长度限制；`sendBeacon` 更适合卸载时可靠上报且可 POST。

## 页面如何看懂数据效果

每张卡片分三层：

1. **实时数据区**：真正展示收到的内容
   - 单次 / JSONP / Beacon → 完整 JSON payload 块
   - 流式 / WebSocket → 每个词以 chip 动画逐个弹出，最新一块高亮
   - 长轮询 → 等待条 + 每轮 `#seq 词` 列表（挂起等待时有滑动进度条）
2. **事件时间线**：`+Nms` 时间戳日志，记录「请求开始 / 收到 chunk / 等待挂起 / 完成」
3. **底部指标**：耗时、块/事件数、字节数（运行中实时刷新）

## 后端接口

接口挂载在 `GET /api/demo/compare/...`，默认走本地 mock（无需 API Key）。顶部切换「LLM」后，带 `X-Source: llm` 或 `?source=llm`（EventSource / JSONP / iframe / WS）的 once / stream / sse / jsonp / iframe-stream / ws 会代理 DashScope；未配置 `DASHSCOPE_API_KEY` 时返回 503。长轮询与 Beacon / pixel 始终 mock。

| 路径 | 方法 | 说明 |
|---|---|---|
| `/once` | GET | 单次 JSON；LLM 时汇总完整回复 |
| `/stream` | GET | 分块 plain-text，`?delay=ms`；LLM 时按 token 写出 |
| `/sse` | GET | text/event-stream；LLM 用 `?source=llm` |
| `/iframe-stream` | GET | Forever Frame：chunked HTML + `<script>` 回调 |
| `/long-poll` | GET | 延迟 1.5s 后返回，`?seq=N`（始终 mock） |
| `/jsonp` | GET | `?callback=cb`；LLM 用 `?source=llm` |
| `/beacon` | POST | 204 No Content |
| `/pixel` | GET | 1×1 GIF（`<img src>` 埋点） |
| `/capabilities` | GET | WebTransport / H2 Push / LLM 配置说明 |
| `/h2-push` | GET | `Link: rel=preload` 示意（非真 Push） |
| `/ws` | WS Upgrade | WebSocket，逐词 push；LLM 用 `?source=llm` |

## 如何测试验证

1. 打开 demo，点「▶ 全部运行」，观察各卡片并发执行。
2. 对比「XHR 流式」和「Fetch 流式」：两者访问同一 `/stream` 接口，但 API 完全不同。
3. 对比「XHR 长轮询」和「Fetch 长轮询」：观察两者的代码风格差异（回调 vs async/await），耗时相近。
4. 拉大延迟到 150ms，再跑流式和 SSE，观察块数/耗时变化。
5. Network 面板可见：`/stream` 为 Transfer-Encoding: chunked；`/sse` 为 text/event-stream；`/ws` 为 101 Switching Protocols。

## 相关规范与文档

- [MDN: XMLHttpRequest](https://developer.mozilla.org/en-US/docs/Web/API/XMLHttpRequest)
- [MDN: Fetch API](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API)
- [MDN: Using readable streams](https://developer.mozilla.org/en-US/docs/Web/API/Streams_API/Using_readable_streams)
- [MDN: EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource)
- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MDN: navigator.sendBeacon](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/sendBeacon)
- [RFC 6455: WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455)
