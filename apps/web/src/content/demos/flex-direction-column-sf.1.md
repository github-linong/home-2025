---
title: "Flex 垂直布局 · space-between"
description: "在 column 基础上加 justify-content: space-between，头底两端对齐；微调位置较难。"
pubDate: "2019-06-01"
type: web
demoUrl: "/demos/html/flex-direction-column-sf.1.html"
legacyUrl: "/static/html/flex-direction-column-sf.1.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套", "Flex"]
relatedPosts: ["sf-1190000037452855"]
---

## 简介

相对基础版，关键多了一行：

```css
#app { justify-content: space-between; }
```

头在上、底在下、中间块被推开。文章里也对比了 `space-around` / `space-evenly`。

## 与系列其它页的差异

- **vs 基础版**：主轴方向开始分配剩余空间。
- **vs `.2`**：本页靠容器 `justify-content`；`.2` 靠中间 `section` 自己 `flex:1` 撑开。
- **vs `.3`**：本页不能单独调「上空白 vs 下空白」比例；`.3` 用两块空白 flex 项更灵活。

## 如何测试验证

1. 与基础版并排，看背景色/间距分布。
2. 改 `min-height`，确认仍两端贴齐。
3. 想微调内容偏上时，体会本方案不好控（文章结论）。

## 相关规范与文档

- [MDN: justify-content](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)
- [MDN: CSS Flexible Box Layout](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_flexible_box_layout)
