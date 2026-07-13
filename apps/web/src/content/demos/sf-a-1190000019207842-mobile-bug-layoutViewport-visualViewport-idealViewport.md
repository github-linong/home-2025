---
title: "移动端三种 Viewport 对比"
description: "https://segmentfault.com/a/1190000019207842 关于移动端适配，你必须要知道的 width: 100px width: 300px"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/sf-a-1190000019207842-mobile-bug-layoutViewport-visualViewport-idealViewport.html"
legacyUrl: "/static/html/sf-a-1190000019207842-mobile-bug-layoutViewport-visualViewport-idealViewport.html"
category: "思否配套"
badge: "精选"
tags: ["legacy", "SegmentFault", "精选"]
---

## 简介

对比移动端 layout viewport、visual viewport 与 ideal viewport：理解缩放、地址栏显隐对视口尺寸的影响。思否「移动端适配」系列配套页。

## 如何测试验证

1. 手机打开，对比页面打印的各 viewport 宽度。
2. 双指缩放，观察 visualViewport 变化。
3. 滚动使地址栏显隐，记录 innerHeight / visualViewport.height。
4. 切换横竖屏，确认 meta viewport 配置影响。

## 相关规范与文档

- [MDN: Visual Viewport API](https://developer.mozilla.org/en-US/docs/Web/API/Visual_Viewport_API)
- [MDN: Using the viewport meta tag](https://developer.mozilla.org/en-US/docs/Web/HTML/Viewport_meta_tag)
- [W3C: CSS Device Adaptation](https://www.w3.org/TR/css-device-adapt-1/)
