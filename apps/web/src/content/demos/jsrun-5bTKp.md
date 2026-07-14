---
title: "Flex 蛇形走位布局"
description: "把列表按行切分后，奇数行用 flex 反向排列，模拟蛇形折返顺序。"
pubDate: "2021-09-09"
type: web
demoUrl: "/demos/jsrun/5bTKp.html"
legacyUrl: "https://jsrun.net/5bTKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "Vue", "布局"]
---

## 简介

Vue 将 1–18 拆成「首行 1 个 + 之后每行 4 个」。.list 使用 flex-wrap；:nth-child(2n+1) 设为 row-reverse（首行强制 row）。伪元素 after 标「左/右/下/上」提示折返方向，演示纯 CSS 控制阅读顺序的蛇皮走位。

## 如何测试验证

1. 打开页面查看多行灰色格子与方向文字
2. 对照 splitList：首行 1 项，其后每行最多 4 项
3. 确认奇数行视觉顺序与偶数行相反
4. 修改 list 长度（如 20）观察换行与末项「上」标记
5. 在开发者工具切换 flex-direction 验证机制

## 相关规范与文档

- [flex-direction](https://developer.mozilla.org/zh-CN/docs/Web/CSS/flex-direction)
- [:nth-child](https://developer.mozilla.org/zh-CN/docs/Web/CSS/:nth-child)
