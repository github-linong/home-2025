---
title: "手机震动 vibrate"
heroImage: "/heroes/demo/h5-vibrate-navigator.webp"
description: "navigator.vibrate 震动反馈。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/h5-vibrate-navigator.html"
legacyUrl: "/static/html/h5-vibrate-navigator.html"
category: "移动端"
badge: "精选"
tags: ["legacy", "移动端", "精选"]
---

## 简介

演示 navigator.vibrate 震动反馈：短震、模式震动。仅部分 Android 浏览器支持良好。

## 如何测试验证

1. 在 Android Chrome 点击震动按钮，手机应震动。
2. 尝试模式数组如 `[200, 100, 200]`。
3. iOS Safari 通常不支持，确认有降级提示。
4. 传入 0 或空数组应停止震动。

## 相关规范与文档

- [MDN: Navigator.vibrate()](https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate)
- [W3C: Vibration API](https://www.w3.org/TR/vibration/)
