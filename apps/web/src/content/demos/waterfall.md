---
title: "瀑布流布局"
description: "CSS 布局交互示例：瀑布流布局。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/waterfall.html"
legacyUrl: "/static/html/waterfall.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套"]
relatedPosts: ["sf-1190000040345879"]
---

## 简介

瀑布流（Masonry）布局 Demo：多列等高错落排布图片或卡片。配套文章对比了多种 JS 方案与 CSS 尝试，本页为可运行演示。

## 如何测试验证

1. 打开页面，确认卡片按列错落排列、无明显大面积空白。
2. 缩放窗口宽度，观察列数与重排是否正确。
3. 滚动加载更多（若支持），检查插入后布局是否错乱。
4. 打开 DevTools 对比 reflow 频率，理解 JS 测高方案的成本。

## 相关规范与文档

- [MDN: CSS Multi-column Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_multicol_layout)
- [MDN: CSS Grid Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_grid_layout)
- [MDN: getBoundingClientRect()](https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect)
