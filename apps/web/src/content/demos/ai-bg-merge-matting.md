---
title: "背景融合抠图"
heroImage: "/heroes/demo/ai-bg-merge-matting.webp"
description: "背景融合与抠图实验（云毕业证相关）。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/ai-bg-merge-matting.html"
legacyUrl: "/static/html/ai-bg-merge-matting.html"
category: "文件 IO"
badge: "精选"
tags: ["legacy", "文件 IO", "精选"]
---

## 简介

抠图后与背景合成的实验页（云毕业证相关能力探索）：结合分割结果与背景图做合成预览。

## 如何测试验证

1. 上传人像与背景图（或使用页面默认资源）。
2. 执行抠图 / 合成，检查对齐与缩放。
3. 导出结果图，确认透明通道处理正确。

## 相关规范与文档

- [MDN: Canvas drawImage](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)
- [MDN: HTMLImageElement.decode()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLImageElement/decode)
