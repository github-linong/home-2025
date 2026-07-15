---
title: "浏览器端人脸识别"
heroImage: "/heroes/demo/face-api-browser.webp"
description: "浏览器端 face-api.js 人脸识别。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/face-api-browser.html"
legacyUrl: "/static/html/face-api-browser.html"
category: "文件 IO"
badge: "精选"
tags: ["legacy", "文件 IO", "精选"]
---

## 简介

基于 face-api.js 的浏览器端人脸检测 / 识别 Demo：模型在前端加载，不依赖服务端推理。适合理解 Web 端 ML、模型体积与性能权衡。

## 如何测试验证

1. 首次打开需等待模型加载（注意网络与体积）。
2. 上传图片或开启摄像头，确认能框出人脸。
3. 观察 FPS / 耗时；低端机可换轻量模型。
4. 断网后再次打开，确认缓存策略是否可用。

## 相关规范与文档

- [face-api.js (GitHub)](https://github.com/justadudewhohacks/face-api.js)
- [MDN: Web Workers](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API)
- [MDN: WebGL / GPU hints](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API)
