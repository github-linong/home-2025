---
title: "Canvas 圆弧绘制太极八卦图"
description: "用多次 arc + fill 拼接半圆与阴阳鱼眼，在 canvas 上画出太极图。"
pubDate: "2018-09-29"
type: web
demoUrl: "/demos/jsrun/aXhKp.html"
legacyUrl: "https://jsrun.net/aXhKp"
category: "图形"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "Canvas", "图形"]
---

## 简介

在 300×300 canvas 上用 beginPath/arc/fill 绘制：大圆上下半色、小半圆阴阳区、最小圆点鱼眼。展示弧段起止角（如 Math.PI/2）与填充色切换；第二块 canvas 脚本已注释，仅第一块生效。

## 如何测试验证

1. 打开页面查看左侧 canvas 是否出现红黑太极图
2. 对照源码识别大圆、S 形半圆与两个小圆点
3. 用开发者工具改 _r 或填充色后刷新对比
4. 确认第二块 canvas 为空（绘制代码已注释）
5. 缩放窗口确认为位图，非响应式矢量

## 相关规范与文档

- [MDN: CanvasRenderingContext2D.arc](https://developer.mozilla.org/zh-CN/docs/Web/API/CanvasRenderingContext2D/arc)
- [MDN: Canvas 教程](https://developer.mozilla.org/zh-CN/docs/Web/API/Canvas_API/Tutorial)

## 注意

静态绘制，无动画或交互；第二 canvas 未启用。
