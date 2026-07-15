---
title: "Flex 垂直布局 · section flex:1 居中"
heroImage: "/heroes/demo/flex-direction-column-sf.2.webp"
description: "中间 section 用 flex:1 撑开，并 display:flex + align-items:center 让内容垂直居中。"
pubDate: "2020-10-15"
type: web
demoUrl: "/demos/html/flex-direction-column-sf.2.html"
legacyUrl: "/static/html/flex-direction-column-sf.2.html"
category: "CSS"
badge: "博客配套"
tags: ["legacy", "CSS", "博客配套", "Flex"]
relatedPosts: ["sf-1190000037452855"]
---

## 简介

相对 `.1`，不再用 `justify-content: space-between`，改为：

```css
#app section {
  flex: 1;
  display: flex;
  align-items: center;
}
```

中间区域吃掉剩余高度，内容在该区域内垂直居中。文章提醒：看背景色就能和 `space-between` 方案区分开。

## 与系列其它页的差异

- **vs `.1`**：剩余空间落在绿色 `section` 上，而不是三块之间的「缝」。
- **vs `.3`**：本页只有一块可伸缩区域；`.3` 把伸缩拆成上下两块空白，内容块本身不 `flex:1`。

## 如何测试验证

1. 对比 `.1`：绿块是否铺满中间。
2. 增减中间文案行数，看是否仍居中且不压头底。
3. 高度不足时是否出现整体滚动。

## 相关规范与文档

- [MDN: flex](https://developer.mozilla.org/en-US/docs/Web/CSS/flex)
- [MDN: align-items](https://developer.mozilla.org/en-US/docs/Web/CSS/align-items)
