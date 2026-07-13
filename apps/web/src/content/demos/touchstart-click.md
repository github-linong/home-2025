---
title: "Touch 击穿与 300ms 延迟"
description: "交互交互示例：Touch 击穿与 300ms 延迟。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/touchstart-click.html"
legacyUrl: "/static/html/touchstart-click.html"
category: "交互"
badge: "博客配套"
tags: ["legacy", "交互", "博客配套"]
relatedPosts: ["sf-1190000022736770"]
---

## 简介

移动端「击穿」与 300ms 点击延迟相关演示：touchstart / touchend 与 click 的顺序、以及穿透到下层元素的问题。

## 如何测试验证

1. 在真机或 DevTools 移动模式下点击覆盖层。
2. 观察 touch 与 click 触发顺序及是否触发下层链接。
3. 对比加 touch-action / fastclick 类方案后的行为。
4. 快速连续点击，检查是否出现双击放大或误触。

## 相关规范与文档

- [MDN: Touch events](https://developer.mozilla.org/en-US/docs/Web/API/Touch_events)
- [MDN: click event](https://developer.mozilla.org/en-US/docs/Web/API/Element/click_event)
- [MDN: touch-action](https://developer.mozilla.org/en-US/docs/Web/CSS/touch-action)
