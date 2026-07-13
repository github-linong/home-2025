---
title: "基于 Flex 实现两端对齐垂直布局"
description: "我是头部，我希望我不管大小屏幕都在最上面 我是内容，我希望我在屏幕的中间显示，我不希望我压住其他内容，我希望一屏可以展示这个页面 我是底部，我希望我可以据底，如果屏幕超出了，我滑动可见。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/flex-direction-column-sf.html"
legacyUrl: "/static/html/flex-direction-column-sf.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套"]
relatedPosts: ["sf-1190000037452855"]
---

## 简介

用 Flex column 实现垂直方向两端对齐 / 空间分配的基础版。系列共 4 个变体，便于对照。

## 如何测试验证

1. 调整容器高度，观察主轴两端对齐效果。
2. 增减子项数量，确认分布策略。
3. 与 .1 / .2 / .3 变体对比差异点。

## 相关规范与文档

- [MDN: flex-direction](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction)
- [MDN: justify-content](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)
- [CSS Flexible Box Layout](https://www.w3.org/TR/css-flexbox-1/)
