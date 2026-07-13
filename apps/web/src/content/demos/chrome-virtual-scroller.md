---
title: "虚拟滚动实验"
description: "Chrome 虚拟滚动实验。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/chrome-virtual-scroller.html"
legacyUrl: "/static/html/chrome-virtual-scroller.html"
category: "前端实验"
badge: "精选"
tags: ["legacy", "实验", "精选"]
---

## 简介

虚拟滚动实验：只渲染可视区域附近的列表节点，降低长列表 DOM 开销。适合对照浏览器原生提案与自研方案。

## 如何测试验证

1. 滚动长列表，观察 DOM 节点数量是否保持在窗口附近。
2. 快速甩动滚动，检查白屏 / 闪烁。
3. 跳转到列表中部 / 底部，确认定位准确。
4. 打开 Performance 面板对比普通列表的 Scripting / Rendering。

## 相关规范与文档

- [MDN: Intersection Observer](https://developer.mozilla.org/en-US/docs/Web/API/Intersection_Observer_API)
- [Chrome: Virtual Scroller (blog)](https://developer.chrome.com/blog/virtual-scroller-element)
- [MDN: DocumentFragment](https://developer.mozilla.org/en-US/docs/Web/API/DocumentFragment)
