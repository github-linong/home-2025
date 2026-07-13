---
title: "Canvas 手写签名"
description: "Canvas 手写签名，支持清空与导出。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/canvas-draw-signature.html"
legacyUrl: "/static/html/canvas-draw-signature.html"
category: "图形/媒体"
badge: "精选"
tags: ["legacy", "图形", "精选"]
---

## 简介

基于 Canvas 的手写签名板：监听 pointer / touch / mouse 事件绘制路径，支持清空与导出图片。适合移动端签名、电子协议等场景。

## 如何测试验证

1. 在画布上用鼠标或手指书写，确认线条跟手、无明显断点。
2. 点击清空，画布应恢复空白。
3. 导出为 PNG / DataURL，在新标签页或 img 中预览。
4. 旋转手机或缩放窗口，检查坐标换算是否错位（devicePixelRatio）。

## 相关规范与文档

- [MDN: CanvasRenderingContext2D](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)
- [MDN: Pointer events](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_events)
- [W3C: HTML Canvas 2D Context](https://www.w3.org/TR/2dcontext/)
