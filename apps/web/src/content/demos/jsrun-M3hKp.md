---
title: "Canvas 鼠标探照灯效果"
heroImage: "/heroes/demo/jsrun-M3hKp.webp"
description: "用 getImageData/putImageData 与径向渐变描边，随鼠标移动模拟探照灯遮罩。"
pubDate: "2018-10-29"
type: web
demoUrl: "/demos/jsrun/M3hKp.html"
legacyUrl: "https://jsrun.net/M3hKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "交互", "图形"]
---

## 简介

Canvas 加载跨域 logo 图后 drawImage，再 getImageData。mousemove 时先 putImageData 还原，再以鼠标为圆心创建径向透明到黑色的粗线圆弧，形成周围压暗、中心相对透出的探照灯效果。HTML 标题写「视口操作，DOM」，实现主体是 Canvas 像素与渐变描边，而非 DOM 视口 API。

## 如何测试验证

1. 等待图片绘制到 canvas（需 logo 图可跨域加载）
2. 在页面上移动鼠标，观察探照灯中心跟随
3. 理解 putImage 中 createRadialGradient 与 arc stroke 的叠加
4. 若画面空白，检查跨域与图片 URL 是否可访问

## 相关规范与文档

- [CanvasRenderingContext2D.getImageData](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/getImageData)
- [createRadialGradient](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/createRadialGradient)

## 注意

依赖 http://cdn.jsrun.net 上的 logo；CORS 失败时 getImageData 会抛错。style 标签内误写了一句中文错误提示文本。
