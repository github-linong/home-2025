---
title: "图片主题色提取"
heroImage: "/heroes/demo/fe-image-getcolor-canvas.webp"
description: "用 Canvas 提取图片主题色。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/fe-image-getcolor-canvas.html"
legacyUrl: "/static/html/fe-image-getcolor-canvas.html"
category: "图形"
badge: "精选"
tags: ["legacy", "图形", "精选"]
---

## 简介

把图片绘制到 Canvas 后读取像素，提取主题色 / 主色调。常用于封面配色、UI 自适应背景等。

## 如何测试验证

1. 上传或选择一张色彩鲜明的图片。
2. 确认页面展示提取到的主色块或色值。
3. 换一张近白 / 近黑图片，观察算法是否仍给出合理结果。
4. 打开 DevTools，确认跨域图片未污染 Canvas（否则 getImageData 会抛 SecurityError）。

## 相关规范与文档

- [MDN: getImageData()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [MDN: CORS enabled images](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image)
- [MDN: CanvasSecurityError](https://developer.mozilla.org/en-US/docs/Web/HTML/CORS_enabled_image#security_and_tainted_canvases)
