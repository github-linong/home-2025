---
title: "原生弹幕效果"
description: "原生弹幕滚动效果。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/barrage-bullet-screen-biubiubiu.html"
legacyUrl: "/static/html/barrage-bullet-screen-biubiubiu.html"
category: "实验"
badge: "精选"
tags: ["legacy", "实验", "精选"]
---

## 简介

原生实现的弹幕滚动效果：弹幕轨道、速度、碰撞避让等。不依赖 Vue，便于对照框架版弹幕实现。

## 如何测试验证

1. 输入文案发送弹幕，观察从右向左滚动。
2. 连续发送多条，检查轨道是否重叠过度。
3. 切换页面可见性（切后台再回来），观察动画是否卡顿或堆积。
4. 调整窗口宽度，确认速度 / 路程换算合理。

## 相关规范与文档

- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [MDN: CSS transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
- [MDN: Web Animations API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Animations_API)
