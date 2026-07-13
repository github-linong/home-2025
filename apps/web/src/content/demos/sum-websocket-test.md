---
title: "WebSocket 测试"
description: "WebSocket 联调测试页。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/sum-websocket-test.html"
legacyUrl: "/static/html/sum-websocket-test.html"
category: "WebSocket"
badge: "精选"
tags: ["legacy", "WebSocket", "精选"]
---

## 简介

WebSocket 联调测试页：连接、发送、接收与断线重连。用于后端 WS 服务的冒烟验证。

## 如何测试验证

1. 填写可访问的 WS / WSS 地址并连接。
2. 发送文本消息，确认回显或服务端响应。
3. 断开网络或关闭服务，观察 onclose / onerror。
4. 对比 ws:// 与 wss:// 在 HTTPS 页面下的混合内容限制。

## 相关规范与文档

- [MDN: WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [MDN: Writing WebSocket client applications](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications)
- [RFC 6455: The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
