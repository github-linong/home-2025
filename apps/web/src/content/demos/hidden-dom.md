---
title: "隐藏 DOM 元素测试"
description: "隐藏页面元素测试DEMO 切换 transition: #"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/hidden-dom.html"
legacyUrl: "/static/html/hidden-dom.html"
category: "前端实验"
badge: "博客配套"
tags: ["legacy", "实验", "博客配套"]
relatedPosts: ["sf-1190000038308970"]
---

## 简介

隐藏 DOM 元素的多种方式对比（display / visibility / opacity / 移出视口等）及其对布局、事件、可访问性的影响。

## 如何测试验证

1. 切换不同隐藏方式，观察是否仍占位。
2. 尝试点击被隐藏元素，确认是否还能收到事件。
3. 用屏幕阅读器或 Accessibility 面板检查可见性。
4. 测量 display:none 与 visibility:hidden 的重排差异。

## 相关规范与文档

- [MDN: display](https://developer.mozilla.org/en-US/docs/Web/CSS/display)
- [MDN: visibility](https://developer.mozilla.org/en-US/docs/Web/CSS/visibility)
- [MDN: aria-hidden](https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/Reference/Attributes/aria-hidden)
