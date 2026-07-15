---
title: "macOS PingFang 零宽文字测试"
heroImage: "/heroes/demo/sf-mac-pingfang-0-width.webp"
description: "复现/观察 PingFang SC 在特定字符上量测宽度为 0 的排障页。"
pubDate: "2025-12-22"
type: web
demoUrl: "/demos/html/sf-1010000047443095-mac-PingFang-0-width.html"
legacyUrl: "https://segmentfault.com/q/1010000047443095"
category: "CSS"
badge: "精选"
tags: ["精选", "legacy", "CSS", "字体"]
---

## 简介

针对 macOS 上 PingFang SC（苹方）部分字形或空白字符测量宽度异常（常表现为 0 宽）的对照页。用于解释文本截断、省略号、对齐错位等字体度量问题。在非 macOS 或无 PingFang 环境上对比结果可能不明显。

## 如何测试验证

1. 在 macOS Safari / Chrome 打开，按页内说明查看字符宽度读数。
2. 与系统其它中文字体对比，确认是否只在 PingFang 复现。
3. 将页面宽度缩放到窄屏，观察布局是否因 0 宽字形抖动。

## 相关规范与文档

- [SegmentFault 原问题](https://segmentfault.com/q/1010000047443095)
- [MDN: Element.getBoundingClientRect](https://developer.mozilla.org/zh-CN/docs/Web/API/Element/getBoundingClientRect)
