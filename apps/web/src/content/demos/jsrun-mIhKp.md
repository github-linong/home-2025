---
title: "长标题省略与右侧图标宽度自适应"
heroImage: "/heroes/demo/jsrun-mIhKp.webp"
description: "对比 Flex、BFC/float 等方案：长文 ellipsis，右侧图标区宽度随数量自适应。"
pubDate: "2018-10-22"
type: web
demoUrl: "/demos/jsrun/mIhKp.html"
legacyUrl: "https://jsrun.net/mIhKp"
category: "CSS"
badge: "精选"
tags: ["jsrun", "legacy", "精选", "CSS", "布局"]
---

## 简介

三组方案并排：Flex + text-overflow:ellipsis；inline-block/BFC 下图标 float:right；Flex 中图标白空间 nowrap。演示「文字可变省略、右侧徽章宽度随张数变化」。大量图标指向 jsrun CDN，常裂图。

## 如何测试验证

1. 对比第一组：长文+两图 / 长文+一图 / 短文+两图
2. 看长文是否单行省略，图标是否仍靠右可见
3. 再看中间 BFC/float 组图标是否靠右、文字是否省略
4. 看第三组 flex 图标容器在一图/两图时宽度差
5. 缩小 iframe 宽度，确认省略与挤占行为

## 相关规范与文档

- [MDN: text-overflow](https://developer.mozilla.org/zh-CN/docs/Web/CSS/text-overflow)
- [MDN: flex](https://developer.mozilla.org/zh-CN/docs/Web/CSS/flex)
- [CodePen 相关笔](https://codepen.io/linong/pen/aRjwbe)

## 注意

logo 多来自 cdn.jsrun.top / jsrun.net，易失效导致只见裂图；纯 CSS，无脚本。
