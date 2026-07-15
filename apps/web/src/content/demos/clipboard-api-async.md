---
title: "异步 Clipboard API"
heroImage: "/heroes/demo/clipboard-api-async.webp"
description: "异步 Clipboard API 读写实验。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/clipboard-api-async.html"
legacyUrl: "/static/html/clipboard-api-async.html"
category: "交互"
badge: "精选"
tags: ["legacy", "交互", "精选"]
---

## 简介

异步 Clipboard API（navigator.clipboard）读写实验。相比 execCommand 更安全、可异步，但需权限与安全上下文。

## 如何测试验证

1. 在 HTTPS / localhost 点击「复制」，粘贴到记事本验证。
2. 点击「读取剪贴板」（需权限），确认能读到文本。
3. 在非安全上下文或无权限时，确认错误提示清晰。
4. 与旧版 execCommand("copy") Demo 对照兼容性。

## 相关规范与文档

- [MDN: Clipboard API](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard_API)
- [MDN: navigator.clipboard](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/clipboard)
- [W3C: Clipboard API and events](https://www.w3.org/TR/clipboard-apis/)
