---
title: "html2canvas 邀请卡截图"
description: "图形交互示例：html2canvas 邀请卡截图。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/html2canvas-invite-vvmusic.html"
legacyUrl: "/static/html/html2canvas-invite-vvmusic.html"
category: "图形"
badge: "精选"
tags: ["legacy", "图形", "精选"]
---

## 简介

使用 html2canvas 将 DOM（邀请卡样式）渲染为图片，便于分享到社交应用。适合海报生成、分享图等场景。

## 如何测试验证

1. 打开页面，确认邀请卡 DOM 正常渲染。
2. 触发「生成图片 / 截图」，等待 canvas 输出。
3. 下载或长按保存，检查字体、图片、圆角是否丢失。
4. 对比跨域图片、外链字体是否导致空白或污染。

## 相关规范与文档

- [html2canvas 文档](https://html2canvas.hertzen.com/)
- [MDN: HTMLCanvasElement.toDataURL()](https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/toDataURL)
- [MDN: ForeignObjectRendering notes](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)

## 注意事项

- html2canvas 是启发式库，复杂 CSS（滤镜、部分字体）可能不完全一致。
