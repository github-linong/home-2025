---
title: "Canvas 刮刮卡"
description: "图形交互示例：Canvas 刮刮卡。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/canvas-active-h5-scratchCard.html"
legacyUrl: "/static/html/canvas-active-h5-scratchCard.html"
category: "图形"
badge: "精选"
tags: ["legacy", "图形", "精选"]
---

## 简介

Canvas 实现的刮刮卡变体，强调擦除合成模式（destination-out）与触点半径。可与 DOM 版刮刮卡对照。

## 如何测试验证

1. 刮开涂层，确认边缘平滑。
2. 快速刮动时不应丢点。
3. 完成后重置，涂层应重新覆盖。

## 相关规范与文档

- [MDN: CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)
- [MDN: PointerEvent](https://developer.mozilla.org/en-US/docs/Web/API/PointerEvent)
