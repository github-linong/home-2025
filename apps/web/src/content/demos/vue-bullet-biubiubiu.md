---
title: "Vue 弹幕效果"
description: "Vue交互示例：Vue 弹幕效果。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/vue-bullet-biubiubiu.html"
legacyUrl: "/static/html/vue-bullet-biubiubiu.html"
category: "Vue"
badge: "博客配套"
tags: ["legacy", "Vue", "博客配套"]
relatedPosts: ["sf-1190000022549145"]
---

## 简介

Vue 实现弹幕效果：数据驱动弹幕列表与动画。可与原生弹幕页、bug 对比系列一起看。

## 如何测试验证

1. 发送弹幕，确认轨道滚动。
2. 高频发送时观察性能与重叠。
3. 切换路由或销毁组件，确认定时器 / rAF 已清理。

## 相关规范与文档

- [Vue: Transition](https://vuejs.org/guide/built-ins/transition.html)
- [MDN: requestAnimationFrame](https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame)
- [MDN: CSS transform](https://developer.mozilla.org/en-US/docs/Web/CSS/transform)
