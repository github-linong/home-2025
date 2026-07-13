---
title: "图片封面裁剪 Canvas"
description: "file 读 blob img 加载 blob img.onload 获取基本信息，渲染界面"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/demo-image-cover-cut-canvas.html"
legacyUrl: "/static/html/demo-image-cover-cut-canvas.html"
category: "图形/媒体"
badge: "精选"
tags: ["legacy", "图形", "精选"]
---

## 简介

图片封面裁剪 Demo：在 Canvas 上框选 / 缩放区域并输出裁剪结果。适合头像上传、封面图裁切等交互。

## 如何测试验证

1. 选择本地图片，确认预览加载成功。
2. 拖动或缩放裁剪框，实时预览裁剪区域。
3. 确认输出尺寸符合预期（宽高比、最大边长）。
4. 在高 DPR 屏幕检查导出图是否模糊。

## 相关规范与文档

- [MDN: drawImage()](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/drawImage)
- [MDN: FileReader](https://developer.mozilla.org/en-US/docs/Web/API/FileReader)
- [MDN: HTMLInputElement.files](https://developer.mozilla.org/en-US/docs/Web/API/HTMLInputElement/files)
