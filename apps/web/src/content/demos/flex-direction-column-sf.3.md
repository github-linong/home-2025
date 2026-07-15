---
title: "Flex 垂直布局 · 空白块 flex 分隔"
heroImage: "/heroes/demo/flex-direction-column-sf.3.webp"
description: "内容上下各插 flexempty（flex:1 1 20px），用可伸缩空白控制上下留白比例。"
pubDate: "2020-10-15"
type: web
demoUrl: "/demos/html/flex-direction-column-sf.3.html"
legacyUrl: "/static/html/flex-direction-column-sf.3.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套", "Flex"]
relatedPosts: ["sf-1190000037452855"]
---

## 简介

结构变成五段：`header` → 空白 → 内容 → 空白 → `footer`。空白块：

```css
#app .flexempty-base { flex: 1 1 20px; }
```

文章推荐方案：需要「下面留白更大」时，可把下方空白的 `flex-grow` 调大（如 `3`）。

## 与系列其它页的差异

- **vs `.1` / `.2`**：头底仍自然高度；伸缩完全交给青色空白块，内容区不被 `flex:1` 撑满。
- DOM 多了两个 `.flexempty`，背景 `#0ff` 便于观察。

## 如何测试验证

1. 看青色空白是否上下对称分配。
2. 改下方空白 `flex-grow`，确认内容上移。
3. 与博客结论对照：比单纯 `space-between` 更好调。

## 相关规范与文档

- [MDN: flex-grow](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-grow)
- [MDN: flex-basis](https://developer.mozilla.org/en-US/docs/Web/CSS/flex-basis)
