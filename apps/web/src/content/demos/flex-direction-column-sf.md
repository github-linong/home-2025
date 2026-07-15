---
title: "Flex 垂直布局 · 基础 column"
heroImage: "/heroes/demo/flex-direction-column-sf.webp"
description: "仅 display:flex + flex-direction:column。博客系列起点，尚未做两端对齐或撑开。"
pubDate: "2020-10-15"
type: web
demoUrl: "/demos/html/flex-direction-column-sf.html"
legacyUrl: "/static/html/flex-direction-column-sf.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套", "Flex"]
relatedPosts: ["sf-1190000037452855"]
---

## 简介

配套文章《基于 Flex 实现两端对齐垂直布局》的**基础版**：header / section / footer 纵向排列，容器用 `min-height` 模拟一屏。

本页尚未加 `justify-content` 或 `flex: 1`，后续 `.1` / `.2` / `.3` 在此之上逐步加策略。

## 与系列其它页的差异

| 文件 | 关键点 |
|------|--------|
| 本页 | 只有 column，不做空间分配 |
| `.1` | `#app { justify-content: space-between }` |
| `.2` | `section { flex: 1; display:flex; align-items:center }` |
| `.3` | 内容上下各插一块 `flex: 1 1 20px` 空白 |

## 如何测试验证

1. 调浏览器高度，看头/内容/底是否仍贴在一起（本页会）。
2. 打开 `.1` 对比两端对齐效果。
3. 对照博客 [sf-1190000037452855](/blog/sf-1190000037452855)。

## 相关规范与文档

- [MDN: flex-direction](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-direction)
- [MDN: justify-content](https://developer.mozilla.org/en-US/docs/Web/CSS/justify-content)
