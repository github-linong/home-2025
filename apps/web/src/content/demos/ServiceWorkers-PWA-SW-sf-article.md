---
title: "Service Worker / PWA"
description: "Service Worker / PWA 配套演示。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/ServiceWorkers-PWA-SW-sf-article.html"
legacyUrl: "/static/html/ServiceWorkers-PWA-SW-sf-article.html"
category: "PWA"
badge: "精选"
tags: ["legacy", "PWA", "精选"]
---

## 简介

Service Worker / PWA 相关演示：注册 SW、缓存策略与离线访问。对应思否文章配套实验。

## 如何测试验证

1. HTTPS / localhost 打开，确认 SW 注册成功（Application → Service Workers）。
2. 刷新后查看 Cache Storage 是否写入资源。
3. 离线模式重新加载，页面是否仍可打开。
4. 更新 SW 后验证 skipWaiting / clients.claim 行为。

## 相关规范与文档

- [MDN: Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [MDN: Using Service Workers](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers)
- [W3C: Service Workers](https://www.w3.org/TR/service-workers/)
- [Web App Manifest](https://www.w3.org/TR/appmanifest/)
